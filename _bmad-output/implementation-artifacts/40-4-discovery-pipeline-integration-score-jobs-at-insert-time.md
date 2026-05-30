---
baseline_commit: a9c5665a2130c800b98f7d60dcc3fce2e889ffd4
---

# Story 40.4: Discovery Pipeline Integration — Score Jobs at Insert Time

Status: done

## Story

As the system running discovery for a user,
I want each newly inserted job to receive a relevance score computed from the cosine similarity between the job title embedding and the user's cached resume embedding,
so that relevance scores are available immediately after discovery without requiring any additional user action.

## Acceptance Criteria

1. **Given** a user with a profile containing at least one of `summary`, `experience`, or `skills`
   **When** the discovery pipeline inserts new jobs for that user
   **Then** each newly inserted job has `relevanceScore` set to the cosine similarity between its title and the user's resume text (value in the range -1.0 to 1.0)

2. **Given** the same user runs discovery again without modifying their profile
   **When** the relevance scoring step executes
   **Then** the resume embedding is fetched from `user_embeddings` cache (not recomputed)

3. **Given** a user with no profile row, or a profile with all text fields null/empty
   **When** the discovery pipeline runs
   **Then** jobs are inserted with `relevanceScore: null` (no error thrown; discovery completes normally)

4. **Given** the embedding service throws an error for one job title
   **When** that job is scored
   **Then** `relevanceScore` for that job stays `null`; the remaining jobs in the batch are scored as normal; the discovery run is not aborted

5. **Given** a job that already existed before this discovery run (filtered by `existingIds`)
   **When** the discovery pipeline processes the search results
   **Then** its `relevanceScore` is NOT modified (jobs are filtered before scoring, consistent with `onConflictDoNothing` behavior)

6. **Given** `GET /api/jobs` is called after a discovery run
   **When** newly discovered jobs are inspected
   **Then** `relevanceScore` is a number (not null) for jobs where the user has a profile with resume text

## Tasks / Subtasks

- [x] Add `hashText` helper function to `discovery-service.ts` (AC: 1)
  - [x] `async function hashText(text: string): Promise<string>` using `crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))` and `Buffer.from(buf).toString('hex')`
  - [x] Placed as a module-level private function before `runDiscovery`

- [x] Add new imports to `discovery-service.ts` (AC: 1, 2, 3, 4)
  - [x] Add `profile` to the existing schema import (line 3)
  - [x] Add `import { getOrComputeResumeEmbedding } from './resume-embedding-cache'`
  - [x] Add `import { embed, cosineSimilarity } from './embedding-service'`

- [x] Add relevance scoring pass to `runDiscovery` in `discovery-service.ts` (AC: 1, 2, 3, 4, 5)
  - [x] Insert the scoring block AFTER the `if (userId !== undefined) { db.transaction(...) }` block (after line ~244) and BEFORE the `const bySource` calculation
  - [x] Guard: `if (userId !== undefined && newJobs.length > 0)` (newJobs.length > 0 is always true here due to early return, but keep for clarity)
  - [x] Fetch profile row: `db.select().from(profile).where(eq(profile.userId, userId)).get()`
  - [x] Build `resumeText` from `[profileRow.summary, profileRow.experience, profileRow.skills].filter(Boolean).join('\n')`; empty string if no profile
  - [x] Skip entire scoring block if `!resumeText`
  - [x] Outer try/catch: wrap resume embedding computation; on catch → entire batch stays null, no throw
  - [x] Per-job try/catch inside for-loop: `embed(job.title)` → `cosineSimilarity(resumeEmbedding, titleEmbedding)` → `db.update(jobs).set({ relevanceScore: score }).where(and(eq(jobs.userId, userId), eq(jobs.externalJobId, job.id))).run()`; on catch → that job stays null

- [x] Update `discovery-service.test.ts` (AC: 1, 3, 4)
  - [x] Add `mock.module('./resume-embedding-cache', ...)` and `mock.module('./embedding-service', ...)` at the **TOP** of the test file, BEFORE the `await import('./discovery-service')` dynamic import (critical ordering requirement)
  - [x] Add `CREATE TABLE IF NOT EXISTS profile ...` DDL to `beforeAll`
  - [x] Add `CREATE TABLE IF NOT EXISTS user_embeddings ...` DDL to `beforeAll`
  - [x] Add `DELETE FROM profile` and `DELETE FROM user_embeddings` to `beforeEach`
  - [x] Add new `describe('relevance scoring')` block with tests for: score set when profile exists, score null when no profile, per-job embed error does not abort discovery

