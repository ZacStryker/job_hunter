# Story 7.1: Cover Letter Generation Trigger

Status: done

## Story

As a user,
I want to trigger cover letter generation for a specific job directly from the drawer,
So that I can initiate the generation pipeline without leaving the dashboard.

## Acceptance Criteria

1. **Given** the user opens the job drawer for a job that has a `jobDescription`
   **When** they click "Generate Cover Letter"
   **Then** a POST is sent to the n8n webhook URL and the button shows "Generating…" (disabled) while the request is in flight

2. **Given** the n8n webhook responds successfully
   **When** the response is received
   **Then** the cover letter text is stored in the `cover_letters` table and `coverLetterSentAt` is set to the current ISO timestamp on the job record
   **And** the `['jobs']` query cache is invalidated so the drawer reflects the updated `coverLetterSentAt`

3. **Given** the n8n webhook request fails (non-200 response or network error)
   **When** the error is caught
   **Then** an inline error message appears in the drawer; no DB writes occur; the button is re-enabled

4. **Given** the job has no `jobDescription`
   **When** the drawer renders
   **Then** the "Generate Cover Letter" button is absent (or disabled with a tooltip) — n8n cannot generate without a job description

5. **Given** `N8N_WEBHOOK_URL` is not set in `.env`
   **When** the generate endpoint is called
   **Then** the API returns HTTP 503 with `{ error: "Cover letter generation is not configured" }`

## Tasks / Subtasks

- [x] Task 1: Add `cover_letters` table to DB schema + generate migration (AC: 2)
  - [x] In `src/db/schema.ts`, add `coverLetters` table definition:
    ```ts
    export const coverLetters = sqliteTable('cover_letters', {
      id: integer('id').primaryKey({ autoIncrement: true }),
      jobId: integer('job_id').notNull().references(() => jobs.id),
      content: text('content').notNull(),
      createdAt: text('created_at').notNull(),
    })
    ```
  - [x] Run `/home/zac/.bun/bin/bun run db:generate` from `job-hunt-dashboard/` — expect new file `src/db/migrations/0003_*.sql` containing `CREATE TABLE cover_letters`
  - [x] Commit the generated migration SQL file

- [x] Task 2: Add `coverLetterSchema` and `CoverLetter` type to `src/shared/schemas.ts` (AC: 2)
  - [x] Add after `statusEventSchema`:
    ```ts
    export const coverLetterSchema = z.object({
      id: z.number().int(),
      jobId: z.number().int(),
      content: z.string(),
      createdAt: z.string(),
    })
    export type CoverLetter = z.infer<typeof coverLetterSchema>
    ```

- [x] Task 3: Create `src/server/services/cover-letter-service.ts` (AC: 1, 3, 5)
  - [x] Export `callN8nWebhook(job: Job): Promise<string>` — returns the generated cover letter text
  - [x] Read `N8N_WEBHOOK_URL` from `process.env`; if not set, throw `new Error('N8N_WEBHOOK_URL not configured')`
  - [x] Build request body: `{ job_description: job.jobDescription, source: '', job_url: job.sourceUrl ?? '', notes: '' }`
  - [x] Build request headers: `{ 'Content-Type': 'application/json' }` — add `Authorization: Bearer ${N8N_WEBHOOK_SECRET}` only if `process.env.N8N_WEBHOOK_SECRET` is set
  - [x] `fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })` — await response
  - [x] If response is not ok, throw `new Error(\`n8n webhook returned ${response.status}\`)`
  - [x] Parse response JSON, extract and return `response.cover_letter` (string)
  - [x] Never log `N8N_WEBHOOK_SECRET` — only the URL is safe to log

- [x] Task 4: Add `POST /:id/generate-cover-letter` to `src/server/routes/api-jobs.ts` (AC: 1–5)
  - [x] Add imports at top: `coverLetters` from `../../db/schema`, `callN8nWebhook` from `../services/cover-letter-service`, `CoverLetter` type from `../../shared/schemas`
  - [x] Implement handler:
    1. Validate `:id` — same integer check as existing `/:id` handlers; return 400 on invalid
    2. Fetch job from DB; return 404 if not found
    3. Return 400 `{ error: 'Job has no job description' }` if `!job.jobDescription`
    4. Call `callN8nWebhook(job)` — if it throws with `'N8N_WEBHOOK_URL not configured'`, return 503; for all other errors, return 502 `{ error: err.message }`
    5. DB transaction: `insert into cover_letters` + `update jobs set cover_letter_sent_at` — use `db.transaction((tx) => { ... })` with `.run()` calls
    6. Return `c.json({ coverLetter: insertedRow })` where `insertedRow` is fetched after the transaction

