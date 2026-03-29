# Story 2.1: `/api/ingest` Endpoint with Transactional Upsert

Status: done

## Story

As a developer,
I want a POST endpoint that safely upserts job records while protecting user-owned fields,
so that all data sync operations have a reliable, atomic write layer to target.

## Acceptance Criteria

1. **Given** a POST request to `/api/ingest` with a valid `IngestPayload` (array of job objects) **When** the endpoint processes the request **Then** all rows are validated against `ingestPayloadSchema` (Zod) before any DB write begins **And** all rows are written inside a single SQLite transaction — if any row fails, the entire batch rolls back and no rows are written

2. **Given** a job record already exists (matched by `company` + `job_title`) **When** `/api/ingest` receives an updated version of that record **Then** only Sheets-owned fields are updated (`fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `sourceUrl`, `dateScraped`) **And** user-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`) are NOT overwritten

3. **Given** a successful ingest **When** the response is returned **Then** the response body is `{ added: number, updated: number }` with HTTP 200 **And** no stack traces or credential values appear in any response body

4. **Given** an invalid payload (missing required fields or wrong types) **When** `/api/ingest` receives the request **Then** it returns HTTP 400 with `{ error: string }` describing the validation failure **And** no DB writes occur

## Tasks / Subtasks

- [x] Task 1: Create `src/server/middleware/error-handler.ts` — global Hono error middleware (AC: 3)
  - [x] Export `errorHandler` conforming to Hono `ErrorHandler` type
  - [x] Log error with `console.error`; return `c.json({ error: err.message }, 500)`
  - [x] Never include stack traces in response body

- [x] Task 2: Create `src/server/routes/api-ingest.ts` — POST /api/ingest handler (AC: 1, 2, 3, 4)
  - [x] Parse request body; run `ingestPayloadSchema.safeParse()` on full payload before any DB touch
  - [x] On Zod failure: return `c.json({ error: parsed.error.message }, 400)` immediately
  - [x] Pre-query existing `(company, jobTitle)` pairs to enable accurate add/update counting
  - [x] Wrap all inserts in a single `db.transaction()` — use Drizzle's synchronous transaction API
  - [x] For each row: `insert(jobs).values(row).onConflictDoUpdate({ target: [jobs.company, jobs.jobTitle], set: { ...sheetsOwnedFields } })`
  - [x] The `set` object MUST exclude all user-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`)
  - [x] Count `added`/`updated` from the pre-query key set; return `c.json({ added, updated })`
  - [x] Export default Hono app instance; do NOT use `app.route()` inside the file

- [x] Task 3: Mount route and error handler in `src/index.ts` (AC: 1, 3)
  - [x] Replace `// TODO Epic 2+: mount API routes here` with import + `app.route('/api/ingest', ingestRoute)`
  - [x] Register `app.onError(errorHandler)` after route mounting
  - [x] Do NOT change any other existing code in `src/index.ts`

- [x] Task 4: Write co-located test at `src/server/routes/api-ingest.test.ts` (AC: 1, 2, 3, 4)
  - [x] Use Bun's built-in test runner (`import { test, expect, describe, beforeEach } from 'bun:test'`)
  - [x] Use a real in-memory SQLite DB (`:memory:`) — no mocking; create the `jobs` table before each test
  - [x] Test: valid payload inserts new records → returns `{ added: N, updated: 0 }`
  - [x] Test: same payload re-sent → returns `{ added: 0, updated: N }` (idempotent, user-owned fields unchanged)
  - [x] Test: invalid payload → 400 + `{ error: string }`, zero DB writes
  - [x] Test: user-owned field in request body → field is NOT overwritten on re-ingest of the same record

- [x] Task 5: Verify (AC: 1, 2, 3, 4)
  - [x] `tsc --noEmit` — zero TypeScript errors
  - [x] `bun test src/server/routes/api-ingest.test.ts` — all tests pass
  - [x] Manual: POST to `/api/ingest` with valid payload → HTTP 200 `{ added, updated }`
  - [x] Manual: POST with missing required field → HTTP 400 `{ error: string }`
  - [x] Manual: POST same payload twice → second response shows `{ added: 0, updated: N }`
  - [x] Manual: set `applied: true` via direct DB edit, re-ingest same record → `applied` stays `true`

### Senior Developer Review (AI)

**Review Date:** 2026-03-29
**Outcome:** Changes Requested
**Layers:** Blind Hunter · Edge Case Hunter · Acceptance Auditor

#### Action Items

