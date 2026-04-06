# Story 6.2: Fuzzy Email-to-Job Matching & Status Update

Status: done

## Story

As a user,
I want the system to automatically match incoming emails to job records and update their status,
So that I get passive application tracking without any manual data entry.

## Acceptance Criteria

1. **Given** a new email arrives in the polled inbox
   **When** the matching logic runs
   **Then** the email's subject/body is normalized to lowercase and compared against job titles using fuzzy comparison (abbreviation-expanded)
   **And** the match is only confirmed if the email's received timestamp is within ±3 days of the job's `date_applied` — date anchoring is the primary false-positive reducer

2. **Given** a confident match is found
   **When** the status update runs
   **Then** the matched job's `status` is updated in SQLite with the detected status (e.g., "Interview", "Rejected")
   **And** a `status_events` entry is appended with `source: 'email'` and the email's received timestamp

3. **Given** no confident match is found for an email
   **When** the matching logic completes
   **Then** no DB writes occur — unmatched emails are silently skipped

## Tasks / Subtasks

- [x] Task 1: Add `source` column to `status_events` — DB schema + migration (AC: 2)
  - [x] In `src/db/schema.ts`, add `source: text('source').notNull().default('manual')` to the `statusEvents` table definition
  - [x] Run `/home/zac/.bun/bin/bun run db:generate` from `job-hunt-dashboard/` to generate the migration SQL
  - [x] Verify the generated migration file (e.g., `src/db/migrations/0002_*.sql`) contains `ALTER TABLE status_events ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`
  - [x] Commit the generated migration SQL file

- [x] Task 2: Update shared Zod schema (AC: 2)
  - [x] In `src/shared/schemas.ts`, add `source: z.enum(['manual', 'email'])` to `statusEventSchema` (after `timestamp`)
  - [x] `StatusEvent` type is automatically updated via `z.infer` — no manual change needed

- [x] Task 3: Update `api-jobs.test.ts` for new schema (regression guard)
  - [x] In `src/server/routes/api-jobs.test.ts`, update `CREATE_STATUS_EVENTS_TABLE` to add `source TEXT NOT NULL DEFAULT 'manual'` column (line ~33)
  - [x] Existing PATCH tests that trigger `db.insert(statusEvents)` will continue to work — Drizzle uses the DB default for `source` when not provided in `.values({...})`
  - [x] Run `/home/zac/.bun/bin/bun test` to confirm all existing tests still pass before proceeding

- [x] Task 4: Extend `src/server/services/imap-poller.ts` (AC: 1–3)
  - [x] Export `ImapCredentials` interface (change `interface` to `export interface`)
  - [x] Add imports at the top: `db` from `../../db/client`, `jobs` and `statusEvents` from `../../db/schema`, `eq`, `and`, `isNotNull` from `drizzle-orm`
  - [x] Export pure helper functions (before `startImapPoller`): `normalizeText`, `detectStatus`, `findMatchingJob` — see Dev Notes for complete signatures and implementations
  - [x] In `pollOnce`: before creating the ImapFlow client, query applied jobs from DB; if none, return early
  - [x] In `pollOnce` try block (after `client.connect()`): open mailbox lock, search for messages since cutoff date, iterate messages with `for await`, detect status, find match, write DB transaction — see Dev Notes for complete pattern
  - [x] The outer `finally { client.logout() }` block is unchanged — do NOT add `logout()` elsewhere

