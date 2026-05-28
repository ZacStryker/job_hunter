# Story 40.2: Data Model — relevanceScore Column & Resume Embedding Cache

Status: done

## Story

As the system,
I want the `jobs` table to carry a nullable `relevanceScore` column and a `user_embeddings` table to exist for caching per-user resume embeddings,
so that relevance scores can be stored per job and resume embeddings can be reused across discovery runs without recomputation.

## Acceptance Criteria

1. **Given** the database migration runs at `bun start`
   **When** the runner completes
   **Then** the `jobs` table has a `relevance_score REAL` nullable column
   **And** a `user_embeddings` table exists with columns: `user_id INTEGER PRIMARY KEY`, `embedding TEXT NOT NULL`, `profile_hash TEXT NOT NULL`

2. **Given** `GET /api/jobs` is called after the migration
   **When** the response body is inspected
   **Then** each job record includes `relevanceScore: null | number` (never `undefined`)

3. **Given** `jobSchema` in `src/shared/schemas.ts`
   **When** it is inspected
   **Then** `relevanceScore: z.number().nullable()` is present (not `.optional()` — the field is always present in the API response, value is `null` when unscored)

4. **Given** a job that existed before the migration
   **When** its record is read after the migration
   **Then** `relevanceScore` is `null`

5. **Given** an INSERT into `user_embeddings` for a given `userId`
   **When** a second INSERT is made for the same `userId` with different embedding data
   **Then** the row is replaced (upsert on conflict of `user_id`)

## Tasks / Subtasks

- [x] Add `relevanceScore` column to `jobs` table in `src/db/schema.ts` (AC: 1, 4)
  - [x] Add `relevanceScore: real('relevance_score'),` to the `jobs` sqliteTable definition — no `.notNull()` so default is `null`
  - [x] Add `relevanceScore` to the "Scraper/pipeline-owned" comment block (after `externalJobId`, before `analysisStatus`)

- [x] Add `userEmbeddings` table to `src/db/schema.ts` (AC: 1, 5)
  - [x] Export `export const userEmbeddings = sqliteTable('user_embeddings', { ... })` with `userId` as `INTEGER PRIMARY KEY` (no autoIncrement), plus `embedding TEXT NOT NULL` and `profileHash TEXT NOT NULL`

- [x] Generate migration SQL (AC: 1, 4)
  - [x] Run `bun run db:generate` from `job-hunt-dashboard/` to create `src/db/migrations/0029_*.sql`
  - [x] Verify generated SQL contains `ALTER TABLE jobs ADD COLUMN relevance_score REAL` and the full `CREATE TABLE IF NOT EXISTS user_embeddings (...)` DDL
  - [x] If generated SQL is wrong or missing pieces, edit manually to match the required DDL

- [x] Update `jobSchema` in `src/shared/schemas.ts` (AC: 2, 3)
  - [x] Add `relevanceScore: z.number().nullable()` to the `.extend({})` block of `jobSchema` (NOT to `jobInputSchema`)
  - [x] Place it with the other scraper/pipeline fields (e.g., after `dateAnalyzed`)

- [x] Verify data ownership invariants are not violated (AC: 2)
  - [x] Confirm `relevanceScore` is absent from `src/server/services/ingest-service.ts` `onConflictDoUpdate.set` block (it should only update `sourceUrl`, `dateScraped`, `source`, `location`)
  - [x] Confirm `relevanceScore` is absent from `jobPatchSchema` and `updateFields` in `src/server/routes/api-jobs.ts`

- [x] Write tests (AC: 2, 5)
  - [x] `src/server/routes/api-jobs.test.ts` (add or extend): HTTP contract test — `GET /api/jobs` returns `relevanceScore: null` on each job; verify the field is present (not `undefined`)
  - [x] `src/db/user-embeddings.test.ts`: raw SQL test verifying upsert behavior — insert same `user_id` twice with different embedding/profileHash, assert only one row remains with the second values

## Dev Notes

### Spike Result (Story 40.1 — PASS)

`@xenova/transformers@2.17.2` with `onnxruntime-node@1.14.0` (native binding, NOT WASM fallback) runs successfully under Bun 1.3.11. Story 40.3A (in-process embedding) proceeds; 40.3B (Python sidecar) is skipped.

### Schema Changes

**`src/db/schema.ts`** — three additions:

1. Add `relevanceScore` to `jobs` table in the "Scraper/pipeline" block (around line 13, after `externalJobId`):
```ts
// Scraper/pipeline (set on INSERT — never overwritten on conflict)
externalJobId: text('external_job_id'),
relevanceScore: real('relevance_score'),   // <-- add this line
// Analysis-owned ...
```

2. Add the new table (append after the last table, before `export const sessions = ...` or at end of file):
```ts
export const userEmbeddings = sqliteTable('user_embeddings', {
  userId:      integer('user_id').primaryKey().notNull().references(() => users.id),
  embedding:   text('embedding').notNull(),
  profileHash: text('profile_hash').notNull(),
})
```
Note: `integer('user_id').primaryKey()` without `{ autoIncrement: true }` — `userId` is the primary key here, not a generated surrogate. No separate `id` column.