- [x] [Review][Patch] Composite key separator collision — `::` in `company` or `jobTitle` produces a false key match, miscounting adds/updates [api-ingest.ts:29,55]
- [x] [Review][Patch] Tests duplicate production handler logic — `runIngest` and `testApp` in test file mirror but never import the actual route; bugs in `api-ingest.ts` itself go untested [api-ingest.test.ts]
- [x] [Review][Patch] `error-handler.ts` logs `err.message` only — stack trace silently dropped, making debugging harder [error-handler.ts:4]
- [x] [Review][Defer] TOCTOU: `existingKeys` pre-query runs outside the transaction — stale under concurrency — deferred, pre-existing
- [x] [Review][Defer] Zod error response is stringified JSON (`parsed.error.message`), not a clean human-readable string — deferred, pre-existing
- [x] [Review][Defer] Empty strings accepted for `company`/`jobTitle` (no `.min(1)` guard) — deferred, pre-existing
- [x] [Review][Defer] No payload size limit — unbounded array length — deferred, pre-existing
- [x] [Review][Defer] `dateScraped` accepts any string format, no ISO-8601 validation — deferred, pre-existing

## Dev Notes

### New Files & Directories

The `src/server/` directory does NOT exist yet — create it with this structure:

```
src/server/
  middleware/
    error-handler.ts      ← Task 1
  routes/
    api-ingest.ts         ← Task 2
    api-ingest.test.ts    ← Task 4
```

Story 2.2 adds `services/` (sheets-sync, oauth-client); Story 2.3 adds `routes/api-sync.ts` and `routes/api-jobs.ts`. Do not create those files now.

### `src/index.ts` — Exact Replacement for TODO Comment

Current state (after Story 1.3):

```ts
// TODO Epic 2+: mount API routes here
```

Replace with:

```ts
import ingestRoute from './server/routes/api-ingest'
import { errorHandler } from './server/middleware/error-handler'

app.route('/api/ingest', ingestRoute)
app.onError(errorHandler)
```

Place these imports at the top of the file with the other imports. Place the `app.route()` and `app.onError()` calls immediately after the env validation block, BEFORE the `serveStatic` middleware lines.

**Current `src/index.ts` structure for reference:**
```ts
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { join } from 'node:path'
import { runMigrations } from './db/migrate'

const app = new Hono()
runMigrations()
// env validation block (REQUIRED_ENV_VARS, missingVars check)
// TODO Epic 2+: mount API routes here   ← REPLACE THIS

const distDir = join(import.meta.dir, '..', 'dist')
app.use('/*', serveStatic({ root: distDir }))
app.get('/*', serveStatic({ path: join(distDir, 'index.html') }))
// ...
```

### Error Handler — `src/server/middleware/error-handler.ts`

```ts
import type { ErrorHandler } from 'hono'

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('[error]', err.message)
  return c.json({ error: err.message }, 500)
}
```

- Never include `err.stack` in response body (security: no stack traces exposed)
- `console.error` on server is correct (architecture anti-patterns forbid `console.log` for errors)

### Ingest Route — `src/server/routes/api-ingest.ts`

```ts
import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs } from '../../db/schema'
import { ingestPayloadSchema } from '../../shared/schemas'

const app = new Hono()

app.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = ingestPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400)
  }

  const rows = parsed.data

  // Pre-query existing keys to count adds vs updates accurately
  const existing = await db
    .select({ company: jobs.company, jobTitle: jobs.jobTitle })
    .from(jobs)
  const existingKeys = new Set(existing.map((r) => `${r.company}::${r.jobTitle}`))

  let added = 0
  let updated = 0

  db.transaction((tx) => {
    for (const row of rows) {
      tx
        .insert(jobs)
        .values(row)
        .onConflictDoUpdate({
          target: [jobs.company, jobs.jobTitle],
          set: {
            fitScore: sql`excluded.fit_score`,
            recommendation: sql`excluded.recommendation`,
            roleFit: sql`excluded.role_fit`,
            requirementsMet: sql`excluded.requirements_met`,
            requirementsMissed: sql`excluded.requirements_missed`,
            redFlags: sql`excluded.red_flags`,
            jobDescription: sql`excluded.job_description`,
            sourceUrl: sql`excluded.source_url`,
            dateScraped: sql`excluded.date_scraped`,
          },
        })
        .run()

      if (existingKeys.has(`${row.company}::${row.jobTitle}`)) {
        updated++
      } else {
        added++
      }
    }
  })

  return c.json({ added, updated })
})

export default app
```