## Dev Notes

### What Already Exists (Do NOT Recreate)

All of the following are **DONE** in previous stories and must not be modified:

- `src/db/schema.ts`: `userEmbeddings` table, `relevanceScore: real('relevance_score')` on `jobs`, `profile` table — all present
- `src/shared/schemas.ts`: `relevanceScore: z.number().nullable()` on `jobSchema` — present
- `src/db/migrations/0029_superb_betty_brant.sql`: migration committed — DB schema ready
- `src/server/services/embedding-service.ts`: `embed()`, `cosineSimilarity()` — implemented and tested
- `src/server/services/resume-embedding-cache.ts`: `getOrComputeResumeEmbedding()` — implemented and tested

### The Only File Receiving Production Logic Changes

**`src/server/services/discovery-service.ts`** — this is the only production file modified.

Current file overview (read it before implementing):
- Lines 1–6: imports (`and`, `eq`, `isNotNull`, `sql` from drizzle-orm; `db`; `jobs`, `searchConfigs`, `userSecrets`, `sourceSettings` from schema; `decrypt`, `encrypt`; `ScraperSource` type)
- Line 8–13: `ScraperResult` interface (`id: string`, `title: string`, `company: string`, `location: string | null`, `url: string | null`)
- Line 15–17: `DB_SOURCE` map
- Line 19–256: `runDiscovery` function
  - Lines 20–43: env var checks, global source settings, search config queries
  - Lines 45–110: LinkedIn/Indeed auth secret handling
  - Lines 112–159: scraper fetch, error handling
  - Lines 162–196: response processing, storage state write-back
  - Lines 198–213: existing-job dedup (`existingIds`, `newJobs` filter)
  - Lines 215–219: early-return if `newJobs.length === 0`
  - Lines 221–244: insert transaction (`if (userId !== undefined) { db.transaction(...) }`)
  - Line 246: comment `// userId undefined: inserts skipped...`
  - Lines 248–255: `bySource` tallying, return

**The scoring pass goes between line 244 (`}` of the insert if-block) and line 248 (`const bySource`).**

### Exact Implementation for `discovery-service.ts`

**New imports (add to existing lines):**

```ts
// Existing line 3 — update to add `profile`:
import { jobs, searchConfigs, userSecrets, sourceSettings, profile } from '../../db/schema'

// Add after line 5 (after the ScraperSource import):
import { getOrComputeResumeEmbedding } from './resume-embedding-cache'
import { embed, cosineSimilarity } from './embedding-service'
```

**`hashText` helper — add as module-level function before `runDiscovery` (after the `DB_SOURCE` const):**

```ts
async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Buffer.from(buf).toString('hex')
}
```

**Relevance scoring pass — insert after `if (userId !== undefined) { db.transaction(...) }` block (after the closing `}` at line ~244), before `// userId undefined: inserts skipped...` comment:**

```ts
    if (userId !== undefined && newJobs.length > 0) {
      const profileRow = db.select().from(profile)
        .where(eq(profile.userId, userId)).get()

      const resumeText = profileRow
        ? [profileRow.summary, profileRow.experience, profileRow.skills]
            .filter(Boolean).join('\n')
        : ''

      if (resumeText) {
        try {
          const profileHash = await hashText(resumeText)
          const resumeEmbedding = await getOrComputeResumeEmbedding(userId, resumeText, profileHash)

          for (const job of newJobs) {
            try {
              const titleEmbedding = await embed(job.title)
              const score = cosineSimilarity(resumeEmbedding, titleEmbedding)
              db.update(jobs)
                .set({ relevanceScore: score })
                .where(and(eq(jobs.userId, userId), eq(jobs.externalJobId, job.id)))
                .run()
            } catch {
              // best-effort; job stays with null relevanceScore
            }
          }
        } catch {
          // resume embed failed; entire batch stays with null relevanceScore
        }
      }
    }
```

### Critical: Test File Restructuring Required

**The existing `discovery-service.test.ts` MUST be restructured for the new tests to work.**

When story 40.4 adds `import { getOrComputeResumeEmbedding } from './resume-embedding-cache'` and `import { embed, cosineSimilarity } from './embedding-service'` to `discovery-service.ts`, the test file must mock these before the discovery service module is loaded.