- [x] Task 5: Update `src/server/services/imap-poller.test.ts` (AC: 1–3)
  - [x] Add `process.env.DB_PATH = ':memory:'` as the very first line (before all imports)
  - [x] Update `mock.module('imapflow', ...)` factory to include `getMailboxLock`, `search`, and `fetch` methods — see Dev Notes for complete mock setup
  - [x] Update dynamic import to also export new functions: `{ pollOnce, startImapPoller, normalizeText, detectStatus, findMatchingJob }`
  - [x] Add `Database` import and DB singleton access for `beforeAll`/`beforeEach` setup
  - [x] Add `beforeAll`: create `jobs` and `status_events` tables via raw SQL (include `source` column)
  - [x] Add `beforeEach`: `DELETE FROM status_events` + `DELETE FROM jobs` + reset all mocks
  - [x] Tests for `normalizeText`: lowercase, abbreviation expansion, punctuation removal
  - [x] Tests for `detectStatus`: returns correct status strings for keyword patterns; returns null for non-job emails
  - [x] Tests for `findMatchingJob`: match found within ±3 days; no match outside ±3 days; no match when title tokens don't overlap
  - [x] Integration test for `pollOnce`: insert an applied job with `dateApplied`, mock IMAP to return a matching message, verify `jobs.status` updated and `status_events` row inserted with `source: 'email'`
  - [x] Integration test for `pollOnce`: no applied jobs → returns early (no IMAP connection attempt)
  - [x] Integration test for `pollOnce`: message with no status keywords → no DB writes

- [x] Task 6: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass + new tests pass

### Review Findings

- [x] [Review][Patch] Email body MIME not decoded — add `mailparser` dep; replace envelope/bodyParts fetch with `source: true` + `simpleParser()` for proper charset and transfer-encoding decoding [imap-poller.ts ~line 130-140]

- [x] [Review][Patch] DB query outside try/catch in pollOnce — `db.select().all()` executes before the outer `try` block; if it throws, the exception propagates as an unhandled promise rejection in the `setInterval` async callback [imap-poller.ts ~line 97-102]

- [x] [Review][Patch] No deduplication — every poll re-fetches all messages since the cutoff and re-processes them, inserting duplicate `status_events` rows for already-processed emails on each 5-minute cycle [imap-poller.ts ~line 143-153]

- [x] [Review][Patch] appliedDate constructed with local midnight (T00:00:00) vs UTC IMAP envelope date — timezone-dependent arithmetic can shift the ±3-day match window by up to ±24h on non-UTC servers; fix: use `T00:00:00Z` [imap-poller.ts ~lines 63, 118]

- [x] [Review][Defer] setInterval handle not stored — no graceful shutdown [imap-poller.ts:89] — deferred, pre-existing from 6-1 review
- [x] [Review][Defer] No initial poll on startup — first poll delayed by full interval [imap-poller.ts:89] — deferred, design preference not in spec
- [x] [Review][Defer] Concurrent poll overlap if a single poll takes longer than the interval [imap-poller.ts:89] — deferred, personal dashboard single-user tool
- [x] [Review][Defer] IMAP_POLL_INTERVAL_MS=0 produces a busy-loop — no minimum value clamp [imap-poller.ts:6-7] — deferred, unrealistic misconfiguration
- [x] [Review][Defer] Unsanitized err.message logging may expose IMAP_USER via library-generated auth error strings [imap-poller.ts:158] — deferred, library behavior outside direct control

## Dev Notes

### Schema Change: `source` Column on `status_events`

**`src/db/schema.ts`** — add `source` to `statusEvents`:

```ts
export const statusEvents = sqliteTable('status_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id),
  status: text('status').notNull(),
  timestamp: text('timestamp').notNull(),
  source: text('source').notNull().default('manual'), // ← ADD THIS
})
```

**`src/shared/schemas.ts`** — extend `statusEventSchema`:

```ts
export const statusEventSchema = z.object({
  id: z.number().int(),
  jobId: z.number().int(),
  status: z.string(),
  timestamp: z.string(),
  source: z.enum(['manual', 'email']), // ← ADD THIS
})
```

**`api-jobs.ts` existing insert** (line 96–101) does NOT need `source` added — Drizzle will omit it from the INSERT and SQLite's `DEFAULT 'manual'` applies automatically. This is intentional.

**`api-jobs.test.ts` raw SQL** MUST be updated (line ~33) or existing tests will break when Drizzle SELECTs expect the `source` column:

```ts
const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'  ← ADD THIS LINE
  )
`
```

### Migration Generation

After updating `schema.ts`, generate the migration:

```bash
cd job-hunt-dashboard
/home/zac/.bun/bin/bun run db:generate
```

Expect a new file `src/db/migrations/0002_<random>.sql` containing:

```sql
ALTER TABLE `status_events` ADD `source` text NOT NULL DEFAULT 'manual';
```

Commit the generated SQL file — the boot migration runner applies it automatically at `bun start`.

### Complete `imap-poller.ts` Implementation

```ts
import { ImapFlow } from 'imapflow'
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
    // Date anchor: email must be within ±3 days of dateApplied
    const appliedDate = new Date(job.dateApplied + 'T00:00:00')
    const diffDays =
      Math.abs(receivedDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 3) continue

    // Fuzzy title match: ≥50% of job title tokens must appear in email text
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
    await pollOnce(credentials)
  }, POLL_INTERVAL_MS)
}

export async function pollOnce(credentials: ImapCredentials): Promise<void> {
  // Query applied jobs before connecting — skip IMAP entirely if nothing to match
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

    // Calculate IMAP search cutoff: earliest dateApplied minus 3 days
    const minMs = Math.min(
      ...appliedJobs.map((j) => new Date(j.dateApplied + 'T00:00:00').getTime())
    )
    const cutoff = new Date(minMs - 3 * 24 * 60 * 60 * 1000)

    const lock = await client.getMailboxLock('INBOX')
    try {
      const uids = await client.search({ since: cutoff }, { uid: true })
      if (uids.length === 0) return

      for await (const msg of client.fetch(uids, { envelope: true, bodyParts: ['1'] }, { uid: true })) {
        const subject: string = (msg.envelope as { subject?: string } | undefined)?.subject ?? ''
        const receivedDate: Date | undefined = (msg.envelope as { date?: Date } | undefined)?.date
        if (!receivedDate) continue

        const bodyBuffer = (msg.bodyParts as Map<string, Buffer> | undefined)?.get('1')
        const body = bodyBuffer ? bodyBuffer.toString() : ''
        const combinedText = `${subject} ${body}`

        const detectedStatus = detectStatus(combinedText)
        if (!detectedStatus) continue

        const matchedJob = findMatchingJob(combinedText, receivedDate, appliedJobs)
        if (!matchedJob) continue

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
```

**Important notes on the implementation:**
- `return` inside the lock's `try` block (e.g., `if (uids.length === 0) return`) still triggers `lock.release()` in the inner `finally` — correct behavior
- The outer `finally` with `client.logout()` always runs — do not add an extra `logout()` call inside the try block
- `db.transaction` uses `.run()` on each statement — synchronous pattern matching the rest of the codebase (see `ingest-service.ts`)
- `client.search({ since: cutoff }, { uid: true })` returns `number[]` of UIDs; passing UIDs to `client.fetch` with `{ uid: true }` option fetches by UID (not sequence number)

### imapflow API Notes

imapflow v1.2.18 (installed) key methods:
- `client.getMailboxLock(path: string): Promise<{ release(): void }>` — preferred over `mailboxOpen`; call `lock.release()` in `finally`
- `client.search(query, options?): Promise<number[]>` — `{ since: Date }` matches messages received on/after date; `{ uid: true }` returns UIDs instead of sequence numbers
- `client.fetch(range, options, fetchOptions?): AsyncIterableIterator<FetchMessageObject>` — use `for await`; range is `number[]` of UIDs when `{ uid: true }` is set in fetchOptions
- `msg.envelope.subject`: string; `msg.envelope.date`: Date object (received date)
- `msg.bodyParts`: `Map<string, Buffer>` — key `'1'` is the first body part (plaintext for plain-text emails; HTML for HTML-only; may be empty for multipart with no text/plain part)

**TypeScript note:** imapflow types may not be precise — the `as` casts in the implementation reference above handle the type assertions correctly without requiring `@ts-expect-error`.

### Testing Pattern for `imap-poller.test.ts`

The test file must set `process.env.DB_PATH = ':memory:'` as the very first line (before ALL imports, including `bun:test`), matching the pattern in `api-jobs.test.ts`.

Complete updated mock setup and test structure:

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, mock, beforeEach, afterEach, beforeAll } from 'bun:test'
import { Database } from 'bun:sqlite'

// --- imapflow mock setup ---
const mockConnect = mock(async () => {})
const mockLogout = mock(async () => {})
const mockLockRelease = mock(() => {})
const mockGetMailboxLock = mock(async () => ({ release: mockLockRelease }))

// Mutable arrays — tests push messages before calling pollOnce
const mockUids: number[] = []
const mockMessages: Array<{
  envelope: { subject: string; date: Date }
  bodyParts: Map<string, Buffer>
}> = []

const mockSearch = mock(async () => [...mockUids])
const mockFetch = mock(async function* () {
  for (const msg of mockMessages) yield msg
})

mock.module('imapflow', () => ({
  ImapFlow: mock(function () {
    return {
      connect: mockConnect,
      logout: mockLogout,
      getMailboxLock: mockGetMailboxLock,
      search: mockSearch,
      fetch: mockFetch,
    }
  }),
}))

// --- dynamic import after mock setup ---
const { pollOnce, startImapPoller, normalizeText, detectStatus, findMatchingJob } =
  await import('./imap-poller')
const { db } = await import('../../db/client')
const prodSqlite = (db as unknown as { $client: Database }).$client

// --- DB setup ---
const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    fit_score INTEGER,
    recommendation TEXT,
    role_fit TEXT,
    requirements_met TEXT,
    requirements_missed TEXT,
    red_flags TEXT,
    job_description TEXT,
    source_url TEXT,
    date_scraped TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_override TEXT,
    cover_letter_sent_at TEXT,
    date_applied TEXT,
    UNIQUE(company, job_title)
  )
`
const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM status_events')
  prodSqlite.run('DELETE FROM jobs')
  mockConnect.mockReset()
  mockLogout.mockReset()
  mockGetMailboxLock.mockReset()
  mockGetMailboxLock.mockImplementation(async () => ({ release: mockLockRelease }))
  mockSearch.mockReset()
  mockSearch.mockImplementation(async () => [...mockUids])
  mockFetch.mockReset()
  mockFetch.mockImplementation(async function* () {
    for (const msg of mockMessages) yield msg
  })
  mockUids.length = 0
  mockMessages.length = 0
})

// --- Unit tests for pure functions ---
describe('normalizeText', () => {
  test('lowercases and removes punctuation', () => {
    expect(normalizeText('Senior Engineer!')).toBe('senior engineer')
  })
  test('expands abbreviations', () => {
    expect(normalizeText('Sr Eng')).toBe('senior engineer')
  })
  test('collapses multiple spaces', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world')
  })
})