**Critical notes on this implementation:**

- `db.transaction()` is **synchronous** for bun:sqlite — do not `await` it
- `.run()` is required on each insert inside a transaction (returns `RunResult`, not a Promise)
- The `set` keys match Drizzle model property names (camelCase); the `sql\`excluded.col\`` references actual SQLite column names (snake_case) as defined in `src/db/schema.ts` column definition strings (`text('job_title')`, `integer('fit_score')`, etc.)
- User-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`) are **intentionally absent** from `set` — this is the data ownership boundary
- The `company_job_title_idx` unique index defined in `src/db/schema.ts` is the conflict target — it already exists from Story 1.2

### Shared Types — Already Available

`src/shared/schemas.ts` already exports everything needed:

```ts
import { ingestPayloadSchema } from '../../shared/schemas'
// Types: IngestPayload, JobInput, Job, SyncResult
```

**Do NOT redefine these schemas locally.** Import only from `src/shared/schemas.ts`.

### Drizzle Column Name Mapping Reference

The `excluded.` references must use the physical SQLite column names (snake_case), as defined in `src/db/schema.ts`:

| Drizzle property | SQLite column | In `excluded.` |
|---|---|---|
| `fitScore` | `fit_score` | `excluded.fit_score` |
| `recommendation` | `recommendation` | `excluded.recommendation` |
| `roleFit` | `role_fit` | `excluded.role_fit` |
| `requirementsMet` | `requirements_met` | `excluded.requirements_met` |
| `requirementsMissed` | `requirements_missed` | `excluded.requirements_missed` |
| `redFlags` | `red_flags` | `excluded.red_flags` |
| `jobDescription` | `job_description` | `excluded.job_description` |
| `sourceUrl` | `source_url` | `excluded.source_url` |
| `dateScraped` | `date_scraped` | `excluded.date_scraped` |

### Testing Approach — `src/server/routes/api-ingest.test.ts`

Use a real in-memory SQLite DB — the architecture explicitly prohibits mocking the database (mock/prod divergence caused real incidents). Use `bun:test` (built into Bun — no additional install needed):

```ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'
// ... test your handler logic directly
```

Test file co-located at `src/server/routes/api-ingest.test.ts` (not in a separate `__tests__/` directory — architecture convention).

Run with: `bun test src/server/routes/api-ingest.test.ts`

**Important:** The Hono app in `api-ingest.ts` imports `db` from `../../db/client` which uses `process.env.DB_PATH`. Tests should either set `process.env.DB_PATH = ':memory:'` before importing OR instantiate a separate test db and test the handler logic directly.

### API Contract (Frozen)

```
POST /api/ingest
Content-Type: application/json

Request:  JobInput[]  (array, validated by ingestPayloadSchema)
Response 200: { added: number, updated: number }
Response 400: { error: string }
Response 500: { error: string }  (via error-handler middleware)
```

- No envelope wrapper (`{ success: true, data: ... }` is forbidden by architecture)
- Error field name is always `error` — never `message` or `{ error: { message } }`
- This endpoint is the ONLY entry point for Sheets-sourced data — Story 2.3's `/api/sync` calls this logic internally

### Route Mounting — Story 2.3 Context

Story 2.3 adds `/api/sync` and Story 3.1 adds `GET /api/jobs`. When mounting in `src/index.ts`, use separate `.route()` calls per handler. The structure for future reference (implement ONLY the current story's route today):

```ts
// Story 2.1 (now):
app.route('/api/ingest', ingestRoute)

// Story 2.3 (later — do NOT add now):
// app.route('/api/sync', syncRoute)
// app.route('/api/jobs', jobsRoute)
```

### Previous Story Learnings (from 1.3)

- **Tailwind v4 in use** — no impact on this story (server-only), but note for future client stories
- **`bun` not in PATH for CLI** — if running CLI tools: use `/home/zac/.bun/bin/bun` or export PATH
- **TypeScript strict mode** — `tsc --noEmit` must pass; check for implicit `any` in Hono `c.req.json()` return (type it as `unknown`, then parse with Zod)
- **Review findings from 1.3** — non-null assertions flagged; be explicit with types from the start

### Anti-Patterns (Do Not Do)

- ❌ `await db.transaction()` — Drizzle bun:sqlite transactions are synchronous; no `await`
- ❌ Defining job types locally — import from `src/shared/schemas.ts` only
- ❌ `{ message: string }` in error responses — must be `{ error: string }`
- ❌ Including user-owned fields in the `onConflictDoUpdate` `set` — this breaks the data ownership boundary
- ❌ Skipping Zod validation and writing raw request body to DB
- ❌ Validating individual rows in a loop — validate the whole `IngestPayload` array first with `ingestPayloadSchema.safeParse()`
- ❌ `console.log` for errors — use `console.error` (architecture anti-pattern)
- ❌ Creating `src/server/services/` or any files beyond this story's scope

### Project Structure Notes

New directories created this story (relative to `job-hunt-dashboard/`):

```
src/server/               ← new
  middleware/             ← new
    error-handler.ts      ← new
  routes/                 ← new
    api-ingest.ts         ← new
    api-ingest.test.ts    ← new
