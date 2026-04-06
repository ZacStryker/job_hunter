import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { eq, and, isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, statusEvents } from '../../db/schema'

const _parsedInterval = parseInt(process.env.IMAP_POLL_INTERVAL_MS ?? '300000', 10)
const POLL_INTERVAL_MS = isNaN(_parsedInterval) ? 300000 : _parsedInterval

export interface ImapCredentials {
  host: string
  user: string
  pass: string
}

type MatchableJob = { id: number; jobTitle: string; dateApplied: string }

const ABBREVIATIONS: Record<string, string> = {
  sr: 'senior',
  jr: 'junior',
  eng: 'engineer',
  dev: 'developer',
  mgr: 'manager',
  dir: 'director',
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => ABBREVIATIONS[word] ?? word)
    .join(' ')
}

const STATUS_PATTERNS: Array<{ pattern: RegExp; status: string }> = [
  {
    pattern: /thank you for applying|application received|we have received your application|thank you for your application|we received your application/i,
    status: 'Applied',
  },
  { pattern: /interview|phone\s+screen|screening/i, status: 'Interview' },
  {
    pattern: /rejected|regret|unfortunately|not moving forward|no longer|decided not|position has been filled/i,
    status: 'Rejected',
  },
  { pattern: /offer|congratulations|pleased to offer/i, status: 'Offer' },
]

export function detectStatus(text: string): string | null {
  for (const { pattern, status } of STATUS_PATTERNS) {
    if (pattern.test(text)) return status
  }
  return null
}

export function findMatchingJob(
  emailText: string,
  receivedDate: Date,
  appliedJobs: MatchableJob[]
): MatchableJob | null {
  const emailTokens = new Set(normalizeText(emailText).split(' ').filter((t) => t.length > 0))

  for (const job of appliedJobs) {
    const appliedDate = new Date(job.dateApplied + 'T00:00:00Z')
    const diffDays =
      Math.abs(receivedDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 3) continue

    const titleTokens = normalizeText(job.jobTitle)
      .split(' ')
      .filter((t) => t.length > 0)
    if (titleTokens.length === 0) continue

    const matchCount = titleTokens.filter((token) => emailTokens.has(token)).length
    if (matchCount / titleTokens.length >= 0.5) return job
  }

  return null
}

export function startImapPoller(): void {
  const { IMAP_HOST, IMAP_USER, IMAP_PASS } = process.env

  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    console.warn('[imap] IMAP credentials not configured — email polling disabled')
    return
  }

  const credentials: ImapCredentials = { host: IMAP_HOST, user: IMAP_USER, pass: IMAP_PASS }
  console.log(`[imap] Email polling enabled (interval: ${POLL_INTERVAL_MS}ms)`)

  setInterval(async () => {
    try {
      await pollOnce(credentials)
    } catch (err) {
      console.error('[imap] Unexpected poll error:', err instanceof Error ? err.message : String(err))
    }
  }, POLL_INTERVAL_MS)
}

export async function pollOnce(credentials: ImapCredentials): Promise<void> {
  const rows = db
    .select({ id: jobs.id, jobTitle: jobs.jobTitle, dateApplied: jobs.dateApplied })
    .from(jobs)
    .where(and(eq(jobs.applied, true), isNotNull(jobs.dateApplied)))
    .all()
  const appliedJobs: MatchableJob[] = rows.filter(
    (r): r is typeof r & { dateApplied: string } => r.dateApplied !== null
  )

  if (appliedJobs.length === 0) return

  const client = new ImapFlow({
    host: credentials.host,
    port: 993,
    secure: true,
    auth: { user: credentials.user, pass: credentials.pass },
    logger: false,
  })

  try {
    await client.connect()

    const minMs = Math.min(
      ...appliedJobs.map((j) => new Date(j.dateApplied + 'T00:00:00Z').getTime())
    )
    const cutoff = new Date(minMs - 3 * 24 * 60 * 60 * 1000)

    const lock = await client.getMailboxLock('INBOX')
    try {
      const uidsResult = await client.search({ since: cutoff }, { uid: true })
      const uids = uidsResult === false ? [] : uidsResult
      if (uids.length === 0) return

      for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source as Buffer)
        const subject = parsed.subject ?? ''
        const receivedDate = parsed.date
        if (!receivedDate) continue

        const body = parsed.text ?? ''
        const combinedText = `${subject} ${body}`

        const detectedStatus = detectStatus(combinedText)
        if (!detectedStatus) continue

        const matchedJob = findMatchingJob(combinedText, receivedDate, appliedJobs)
        if (!matchedJob) continue

        // Skip write if status already matches — prevents duplicate status_events across polls
        const currentJob = db
          .select({ status: jobs.status })
          .from(jobs)
          .where(eq(jobs.id, matchedJob.id))
          .get()
        if (currentJob?.status === detectedStatus) continue

        db.transaction((tx) => {
          tx.update(jobs).set({ status: detectedStatus }).where(eq(jobs.id, matchedJob.id)).run()
          tx.insert(statusEvents)
            .values({
              jobId: matchedJob.id,
              status: detectedStatus,
              timestamp: receivedDate.toISOString(),
              source: 'email',
            })
            .run()
        })
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error('[imap] Poll error:', err instanceof Error ? err.message : String(err))
    // No re-throw — service retries on next interval
  } finally {
    try {
      await client.logout()
    } catch {
      // logout may throw if connect failed — ignore
    }
  }
}