**Rule: `mock.module` calls MUST appear BEFORE the `await import('./discovery-service')` dynamic import.** Bun resolves module dependencies at import time; the mock must be in place before the dependent module is registered.

**Correct structure for `discovery-service.test.ts`:**

```ts
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// ---- MOCK SETUP: must precede any dynamic import that depends on these modules ----

const mockEmbed = mock(async (_text: string): Promise<number[]> => new Array(384).fill(0.1))
const mockGetOrComputeResumeEmbedding = mock(
  async (_userId: number, _resumeText: string, _profileHash: string): Promise<number[]> =>
    new Array(384).fill(0.1)
)

mock.module('./embedding-service', () => ({
  embed: mockEmbed,
  cosineSimilarity: (a: number[], b: number[]) => {
    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
    return dot
  },
}))

mock.module('./resume-embedding-cache', () => ({
  getOrComputeResumeEmbedding: mockGetOrComputeResumeEmbedding,
}))

// ---- END MOCK SETUP ----

const originalFetch = globalThis.fetch

const { runDiscovery } = await import('./discovery-service')
// ... rest of file unchanged below this point
```

**Why this works for existing tests:** All existing tests insert no `profile` row. When `runDiscovery` runs, `profileRow` is `undefined`, `resumeText` is `''`, and the `if (resumeText)` block is skipped entirely — the mocks are never called. Existing tests pass without modification.

### `beforeAll` DDL Additions Required

These must be added to the `beforeAll` block in `discovery-service.test.ts`:

```ts
const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    summary TEXT,
    experience TEXT,
    skills TEXT,
    education TEXT,
    UNIQUE(user_id)
  )
`

const CREATE_USER_EMBEDDINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_embeddings (
    user_id INTEGER PRIMARY KEY NOT NULL,
    embedding TEXT NOT NULL,
    profile_hash TEXT NOT NULL
  )
`
```

Add `prodSqlite.run(CREATE_PROFILE_TABLE)` and `prodSqlite.run(CREATE_USER_EMBEDDINGS_TABLE)` to the `beforeAll` body.

Add to `beforeEach`:
```ts
prodSqlite.run('DELETE FROM profile')
prodSqlite.run('DELETE FROM user_embeddings')
```

Also add mock resets to `beforeEach`:
```ts
mockEmbed.mockReset()
mockEmbed.mockImplementation(async (_text: string) => new Array(384).fill(0.1))
mockGetOrComputeResumeEmbedding.mockReset()
mockGetOrComputeResumeEmbedding.mockImplementation(
  async (_userId: number, _resumeText: string, _profileHash: string) => new Array(384).fill(0.1)
)
```

### New Relevance Scoring Tests

Add this `describe` block at the end of the existing `describe('runDiscovery()')` block (inside it, before the closing `}`):

```ts
  describe('relevance scoring', () => {
    test('sets relevanceScore on new jobs when user has profile with resume text', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(
        `INSERT INTO profile (user_id, summary, experience, skills) VALUES (1, 'software engineer', 'backend 5yrs', 'TypeScript')`
      )

      // mockGetOrComputeResumeEmbedding returns [0.1, 0.1, ...] (default mock)
      // mockEmbed returns [0.1, 0.1, ...] (default mock)
      // cosineSimilarity([0.1*384], [0.1*384]) ≈ 0.9998... (pre-normalized vectors dot product)

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'job-r1', title: 'Backend Engineer', company: 'Acme', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      )

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      const row = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-r1'`
      ).get() as { relevance_score: number | null }
      expect(row).not.toBeNull()
      expect(row.relevance_score).not.toBeNull()
      expect(typeof row.relevance_score).toBe('number')
      expect(mockGetOrComputeResumeEmbedding).toHaveBeenCalledTimes(1)
      expect(mockEmbed).toHaveBeenCalledWith('Backend Engineer')
    })

    test('leaves relevanceScore null when user has no profile', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      // No profile row inserted

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'job-r2', title: 'Dev', company: 'Beta', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      )

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      const row = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-r2'`
      ).get() as { relevance_score: number | null }
      expect(row.relevance_score).toBeNull()
      expect(mockEmbed).not.toHaveBeenCalled()
      expect(mockGetOrComputeResumeEmbedding).not.toHaveBeenCalled()
    })

    test('leaves relevanceScore null when profile has no resume text', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      // Profile exists but no resume text (only name/email)
      prodSqlite.run(`INSERT INTO profile (user_id, name, email) VALUES (1, 'Alice', 'alice@example.com')`)

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'job-r3', title: 'Dev', company: 'Beta', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      )

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      const row = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-r3'`
      ).get() as { relevance_score: number | null }
      expect(row.relevance_score).toBeNull()
      expect(mockEmbed).not.toHaveBeenCalled()
    })

    test('per-job embed error does not abort discovery run; other jobs scored normally', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(
        `INSERT INTO profile (user_id, summary) VALUES (1, 'software engineer')`
      )

      let embedCallCount = 0
      mockEmbed.mockImplementation(async (text: string) => {
        embedCallCount++
        if (text === 'BadTitle') throw new Error('embed failed')
        return new Array(384).fill(0.1)
      })

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({
            results: [
              { id: 'job-good', title: 'Good Engineer', company: 'Acme', location: null, url: null },
              { id: 'job-bad', title: 'BadTitle', company: 'Fail Co', location: null, url: null },
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      )

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(2) // Both jobs inserted
      const goodRow = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-good'`
      ).get() as { relevance_score: number | null }
      const badRow = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-bad'`
      ).get() as { relevance_score: number | null }
      expect(goodRow.relevance_score).not.toBeNull()
      expect(badRow.relevance_score).toBeNull()
      expect(embedCallCount).toBe(2) // Both titles attempted
    })
  })