describe('detectStatus', () => {
  test('returns Interview for interview keyword', () => {
    expect(detectStatus('We would like to invite you for an interview')).toBe('Interview')
  })
  test('returns Rejected for rejection keywords', () => {
    expect(detectStatus('Unfortunately we have decided not to move forward')).toBe('Rejected')
  })
  test('returns Offer for offer keyword', () => {
    expect(detectStatus('Congratulations, we are pleased to offer you')).toBe('Offer')
  })
  test('returns null for non-job email', () => {
    expect(detectStatus('Your package has been shipped')).toBeNull()
  })
})

describe('findMatchingJob', () => {
  const job = { id: 1, jobTitle: 'Senior Engineer', dateApplied: '2026-04-01' }

  test('matches when title tokens found in email and date within ±3 days', () => {
    const date = new Date('2026-04-02T10:00:00Z')
    const result = findMatchingJob('We want to interview a senior engineer at Acme', date, [job])
    expect(result?.id).toBe(1)
  })

  test('no match when date is outside ±3 days', () => {
    const date = new Date('2026-04-10T10:00:00Z')
    const result = findMatchingJob('Interview for senior engineer role', date, [job])
    expect(result).toBeNull()
  })

  test('no match when title tokens do not appear in email', () => {
    const date = new Date('2026-04-02T10:00:00Z')
    const result = findMatchingJob('Thank you for applying to Acme Corp', date, [job])
    expect(result).toBeNull()
  })
})