- [x] Task 5: Create `src/server/routes/api-cover-letter.test.ts` (AC: 1–5)
  - [x] First line: `process.env.DB_PATH = ':memory:'` (before all imports)
  - [x] Use `mock.module('../services/cover-letter-service', ...)` before dynamic import of `api-jobs`
  - [x] Set up in-memory DB with `beforeAll` (create `jobs` AND `cover_letters` tables via raw SQL)
  - [x] `beforeEach`: clear both tables, reset mocks
  - [x] Tests:
    - `POST /:id/generate-cover-letter` → 200, inserts row in `cover_letters`, sets `cover_letter_sent_at` on job
    - Invalid (non-numeric) id → 400
    - Job not found → 404
    - Job with no `jobDescription` → 400 `{ error: 'Job has no job description' }`
    - `callN8nWebhook` throws `'N8N_WEBHOOK_URL not configured'` → 503
    - `callN8nWebhook` throws other error → 502 `{ error: string }` (no `message` key)

- [x] Task 6: Create `src/client/hooks/useGenerateCoverLetter.ts` (AC: 1–3)
  - [x] Import `useMutation`, `useQueryClient` from `@tanstack/react-query`; import `CoverLetter` from `@shared/schemas`
  - [x] `export function useGenerateCoverLetter(jobId: number)` returning `useMutation<CoverLetter, Error>({...})`
  - [x] `mutationFn`: POST `/api/jobs/${jobId}/generate-cover-letter` with no body; throw `Error(body.error)` on non-ok
  - [x] `onSuccess`: `queryClient.invalidateQueries({ queryKey: ['jobs'] })`
  - [x] No optimistic update — wait for server confirmation before updating UI

- [x] Task 7: Update `src/client/components/detail/JobDrawer.tsx` (AC: 1–4)
  - [x] Import `useGenerateCoverLetter` from `../../hooks/useGenerateCoverLetter`
  - [x] Call `const { mutate: generateCoverLetter, isPending, isError, error } = useGenerateCoverLetter(job?.id ?? 0)` inside the component
  - [x] Add a new section below `<StatusTimeline>` (still inside the scrollable `flex-1` div):
    ```tsx
    <Separator className="bg-zinc-800" />
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Cover Letter</p>
      {job?.jobDescription ? (
        <>
          <button
            onClick={() => generateCoverLetter()}
            disabled={isPending}
            className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Generating…' : job.coverLetterSentAt ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}
          </button>
          {isError && (
            <p className="text-xs text-red-400">{error?.message ?? 'Generation failed'}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-zinc-600">No job description available</p>
      )}
    </div>
    ```
  - [x] Do NOT call `generateCoverLetter` if `job` is null (the `job?.id ?? 0` handles this; button is only rendered when `job` is present since the entire drawer section only renders with a live job)

- [x] Task 8: Update `.env.example` (AC: 5)
  - [x] Replace the commented `# N8N_WEBHOOK_SECRET=` line with a proper block:
    ```
    # Post-MVP: Cover Letter Generation (Epic 7)
    N8N_WEBHOOK_URL=
    N8N_WEBHOOK_SECRET=   # optional — sent as Authorization: Bearer header if set
    ```

- [x] Task 9: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass + new `api-cover-letter.test.ts` tests pass

## Dev Notes

### n8n Webhook Contract

**This is a synchronous webhook — n8n processes the full pipeline and responds to the same HTTP request.** There is no separate callback. The dashboard POSTs, waits (10–30 seconds), and receives the cover letter in the response.

**Outbound POST body (dashboard → n8n):**
```json
{
  "job_description": "...",
  "source": "",
  "job_url": "https://...",
  "notes": ""
}
```
- `job_description` is required by n8n — it drives both the job data extraction and the cover letter generation
- `source`, `job_url`, `notes` are included because n8n's Parse Job Data node reads them; default to empty string if null

**n8n response body (synchronous, same request):**
```json
{
  "id": "JOB-ABC123",
  "company": "Acme Corp",
  "title": "Senior Engineer",
  "location": "Utrecht, NL",
  "job_type": "Full-time",
  "salary": "Not specified",
  "follow_up_date": "2026-04-13",
  "cover_letter": "Dear Hiring Manager,\n\n..."
}
```
- Only `cover_letter` is stored — the rest of the fields are n8n's own sheet-building metadata
- The n8n workflow also emails the result to zac@zacstryker.com; this happens automatically