src/index.ts              ← modified (replace TODO comment)
```

No changes to: `src/db/`, `src/shared/`, `src/client/`, `vite.config.ts`, `drizzle.config.ts`, `tsconfig.json`, `package.json`

### References

- Architecture: API patterns, error response shape `{ error: string }` [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- Architecture: data ownership boundary — Sheets-owned vs user-owned field split [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- Architecture: upsert strategy — SQLite transaction + ON CONFLICT excluding user-owned fields [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- Architecture: enforcement guidelines — anti-patterns, import rules [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines]
- Architecture: project structure — `src/server/routes/`, `src/server/middleware/` [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- Architecture: test file placement — co-located, no `__tests__/` [Source: _bmad-output/planning-artifacts/architecture.md#Test File Placement]
- Epics: Story 2.1 acceptance criteria [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- Schema: `src/db/schema.ts` — jobs table with ownership annotations, `company_job_title_idx` unique index
- Shared types: `src/shared/schemas.ts` — `ingestPayloadSchema`, `JobInput`, `IngestPayload`, `SyncResult`
- DB client: `src/db/client.ts` — `db` singleton, uses `process.env.DB_PATH`
- Previous story: Story 1.3 learnings — TypeScript strict mode, Tailwind v4, bun PATH issue [Source: _bmad-output/implementation-artifacts/1-3-app-shell-environment-config-and-react-entry.md#Dev Agent Record]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `db.select().from(jobs).all()` used for pre-query (synchronous Drizzle bun:sqlite API) — `.all()` not `.then()` since bun:sqlite is synchronous.
- `db.transaction()` is synchronous for bun:sqlite; each insert inside uses `.run()` not `await`.
- Test file: used a separate Drizzle client pointing to `:memory:` rather than setting `process.env.DB_PATH` to avoid module singleton issues. The test helper `runIngest()` mirrors the production handler logic exactly.
- `JobInput` type imported from `../../shared/schemas` — confirmed export exists.
- `*.run()` is the correct Drizzle method for inserts inside a synchronous bun:sqlite transaction.

### Completion Notes List

- Created `src/server/` directory structure (`middleware/`, `routes/`) — did not exist before this story.
- `error-handler.ts`: global Hono error middleware; logs with `console.error`, returns `{ error: err.message }` + HTTP 500; no stack traces in body.
- `api-ingest.ts`: Zod validates full payload before any DB write; synchronous `db.transaction()` wraps all inserts; `onConflictDoUpdate` targets `company_job_title_idx`, updates 9 Sheets-owned fields, intentionally omits 5 user-owned fields; returns `{ added, updated }`.
- `src/index.ts`: replaced `// TODO Epic 2+: mount API routes here` with `app.route('/api/ingest', ingestRoute)` + `app.onError(errorHandler)`; no other changes.
- 12 tests across 2 suites (business logic + HTTP contract); all pass against in-memory SQLite; confirmed user-owned field protection and idempotency.
- `tsc --noEmit` clean. Manual end-to-end with live server confirmed all ACs.

### File List

- `job-hunt-dashboard/src/server/middleware/error-handler.ts` (created)
- `job-hunt-dashboard/src/server/routes/api-ingest.ts` (created)
- `job-hunt-dashboard/src/server/routes/api-ingest.test.ts` (created)
- `job-hunt-dashboard/src/index.ts` (modified — replaced TODO comment with route mounting + error handler)

## Change Log

- 2026-03-29: Story 2.1 implemented — `/api/ingest` endpoint with transactional upsert, user-owned field protection, Zod validation, global error handler. 12 tests passing. Status → review.
- 2026-03-29: Code review patches applied — composite key separator changed to `\x00`, tests restructured to exercise real production handler via dynamic import, error-handler logs full `err` object. 14 tests passing. Status → done.