3. The `real` import is already present at line 1 of `schema.ts` (`import { integer, real, text, sqliteTable, uniqueIndex, primaryKey, index } from 'drizzle-orm/sqlite-core'`) — no new import needed.

### Migration SQL

After running `bun run db:generate`, the generated file should contain (approximately):
```sql
ALTER TABLE jobs ADD COLUMN relevance_score REAL;

CREATE TABLE IF NOT EXISTS user_embeddings (
  user_id   INTEGER PRIMARY KEY NOT NULL REFERENCES users(id),
  embedding TEXT    NOT NULL,
  profile_hash TEXT NOT NULL
);
```
If `ALTER TABLE` is missing (Drizzle sometimes generates only the new table), add it manually. The migration runner at `bun start` will apply it idempotently.

### Shared Schema Change

**`src/shared/schemas.ts`** — add to `jobSchema`'s `.extend({})` block:
```ts
export const jobSchema = jobInputSchema.extend({
  id: z.number().int(),
  applied: z.boolean(),
  status: z.string().nullable(),
  statusOverride: z.string().nullable(),
  coverLetterSentAt: z.string().nullable(),
  dateApplied: z.string().nullable(),
  archived: z.boolean(),
  resumeGeneratedAt: z.string().nullable(),
  latestStatus: z.string().nullable(),
  dateAnalyzed: z.string().nullable(),
  relevanceScore: z.number().nullable(),   // <-- add this line
})
```

Do NOT add `relevanceScore` to `jobInputSchema` — that schema covers the `POST /api/ingest` boundary (scraper-sourced records) where `relevanceScore` is never part of the payload. It is set only by the discovery pipeline service directly.

### Data Ownership Invariant (critical — verify, do not change)

`relevanceScore` is **scraper/pipeline-owned** — in the same class as `externalJobId`. This means:
- `src/server/services/ingest-service.ts` `onConflictDoUpdate.set` currently only updates `sourceUrl`, `dateScraped`, `source`, `location` — `relevanceScore` must NOT appear here
- `jobPatchSchema` in `src/server/routes/api-jobs.ts` allows only `applied`, `statusOverride`, `archived`, `jobDescription` — `relevanceScore` must NOT appear here
- `updateFields` in `app.patch('/:id', ...)` touches only user-owned fields — `relevanceScore` must NOT appear here

These are verification tasks — the current code is correct; just confirm nothing was accidentally added.

### GET /api/jobs Response (no route changes needed)

`api-jobs.ts` line 33 does `db.select().from(jobs)...all()` which returns all columns. Once `relevanceScore` is in the schema, it will be included in `...job` spread automatically. No route code changes are needed — the schema addition is sufficient.

The `latestStatus` field is computed client-side and appended via spread:
```ts
const jobsWithLatestStatus = allJobs.map((job) => ({
  ...job,
  latestStatus: latestMessageByKey.get(key)?.type ?? null,
}))
```
So the final response will include `relevanceScore` from Drizzle's typed result.

### Test Patterns

Co-locate tests next to the file under test. Use `bun:test`. Set `process.env.DB_PATH = ':memory:'` as the FIRST line before any module imports. Create tables manually via raw SQL in `beforeAll`.

**Contract test for `GET /api/jobs`** (extend or add to `src/server/routes/api-jobs.test.ts`):
```ts
process.env.DB_PATH = ':memory:'
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import app from './api-jobs'
// beforeAll: create jobs + users + sessions tables via raw SQL; also create status_events and messages if needed
// Insert a test job row (relevance_score defaults to NULL)
// Call app.request('/') and assert response.jobs[0].relevanceScore === null (not undefined)
```

**User-embeddings upsert test** (`src/db/user-embeddings.test.ts`):
```ts
process.env.DB_PATH = ':memory:'
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { db } from '../db/client'
import { userEmbeddings, users } from '../db/schema'
import { eq } from 'drizzle-orm'
// beforeAll: create users and user_embeddings tables via raw SQL
// Test: insert for userId=1 with embedding='[1,2,3]', profileHash='abc'
// Then upsert same userId with embedding='[4,5,6]', profileHash='def'
// Assert only one row, embedding='[4,5,6]', profileHash='def'
```
Use `db.insert(userEmbeddings).values({ userId, embedding, profileHash }).onConflictDoUpdate({ target: [userEmbeddings.userId], set: { embedding, profileHash } }).run()` to verify the upsert pattern that story 40.3A will use.

### Project Structure Notes

