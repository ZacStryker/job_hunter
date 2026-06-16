import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { messages, gmailLabelMappings } from '../../db/schema'
import { getAccessToken } from '../lib/gmail-oauth'
import { BLOCKED_SENDERS } from './email-fetch-service'

interface GmailHeader {
  name: string
  value: string
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId?: string }>
  nextPageToken?: string
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

// How far back to sync. The gmail.metadata scope forbids the messages.list `q`
// parameter, so we can't pass `newer_than:30d` to the API — instead we page
// newest-first and stop once a message falls outside this window.
const SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

async function gmailGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Gmail API request failed with status ${res.status}`)
  return (await res.json()) as T
}

export async function fetchAndStoreGmail(refreshToken: string, userId: number): Promise<{ added: number }> {
  const mappings = db
    .select({ label: gmailLabelMappings.label, type: gmailLabelMappings.jobStatus })
    .from(gmailLabelMappings)
    .where(eq(gmailLabelMappings.userId, userId))
    .all()

  if (mappings.length === 0) return { added: 0 }

  const accessToken = await getAccessToken(refreshToken)

  const labelsResponse = await gmailGet<{ labels?: Array<{ id: string; name: string }> }>(
    `${GMAIL_API}/labels`,
    accessToken,
  )
  const labelIdByName = new Map((labelsResponse.labels ?? []).map((l) => [l.name, l.id]))

  const existingRows = db
    .select({ uid: messages.uid, receivedAt: messages.receivedAt })
    .from(messages)
    .where(eq(messages.userId, userId))
    .all()
  const existingUids = new Set(existingRows.map((r) => r.uid))
  // Stored received dates let us decide the 30-day cutoff for already-synced
  // messages without spending a metadata GET on them.
  const receivedAtByUid = new Map(existingRows.map((r) => [r.uid, r.receivedAt]))

  const existingByMessageId = new Map(
    db.select({ id: messages.id, messageId: messages.messageId, type: messages.type })
      .from(messages)
      .where(eq(messages.userId, userId))
      .all()
      .filter((r) => r.messageId !== null)
      .map((r) => [r.messageId as string, { id: r.id, type: r.type }]),
  )

  let added = 0
  const cutoffMs = Date.now() - SYNC_WINDOW_MS

  for (const mapping of mappings) {
    const labelId = labelIdByName.get(mapping.label)
    if (!labelId) continue // label no longer exists on this account — skip (IMAP missing-folder parity)

    let pageToken: string | undefined
    let reachedCutoff = false
    do {
      const params = new URLSearchParams({ labelIds: labelId })
      if (pageToken) params.set('pageToken', pageToken)
      const page = await gmailGet<GmailListResponse>(`${GMAIL_API}/messages?${params.toString()}`, accessToken)

      // Gmail returns messages newest-first, so once we cross the cutoff every
      // remaining message is older too — stop paging this label.
      for (const stub of page.messages ?? []) {
        const uid = `gmail:${stub.id}`

        // Already synced: use the stored date to detect the cutoff without a GET.
        if (existingUids.has(uid)) {
          const knownMs = Date.parse(receivedAtByUid.get(uid) ?? '')
          if (Number.isFinite(knownMs) && knownMs < cutoffMs) { reachedCutoff = true; break }
          continue
        }

        const detail = await gmailGet<{ internalDate?: string; payload?: { headers?: GmailHeader[] } }>(
          `${GMAIL_API}/messages/${stub.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
          accessToken,
        )

        const internalMs = detail.internalDate ? Number(detail.internalDate) : NaN
        // Past the window — stop here (treat an unparseable date as in-window).
        if (Number.isFinite(internalMs) && internalMs < cutoffMs) { reachedCutoff = true; break }

        const headers = detail.payload?.headers ?? []
        const headerValue = (name: string) => headers.find((h) => h.name?.toLowerCase() === name)?.value
        const fromAddress = headerValue('from') ?? ''
        const subject = headerValue('subject') ?? ''
        const msgId = headerValue('message-id') ?? null
        const receivedAt = Number.isFinite(internalMs)
          ? new Date(internalMs).toISOString()
          : new Date().toISOString()

        if (BLOCKED_SENDERS.some((s) => fromAddress.includes(s))) continue

        if (msgId !== null && existingByMessageId.has(msgId)) {
          const existing = existingByMessageId.get(msgId)!
          const updates: Partial<typeof messages.$inferInsert> = { uid }
          if (existing.type === null) updates.type = mapping.type
          db.update(messages).set(updates).where(eq(messages.id, existing.id)).run()
          existingUids.add(uid)
          receivedAtByUid.set(uid, receivedAt)
          continue
        }

        db.insert(messages)
          .values({ uid, messageId: msgId, receivedAt, fromAddress, subject, type: mapping.type, userId })
          .onConflictDoNothing()
          .run()
        if (msgId !== null) existingByMessageId.set(msgId, { id: 0, type: mapping.type })
        existingUids.add(uid)
        receivedAtByUid.set(uid, receivedAt)
        added++
      }

      pageToken = reachedCutoff ? undefined : page.nextPageToken
    } while (pageToken)
  }

  return { added }
}