**n8n webhook path:** `POST /webhook/generate-cover-letter` (configured in n8n)
Full URL format: `https://<n8n-host>/webhook/generate-cover-letter`

### `cover-letter-service.ts` Complete Implementation

```ts
import type { Job } from '../../shared/schemas'

export async function callN8nWebhook(job: Job): Promise<string> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error('N8N_WEBHOOK_URL not configured')
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.N8N_WEBHOOK_SECRET}`
  }

  const payload = {
    job_description: job.jobDescription,
    source: '',
    job_url: job.sourceUrl ?? '',
    notes: '',
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`n8n webhook returned ${response.status}`)
  }

  const data = await response.json() as { cover_letter: string }
  return data.cover_letter
}
```

**Security:** Never log `N8N_WEBHOOK_SECRET`. `N8N_WEBHOOK_URL` is safe to log.

### `api-jobs.ts` New Endpoint

Add imports at top:
```ts
import { coverLetters } from '../../db/schema'
import { callN8nWebhook } from '../services/cover-letter-service'
```

Add after the existing `app.patch('/:id', ...)` handler:
```ts
app.post('/:id/generate-cover-letter', async (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }
  if (!job.jobDescription) {
    return c.json({ error: 'Job has no job description' }, 400)
  }

  let coverLetterText: string
  try {
    coverLetterText = await callN8nWebhook(job)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'N8N_WEBHOOK_URL not configured') {
      return c.json({ error: 'Cover letter generation is not configured' }, 503)
    }
    return c.json({ error: message }, 502)
  }

  const now = new Date().toISOString()

  db.transaction((tx) => {
    tx.insert(coverLetters).values({
      jobId: rawId,
      content: coverLetterText,
      createdAt: now,
    }).run()
    tx.update(jobs).set({ coverLetterSentAt: now }).where(eq(jobs.id, rawId)).run()
  })

  const inserted = db.select().from(coverLetters)
    .where(eq(coverLetters.jobId, rawId))
    .orderBy(desc(coverLetters.createdAt))
    .get()

  return c.json({ coverLetter: inserted })
})
```

**Note:** `desc` is already imported in `api-jobs.ts` — do not add a duplicate import.

### `api-cover-letter.test.ts` Setup Pattern

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, mock, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

// --- Mock cover-letter-service BEFORE dynamic import ---
let mockCallN8nWebhook: () => Promise<string> = async () => 'Mock cover letter text'

mock.module('../services/cover-letter-service', () => ({
  callN8nWebhook: () => mockCallN8nWebhook(),
}))

// --- Import AFTER mock ---
const { default: jobsApp } = await import('./api-jobs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

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
const CREATE_COVER_LETTERS_TABLE = `
  CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_COVER_LETTERS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM cover_letters')
  prodSqlite.run('DELETE FROM jobs')
  mockCallN8nWebhook = async () => 'Mock cover letter text'
})
```

**Test: success path**
```ts
test('returns 200 and stores cover letter', async () => {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
  )
  const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }

  const res = await jobsApp.request(`/${row.id}/generate-cover-letter`, { method: 'POST' })
  expect(res.status).toBe(200)
  const data = await res.json() as { coverLetter: { content: string; jobId: number } }
  expect(data.coverLetter.content).toBe('Mock cover letter text')
  expect(data.coverLetter.jobId).toBe(row.id)

  const job = prodSqlite.query('SELECT cover_letter_sent_at FROM jobs WHERE id = ?').get(row.id) as { cover_letter_sent_at: string }
  expect(job.cover_letter_sent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
})
```

**Test: error response shape** — always assert `{ error: string }` not `{ message }`:
```ts
const data = await res.json() as Record<string, unknown>
expect(data).toHaveProperty('error')
expect(data).not.toHaveProperty('message')
```

### `useGenerateCoverLetter.ts` Complete Implementation

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CoverLetter } from '@shared/schemas'

export function useGenerateCoverLetter(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<CoverLetter, Error>({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/generate-cover-letter`, { method: 'POST' })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON body
        }
        throw new Error(message)
      }
      const data = await res.json() as { coverLetter: CoverLetter }
      return data.coverLetter
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
```

**No optimistic update:** the mutation takes 10–30 seconds; `isPending` drives the loading UI instead.

### `JobDrawer.tsx` Integration Notes

- The `job?.id ?? 0` passed to `useGenerateCoverLetter` is safe: the hook is always called (React hooks rules), but the button only renders when `job` is non-null, so `generateCoverLetter()` can only be triggered with a valid job in scope
- The error state (`isError`) resets automatically when the mutation is called again — no manual reset needed
- `job.coverLetterSentAt` reflects whether a cover letter already exists: use it to switch between "Generate" and "Regenerate" label
- Story 7.2 will add the actual cover letter content display below this section — leave a comment: `{/* Story 7.2: cover letter content display goes here */}`
- Position the new section as the last item in the scrollable div, after `<StatusTimeline>`

### `.env.example` Final State (Cover Letter block)

Replace the existing `# N8N_WEBHOOK_SECRET=` line:
```
# Post-MVP: Cover Letter Generation (Epic 7)
N8N_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=    # optional — sent as Authorization: Bearer header if set
```