// --- Integration tests for pollOnce ---
describe('pollOnce (integration)', () => {
  const credentials = { host: 'imap.example.com', user: 'u', pass: 'p' }

  test('returns early without connecting when no applied jobs with dateApplied', async () => {
    await pollOnce(credentials)
    expect(mockConnect).not.toHaveBeenCalled()
  })

  test('updates job status and inserts status_events row on confident match', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Acme', 'Senior Engineer', 1, '2026-04-01')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }

    mockUids.push(1)
    mockMessages.push({
      envelope: {
        subject: 'Interview invitation for Senior Engineer',
        date: new Date('2026-04-02T10:00:00Z'),
      },
      bodyParts: new Map([['1', Buffer.from('We would like to schedule an interview')]]),
    })

    await pollOnce(credentials)

    const job = prodSqlite.query('SELECT status FROM jobs WHERE id = ?').get(row.id) as { status: string }
    expect(job.status).toBe('Interview')

    const event = prodSqlite.query('SELECT * FROM status_events WHERE job_id = ?').get(row.id) as {
      status: string
      source: string
      timestamp: string
    }
    expect(event).not.toBeNull()
    expect(event.status).toBe('Interview')
    expect(event.source).toBe('email')
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('makes no DB writes when message has no status keywords', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Beta', 'Developer', 1, '2026-04-01')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Beta') as { id: number }

    mockUids.push(1)
    mockMessages.push({
      envelope: { subject: 'Thank you for applying', date: new Date('2026-04-02T10:00:00Z') },
      bodyParts: new Map([['1', Buffer.from('We received your application')]]),
    })

    await pollOnce(credentials)

    const count = prodSqlite
      .query('SELECT COUNT(*) as n FROM status_events WHERE job_id = ?')
      .get(row.id) as { n: number }
    expect(count.n).toBe(0)
  })
})
```

**Key testing notes:**
- `mock.module('imapflow', ...)` MUST remain before the dynamic `await import('./imap-poller')` — do not reorder
- Mutable arrays (`mockUids`, `mockMessages`) are reset in `beforeEach` — do not use `mockReset()` on the array reference; use `.length = 0`
- The `mockFetch` mock returns an async generator — `mock(async function* () { ... })` works in bun:test
- `beforeAll` runs once for the test file — `beforeEach` clears DB rows between each test
- The `origEnv` pattern from the existing `startImapPoller` tests still applies for env var tests (keep those tests, add to them)

### Security Invariants (unchanged from Story 6.1)

- Never log `IMAP_USER` or `IMAP_PASS` — even in error messages
- `IMAP_HOST` (server hostname) is safe to log
- `ImapFlow` constructed with `logger: false`
- Detected status values and job data in DB writes are safe — no credentials involved

### Architecture Compliance

- No new API routes — matching runs entirely inside the background `pollOnce` service
- No client-side changes — Story 6.3 will add the UI for email-sourced events
- `db` imported as singleton from `src/db/client.ts` — never instantiate a second instance
- Transaction pattern: `db.transaction((tx) => { tx.statement.run() })` — synchronous, matches `ingest-service.ts`
- Test files co-located beside their source files
- `bun:test` only — no vitest or jest imports

### Cross-Story Context

**Story 6.3 (next)** will use `source: 'email'` in `status_events` to show a distinct indicator in `StatusTimeline`. The `statusEventSchema` update in this story is what makes 6.3's UI work without another schema migration.

**What Story 6.3 will need from this story's output:**
- `status_events.source` column (`'email'` | `'manual'`)
- Updated `StatusEvent` type from `src/shared/schemas.ts`
- The `GET /:id/events` endpoint (`api-jobs.ts`) already returns all columns via `db.select().from(statusEvents)` — once `source` is in the schema, it's automatically included in the response

### File Structure After This Story

```
src/
  db/
    schema.ts                    ← MODIFIED (source column on statusEvents)
    migrations/
      0002_<random>.sql          ← NEW (ALTER TABLE ADD COLUMN source)
  shared/
    schemas.ts                   ← MODIFIED (statusEventSchema + StatusEvent type)
  server/
    routes/
      api-jobs.ts                (unchanged — Drizzle default handles source)
      api-jobs.test.ts           ← MODIFIED (CREATE_STATUS_EVENTS_TABLE SQL)
    services/
      imap-poller.ts             ← MODIFIED (export ImapCredentials, helpers, inbox fetch)
      imap-poller.test.ts        ← MODIFIED (DB_PATH, new mocks, new tests)
