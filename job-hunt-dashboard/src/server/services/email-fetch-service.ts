import { ImapFlow } from 'imapflow'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { messages } from '../../db/schema'
export interface ImapCredentials {
  host: string
  user: string
  pass: string
}

const BLOCKED_SENDERS = ['zac@zacstryker.com', 'indeedapply@indeed.com']

const FOLDERS: Array<{ name: string; type: string | null }> = [
  { name: 'INBOX', type: null },
  { name: 'INBOX/Submitted', type: 'Submitted' },
  { name: 'INBOX/Screening', type: 'Screening' },
  { name: 'INBOX/Rejected', type: 'Rejected' },
  { name: 'INBOX/Other', type: 'Other' },
  { name: 'INBOX/Offer', type: 'Offer' },
  { name: 'INBOX/Interview', type: 'Interview' },
]

export async function fetchAndStoreEmails(credentials: ImapCredentials, userId: number): Promise<{ added: number }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const existingUids = new Set(
    db.select({ uid: messages.uid }).from(messages).where(eq(messages.userId, userId)).all().map((r) => r.uid)
  )

  const existingByMessageId = new Map(
    db.select({ id: messages.id, messageId: messages.messageId, type: messages.type })
      .from(messages)
      .where(eq(messages.userId, userId))
      .all()
      .filter((r) => r.messageId !== null)
      .map((r) => [r.messageId as string, { id: r.id, type: r.type }])
  )

  const client = new ImapFlow({
    host: credentials.host,
    port: 993,
    secure: true,
    auth: { user: credentials.user, pass: credentials.pass },
    logger: false,
  })

  let added = 0
  try {
    await client.connect()

    for (const folder of FOLDERS) {
      let lock
      try {
        lock = await client.getMailboxLock(folder.name)
      } catch {
        // folder doesn't exist on this account — skip
        continue
      }

      try {
        const uidsResult = await client.search({ since: cutoff }, { uid: true })
        const uids = uidsResult === false ? [] : uidsResult
        if (uids.length > 0) {
          for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
            const { uid, envelope } = msg
            if (!envelope) continue

            const uidStr = `${folder.name}:${String(uid)}`

            const from = envelope.from?.[0]
            const fromAddress = from
              ? from.name
                ? `${from.name} <${from.address ?? ''}>`
                : (from.address ?? '')
              : ''
            if (BLOCKED_SENDERS.some((s) => fromAddress.includes(s))) continue

            const msgId = envelope.messageId ?? null

            // If we've seen this Message-ID before, update the existing row in place
            if (msgId !== null && existingByMessageId.has(msgId)) {
              const existing = existingByMessageId.get(msgId)!
              const updates: Partial<typeof messages.$inferInsert> = { uid: uidStr }
              if (folder.type !== null && existing.type === null) updates.type = folder.type
              db.update(messages).set(updates).where(eq(messages.id, existing.id)).run()
              existingUids.add(uidStr)
              continue
            }

            if (existingUids.has(uidStr)) continue

            const receivedAt = envelope.date ? envelope.date.toISOString() : new Date().toISOString()
            const subject = envelope.subject ?? ''

            db.insert(messages)
              .values({ uid: uidStr, messageId: msgId, receivedAt, fromAddress, subject, type: folder.type, userId })
              .onConflictDoNothing()
              .run()
            if (msgId !== null) existingByMessageId.set(msgId, { id: 0, type: folder.type })
            added++
          }
        }
      } finally {
        lock.release()
      }
    }
  } finally {
    try {
      await client.logout()
    } catch {
      // logout may throw if connect failed — ignore
    }
  }

  return { added }
}