### Architecture Compliance

- New service file: `src/server/services/cover-letter-service.ts` — `kebab-case.ts` naming ✓
- Test file co-located: `src/server/routes/api-cover-letter.test.ts` — next to the route under test ✓
- `bun:test` only — never import from `vitest` or `jest` ✓
- `mock.module` before dynamic `await import()` ✓
- `process.env.DB_PATH = ':memory:'` as the first line in the test file ✓
- `db.transaction((tx) => { tx.statement.run() })` — synchronous pattern ✓
- API response shapes: `{ error: string }` — never `{ message }`, never envelope ✓
- `coverLetters` table added to `schema.ts` — migration generated with `bun run db:generate` ✓
- Optional env vars: `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` — NOT added to `REQUIRED_ENV_VARS` in `index.ts` ✓

### File Structure After This Story

```
src/
  db/
    schema.ts                              ← MODIFIED (add coverLetters table)
    migrations/
      0003_<random>.sql                    ← NEW (CREATE TABLE cover_letters)
  shared/
    schemas.ts                             ← MODIFIED (coverLetterSchema + CoverLetter type)
  server/
    routes/
      api-jobs.ts                          ← MODIFIED (add POST /:id/generate-cover-letter)
      api-cover-letter.test.ts             ← NEW
    services/
      cover-letter-service.ts             ← NEW
  client/
    hooks/
      useGenerateCoverLetter.ts            ← NEW
    components/
      detail/
        JobDrawer.tsx                      ← MODIFIED (cover letter section)
.env.example                              ← MODIFIED (N8N_WEBHOOK_URL + N8N_WEBHOOK_SECRET)
```

### Previous Story Learnings (from Stories 6.1–6.3)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; every import must be used
- **`mock.module` before dynamic import** — the mock setup must precede `await import('./api-jobs')`
- **`bun run db:generate`** — runs drizzle-kit generate; commit the SQL file
- **`T00:00:00Z` for date-only strings** — not applicable here (timestamps are full ISO), but keep in mind for any date arithmetic
- **`desc` already imported** in `api-jobs.ts` — do not add a second import
- **Error response shape**: `{ error: string }` — assert both `toHaveProperty('error')` AND `not.toHaveProperty('message')` in every error test

### References