- `src/db/schema.ts` — Drizzle table definitions; Drizzle config has `casing: 'camelCase'` so `real('relevance_score')` becomes `relevanceScore` in query results automatically
- `src/db/migrations/0029_*.sql` — Drizzle Kit generates the filename; commit this SQL file
- `src/shared/schemas.ts` — single source of truth for all cross-boundary types; both server validation and client TypeScript types derive from here
- No new service files in this story; `resume-embedding-cache.ts` and `embedding-service.ts` are story 40.3A
- Spike script at `job-hunt-dashboard/spike/test-xenova-bun.ts` is throwaway; do NOT import it or modify it

### References

- Epic 40 full spec: `_bmad-output/planning-artifacts/epics/epic-40-relevance-pre-scoring.md`
- Story 40.1 result (spike PASS): `_bmad-output/implementation-artifacts/40-1-spike-validate-xenova-transformers-under-bun.md`
- Project context (data ownership rules, testing patterns): `_bmad-output/project-context.md`
- Architecture distillate (DB, schema, API patterns): `_bmad-output/planning-artifacts/architecture-distillate.md`
- Current `src/db/schema.ts` line 1: `import { integer, real, text, ... }` — `real` already imported
- Current `src/server/services/ingest-service.ts` — `onConflictDoUpdate.set` block only has `sourceUrl`, `dateScraped`, `source`, `location`
- Current `src/server/routes/api-jobs.ts` `jobPatchSchema` — only `applied`, `statusOverride`, `archived`, `jobDescription`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A

### Completion Notes List

- Migration `0029_superb_betty_brant.sql` was manually trimmed after `bun run db:generate` included spurious CREATE TABLE statements for tables already in migrations 0027/0028 (those were hand-crafted and outside Drizzle's snapshot). Final file contains only `CREATE TABLE user_embeddings` and `ALTER TABLE jobs ADD relevance_score real`.
- `src/db/user-embeddings.test.ts` uses dynamic imports (`await import(...)`) rather than static imports to ensure `process.env.DB_PATH = ':memory:'` is set before `db/client.ts` is initialized. Static imports are hoisted in ESM and would cause the test to open the real `./data/jobs.db` when Bun runs user-embeddings.test.ts before other test files in the same worker.
- Eight existing test files that create the `jobs` table were updated to include `relevance_score REAL` in their `CREATE TABLE IF NOT EXISTS jobs` DDL. This prevents Drizzle's `buildInsertQuery` (which always includes all schema columns) from failing with "table has no column" when test files share a Bun worker.
- Full test suite: 9 failures, all pre-existing before this story (baseline was 14; 5 improvements from prior API-admin DDL fixes).
- Data ownership invariants verified: `relevanceScore` is absent from `ingest-service.ts` `onConflictDoUpdate.set` and from `jobPatchSchema`/`updateFields` in `api-jobs.ts`.

### Review Findings

- [x] [Review][Patch] `relevance_score` missing from `JOBS_NULLABLE_COLUMNS` repair list [`src/db/migrate.ts:7`]

- [x] [Review][Defer] `api-admin.test.ts` jobs/messages DDL drops FK constraint on `user_id` (replaced with `DEFAULT 1`) [`src/server/routes/api-admin.test.ts:100`] — deferred, pre-existing
- [x] [Review][Defer] SQLite FK constraints not enforced (`PRAGMA foreign_keys` off by default); `user_embeddings` FK is informational only — deferred, pre-existing
- [x] [Review][Defer] No Zod/schema validation applied to outbound `GET /api/jobs` response; `jobSchema` not used at API serialization boundary — deferred, pre-existing architectural pattern

### File List

- `src/db/schema.ts` — added `relevanceScore: real('relevance_score')` to jobs table; added `userEmbeddings` table export
- `src/db/migrations/0029_superb_betty_brant.sql` — new migration: `CREATE TABLE user_embeddings` + `ALTER TABLE jobs ADD relevance_score real`
- `src/db/migrations/meta/_journal.json` — updated by drizzle-kit
- `src/db/migrations/meta/0029_snapshot.json` — generated by drizzle-kit
- `src/shared/schemas.ts` — added `relevanceScore: z.number().nullable()` to `jobSchema`
- `src/db/user-embeddings.test.ts` — new test file: 3 upsert tests for `user_embeddings` table
- `src/server/routes/api-jobs.test.ts` — added `relevance_score REAL` to DDL; added `relevanceScore is null` contract test
- `src/server/routes/api-admin.test.ts` — updated jobs DDL to full schema; fixed messages DDL
- `src/server/routes/api-cover-letter.test.ts` — added `relevance_score REAL` to jobs DDL
- `src/server/routes/api-ingest.test.ts` — added `relevance_score REAL` to jobs DDL
- `src/server/routes/api-resume.test.ts` — added `relevance_score REAL` to jobs DDL
- `src/server/routes/api-stats.test.ts` — added `relevance_score REAL` to jobs DDL
- `src/server/services/analysis-service.test.ts` — added `relevance_score REAL` to jobs DDL
- `src/server/services/discovery-service.test.ts` — added `relevance_score REAL` to jobs DDL