```

### Previous Story Learnings (from Story 6.1)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; every imported symbol must be used
- **`bun:test` imports** — `describe`, `test`, `expect`, `mock`, `beforeAll`, `beforeEach`, `afterEach` all from `'bun:test'` only
- **`mock.module` before dynamic import** — imapflow mock setup must precede `await import('./imap-poller')`
- **`bun run db:generate`** — runs drizzle-kit generate via the project script; commit the generated SQL file

### References

- Epic 6 requirements: `_bmad-output/planning-artifacts/epics/epic-6-post-mvp-email-status-detection.md`
- Previous story (6.1 implementation): `_bmad-output/implementation-artifacts/6-1-imap-polling-service.md`
- Deferred items from 6.1 review: `_bmad-output/implementation-artifacts/deferred-work.md` (lines 114–119)
- DB schema: `job-hunt-dashboard/src/db/schema.ts`
- Shared schemas: `job-hunt-dashboard/src/shared/schemas.ts`
- Existing transaction pattern: `job-hunt-dashboard/src/server/services/ingest-service.ts`
- Existing test DB pattern: `job-hunt-dashboard/src/server/routes/api-jobs.test.ts`
- Project rules: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Added `source` column to `statusEvents` Drizzle schema with `default('manual')`; generated migration `0002_unknown_slipstream.sql` via `bun run db:generate`
- Extended `statusEventSchema` in `schemas.ts` with `source: z.enum(['manual', 'email'])` — `StatusEvent` type auto-updated
- Updated `api-jobs.test.ts` in-memory DDL to include `source TEXT NOT NULL DEFAULT 'manual'` — all existing 59 tests continue to pass
- Rewrote `imap-poller.ts`: exported `ImapCredentials`, added DB query before IMAP connect (early return if no applied jobs), added `normalizeText`/`detectStatus`/`findMatchingJob` pure helpers, implemented full inbox fetch loop with status detection, fuzzy matching, and transactional DB writes; fixed imapflow `search()` typing (`false | number[]`)
- Rewrote `imap-poller.test.ts`: added in-memory DB setup, comprehensive unit tests for all three pure helpers, and integration tests for `pollOnce` covering match/no-match/early-return paths; preserved existing `startImapPoller` tests
- Total: 69 tests pass (59 existing + 10 new), 0 failures, 0 TypeScript errors

### File List

- `job-hunt-dashboard/src/db/schema.ts`
- `job-hunt-dashboard/src/db/migrations/0002_unknown_slipstream.sql`
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/routes/api-jobs.test.ts`
- `job-hunt-dashboard/src/server/services/imap-poller.ts`
- `job-hunt-dashboard/src/server/services/imap-poller.test.ts`

## Change Log

- 2026-04-05: Story created by SM agent (create-story workflow)
- 2026-04-05: Story implemented by dev agent (claude-sonnet-4-6) — fuzzy matching, DB writes, migration, tests