- n8n workflow definition: `/home/zac/Downloads/Generate Cover Letter (Webhook).json`
- Epic 7 requirements: `_bmad-output/planning-artifacts/epics/epic-7-post-mvp-cover-letter-generation-pipeline.md`
- Architecture: `_bmad-output/planning-artifacts/architecture-distillate.md`
- Project rules: `_bmad-output/project-context.md`
- Existing pattern — service mock: `job-hunt-dashboard/src/server/routes/api-sync.test.ts`
- Existing pattern — DB test setup: `job-hunt-dashboard/src/server/routes/api-jobs.test.ts`
- Existing pattern — transaction: `job-hunt-dashboard/src/server/services/ingest-service.ts`
- Existing pattern — hook mutation: `job-hunt-dashboard/src/client/hooks/useJobMutation.ts`
- Existing component to modify: `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Added `coverLetters` table to `src/db/schema.ts` and generated migration `0003_premium_liz_osborn.sql`
- Added `coverLetterSchema` + `CoverLetter` type to `src/shared/schemas.ts`
- Created `cover-letter-service.ts` with `callN8nWebhook` — optional `N8N_WEBHOOK_SECRET` Bearer auth, never logged
- Added `POST /:id/generate-cover-letter` to `api-jobs.ts`: validates id, checks job exists + has description, calls n8n, writes transaction (cover_letters insert + jobs coverLetterSentAt update), returns inserted row
- TypeScript cast `job as Job` needed at service call site — Drizzle inferred type widens `recommendation` to `string | null`
- Created 6 tests in `api-cover-letter.test.ts` covering success, invalid id, not found, no description, 503 (unconfigured), 502 (other error)
- Added `useGenerateCoverLetter` hook with `useMutation` — invalidates `['jobs']` on success, no optimistic update
- Added Cover Letter section to `JobDrawer.tsx` below `<StatusTimeline>` with Generate/Regenerate button, pending state, inline error, Story 7.2 comment
- Updated `.env.example` with `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` block

### File List

- job-hunt-dashboard/src/db/schema.ts
- job-hunt-dashboard/src/db/migrations/0003_premium_liz_osborn.sql
- job-hunt-dashboard/src/shared/schemas.ts
- job-hunt-dashboard/src/server/services/cover-letter-service.ts
- job-hunt-dashboard/src/server/routes/api-jobs.ts
- job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts
- job-hunt-dashboard/src/client/hooks/useGenerateCoverLetter.ts
- job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx
- job-hunt-dashboard/.env.example

### Review Findings

- [x] [Review][Decision] `cover_letter_sent_at` overwritten on regeneration — resolved: always update is correct ("last generated" semantics). No code change needed.
- [x] [Review][Patch] AC4 UX: switch "no description" text to disabled button with tooltip — replace `<p>No job description available</p>` with a `disabled` button + tooltip explaining why [JobDrawer.tsx]
- [x] [Review][Patch] No timeout on n8n fetch — bare `fetch()` with no `AbortController`/`signal`; a hung n8n request holds the handler open indefinitely [cover-letter-service.ts]
- [x] [Review][Patch] Transaction error silently swallowed + post-SELECT runs unconditionally — no try/catch around `db.transaction(...)` in the route; if the transaction throws, the exception escapes unhandled and the subsequent `db.select()` still executes, returning `undefined` as `coverLetter` in a 200 [api-jobs.ts]
- [x] [Review][Patch] Post-transaction SELECT non-deterministic under concurrent requests — fetches the latest cover letter by `jobId` + `desc(createdAt)` outside the transaction; two concurrent requests within the same millisecond may return the wrong row; fixed by selecting on exact `(jobId, createdAt)` pair [api-jobs.ts]
- [x] [Review][Patch] `cover_letter` from n8n not validated — `await response.json() as { cover_letter: string }` is TypeScript-only; if n8n returns `{}` or `{ cover_letter: null }`, `undefined`/`null` propagates to the NOT NULL `content` column, causing a DB constraint violation [cover-letter-service.ts]
- [x] [Review][Patch] Webhook error message forwarded verbatim to client — the 502 branch returns `{ error: message }` with the raw exception message, potentially exposing internal URLs or n8n status codes [api-jobs.ts]
- [x] [Review][Patch] `useGenerateCoverLetter` called with `jobId=0` when job is null — `job?.id ?? 0` constructs mutation URL `/api/jobs/0/generate-cover-letter`; guard `mutationFn` with `if (!jobId) throw new Error('No job selected')` [useGenerateCoverLetter.ts]
- [x] [Review][Patch] `<Separator>` and cover letter section render when `job` is null — no null guard on the new `<Separator>` (line ~91 in JobDrawer.tsx), unlike existing separators; orphaned separator visible on first mount [JobDrawer.tsx]
- [x] [Review][Patch] `coverLetterSchema.content` accepts empty string — `content: z.string()` allows blank cover letters from n8n; add `.min(1)` [schemas.ts]
- [x] [Review][Defer] No auth on the endpoint — pre-existing pattern across all API routes; not introduced by this story [api-jobs.ts] — deferred, pre-existing
- [x] [Review][Defer] `onSuccess` doesn't proactively invalidate future `['coverLetters']` cache — Story 7.2 hasn't defined a cover-letter-specific query yet; not actionable now [useGenerateCoverLetter.ts] — deferred, pre-existing
- [x] [Review][Defer] No server-side rate-limiting / idempotency guard — `isPending` provides session-level double-submit protection; server-side rate limiting out of scope for this story — deferred, pre-existing
- [x] [Review][Defer] `N8N_WEBHOOK_URL` not logged for observability — service silently throws on failure with no URL-level logging; the spec's "URL is safe to log" implies logging was expected — deferred, pre-existing

## Change Log

- 2026-04-06: Story created by SM agent — synchronous n8n webhook contract confirmed from workflow JSON; Epic 7 story structure revised (no async callback needed)
- 2026-04-06: Implemented by dev agent — all 9 tasks complete, 6 new tests pass, 0 TypeScript errors, 79 total tests pass
- 2026-04-06: Code review complete — 2 decisions needed, 8 patches identified, 4 deferred, 6 dismissed