```

### Important: `job.id` is `externalJobId`

When the code does:
```ts
db.update(jobs)
  .set({ relevanceScore: score })
  .where(and(eq(jobs.userId, userId), eq(jobs.externalJobId, job.id)))
  .run()
```

`job.id` here is the `ScraperResult.id` (a string), which maps to `external_job_id` in the DB. This is correct — `job.id` is NOT the auto-increment `jobs.id` column.

### No Schema Changes Required

`relevanceScore` is already in `src/db/schema.ts` (line 14). No new migration needed. Do NOT run `bun run db:generate`.

### Data Ownership Invariant Check

Per project-context.md: "Scraper-owned" columns are set by the pipeline. `relevanceScore` is listed in schema.ts as `// Scraper/pipeline (set on INSERT — never overwritten on conflict)`. This is correct — the scoring pass uses `db.update` (not `onConflictDoUpdate`), which is fine because it targets newly inserted rows specifically.

The scoring pass does NOT appear in `api-ingest.ts` `onConflictDoUpdate.set` (it should not — that's for the ingest path, not discovery). Confirm this invariant is preserved: only `discovery-service.ts` calls the scoring pass.

### TypeScript Strict Mode Considerations

- `profileRow` type from Drizzle: `{ id: number, userId: number, name: string | null, summary: string | null, experience: string | null, skills: string | null, ... } | undefined`
- `[profileRow.summary, profileRow.experience, profileRow.skills].filter(Boolean)` narrows to `string[]` — this is correct TypeScript
- The `catch` blocks have no bound variable — `catch { ... }` (no `(e)`) is valid in TypeScript 4+/strict mode and avoids `noUnusedLocals` errors
- `hashText` uses `Buffer.from(buf).toString('hex')` — `Buffer` is global in Bun/Node.js; no import needed

### Test Infrastructure Pattern (from existing tests)

The existing test file uses this pattern for creating production db connection in tests:
```ts
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client
```

Then DDL is run via `prodSqlite.run(...)`. This is the correct pattern for schema setup in tests.

**Do NOT use `prodDb` (Drizzle) for DDL** — use `prodSqlite` (raw bun:sqlite) for `CREATE TABLE` and setup queries.

### What This Story Does NOT Do

- Does NOT modify `src/client/` — UI changes are story 40.5
- Does NOT modify `src/shared/schemas.ts` (already done in 40.2)
- Does NOT modify `src/db/schema.ts` (already done in 40.2)
- Does NOT create new migrations (schema is already correct)
- Does NOT modify `embedding-service.ts` or `resume-embedding-cache.ts` (both done in 40.3A)
- Does NOT add any new API routes
- Does NOT add `relevanceScore` to the `api-ingest.ts` `onConflictDoUpdate` block

### References

- Epic 40 full spec: `_bmad-output/planning-artifacts/epics/epic-40-relevance-pre-scoring.md`
- Story 40.3A (embedding service implementation): `_bmad-output/implementation-artifacts/40-3a-embedding-service-in-process-via-xenova-transformers.md`
- Project context (testing rules, TS strict mode): `_bmad-output/project-context.md`
- Architecture distillate (service patterns): `_bmad-output/planning-artifacts/architecture-distillate.md`
- `src/server/services/discovery-service.ts` — the ONLY production file being modified
- `src/server/services/discovery-service.test.ts` — test file being extended
- `src/server/services/embedding-service.ts` (READ ONLY — already implemented)
- `src/server/services/resume-embedding-cache.ts` (READ ONLY — already implemented)
- `src/db/schema.ts` (READ ONLY — `profile` table at line 81, `userEmbeddings` at line 192, `relevanceScore` at line 14)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Pre-existing test failures confirmed unchanged (storageStatePath/temp-file tests were already failing before this story; 2 failures before, 2 failures after)
- Pre-existing TS errors in discovery-service files unchanged; 4 new `preconnect` mock typing errors added (same class as all other mock assignments in the file)

### Completion Notes List

- Added `hashText` SHA-256 helper and relevance scoring pass to `discovery-service.ts`
- Scoring inserted after the insert transaction, before `bySource` tally
- Per-job and resume-level errors caught silently; scoring is best-effort (jobs stay `null` on failure)
- Test file restructured: `mock.module` calls for `embedding-service` and `resume-embedding-cache` placed before `await import('./discovery-service')` (critical Bun ordering requirement)
- 4 new tests added: profile with text → score set, no profile → null, profile no resume text → null, per-job embed error → other jobs still scored
- Test results: 20 pass / 2 fail (both failures pre-existing; 4 new tests all pass)

### File List

- job-hunt-dashboard/src/server/services/discovery-service.ts (update)
- job-hunt-dashboard/src/server/services/discovery-service.test.ts (update)

### Review Findings

- [x] [Review][Decision] Scoring loop issues individual `db.update` per job outside a transaction — resolved: accepted as intentional best-effort design; comment added to code. [`discovery-service.ts:~260-275`]
- [x] [Review][Patch] Silent outer catch swallows resume-embedding failure with no `console.error` — violates project rule; server logs are blind to scoring failures. [`discovery-service.ts:~275-278`]
- [x] [Review][Patch] Silent inner catch swallows per-job embed failure with no `console.error` — violates project rule. [`discovery-service.ts:~268-272`]
- [x] [Review][Patch] Mock `cosineSimilarity` computes raw dot product (result: 3.84) instead of normalized cosine (range −1.0–1.0) — test assertions are misleading; AC1 range never validated. [`discovery-service.test.ts:~17-21`]
- [x] [Review][Patch] No test for AC2 — cache-hit path (`getOrComputeResumeEmbedding` not recomputed on second run with unchanged profile) is entirely untested. [`discovery-service.test.ts`]
- [x] [Review][Patch] No test for AC5 — pre-existing jobs' `relevanceScore` is not modified; test is absent. [`discovery-service.test.ts`]
- [x] [Review][Patch] Per-job embed error test does not assert `mockGetOrComputeResumeEmbedding` called exactly once — a regression where resume embedding is re-fetched per job would pass undetected. [`discovery-service.test.ts:~595-622`]
- [x] [Review][Defer] `onConflictDoNothing` + novel `externalJobId` — score `UPDATE` silently targets non-existent row if insert is skipped due to `(company, jobTitle, userId)` conflict. [`discovery-service.ts`] — deferred, pre-existing dedup edge case
- [x] [Review][Defer] `NaN` from zero-vector embedding could be written to `relevance_score` — embedding-service responsibility, not this story's scope. [`discovery-service.ts`] — deferred, pre-existing
- [x] [Review][Defer] Whitespace-only job title silently passed to `embed()` — scraper output normalization concern, out of scope. [`discovery-service.ts`] — deferred, pre-existing
- [x] [Review][Defer] `db.select().from(profile)...get()` is synchronous — fine for Bun SQLite today, brittle if driver is ever swapped. [`discovery-service.ts`] — deferred, pre-existing
- [x] [Review][Defer] `VALID_LINKEDIN_CIPHERTEXT` inserted via template literal SQL in tests — pre-existing pattern, potential SQL injection in test setup. [`discovery-service.test.ts`] — deferred, pre-existing

## Change Log

- 2026-05-29: Story created — discovery pipeline integration for relevance scoring
- 2026-05-29: Implementation complete — scoring pass added to discovery-service.ts; test file restructured with mock.module setup and 4 new relevance scoring tests
