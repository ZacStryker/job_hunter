# Story 39.2: Analysis — Use Pre-Stored Description, Skip Scraper

Status: done

## Story

As the system running AI analysis on a pending job,
I want to detect when a job description was already provided at creation time,
So that the scraper step is skipped and the existing description is used directly for analysis.

## Acceptance Criteria

**Given** a job was added manually with `jobDescription` already populated
**When** the analysis service processes that job
**Then** no request is made to the scraper service for that job

**Given** a job was added with both a `sourceUrl` and a `jobDescription`
**When** the analysis service processes that job
**Then** the pre-stored `jobDescription` is used directly and no scraper call is made

**Given** a job was added with only a `sourceUrl` and no `jobDescription`
**When** the analysis service processes that job
**Then** the scraper is called as normal (existing behavior unchanged)

**Given** a job with a pre-stored description is analyzed
**When** the Anthropic API call completes
**Then** the `jobDescription` field in the database retains the user's original value (not overwritten with empty string)

**Given** a manual job with no URL and no description
**When** the analysis service processes it
**Then** description is empty string and the scraper block is skipped gracefully (existing behavior)

## Tasks / Subtasks

- [x] Update `let description = ''` → `let description = job.jobDescription ?? ''` in `analysis-service.ts`
- [x] Update scraper `if` condition to `if (!description && scraperUrl && job.sourceUrl)` in `analysis-service.ts`
- [x] Add test: job with pre-populated `jobDescription` skips scraper and passes description to Anthropic

### Review Findings

- [x] [Review][Patch] Test doesn't isolate `!description` guard — test job has `source_url = null`, so the old `scraperUrl && job.sourceUrl` guard would also skip the scraper; AC2 (both sourceUrl AND jobDescription) is unexercised. Fix: add a valid `source_url` to the test INSERT. [`analysis-service.test.ts`]
- [x] [Review][Defer] Whitespace-only `jobDescription` bypasses scraper and is passed to Anthropic as-is [`analysis-service.ts:95`] — deferred, unreachable from normal insert path (39.1 trims whitespace to NULL)
- [x] [Review][Defer] Empty string `''` vs `NULL` semantic ambiguity — `''` in DB causes scraper to run (different from `null`) [`analysis-service.ts:95`] — deferred, unreachable from normal insert path
- [x] [Review][Defer] `description || null` write-back coerces explicit `''` to `null` [`analysis-service.ts`] — deferred, pre-existing behavior, unreachable from normal flow
- [x] [Review][Defer] No observability/logging when description bypass path is taken [`analysis-service.ts`] — deferred, design choice, pre-existing pattern
- [x] [Review][Defer] No AC3 regression test (null description → scraper runs) [`analysis-service.test.ts`] — deferred, covered indirectly by existing tests
- [x] [Review][Defer] No AC5 test (manual job, no URL, no description) [`analysis-service.test.ts`] — deferred, pre-existing behavior unchanged by this diff
- [x] [Review][Defer] No test for pre-stored description + Anthropic failure path [`analysis-service.test.ts`] — deferred, failure path preserves column correctly but is untested
- [x] [Review][Defer] No test for `job_description = ''` in DB [`analysis-service.test.ts`] — deferred, edge case unreachable from normal insert path
- [x] [Review][Defer] `anthropicBody` not explicitly null-checked before messages assertion [`analysis-service.test.ts`] — deferred, fails loudly if Anthropic not called

## Dev Notes

### Overview: 2 files changed, no DB migration, no schema change

`jobDescription` is already a column on the `jobs` table. Story 39.1 wired up form + API to store user-pasted descriptions at creation time. This story makes the analysis service honour that pre-stored value instead of always calling the scraper first.

---

### 1. `src/server/services/analysis-service.ts`

**The per-job loop starts at line 87. The current scraper block (lines 94–125):**

```ts
try {
  let description = ''
  if (scraperUrl && job.sourceUrl) {
    try {
      // ...scraper fetch block (unchanged)
```

**Replace exactly those two lines with:**

```ts
try {
  let description = job.jobDescription ?? ''
  if (!description && scraperUrl && job.sourceUrl) {
    try {
      // ...scraper fetch block (unchanged)
```

That is the entire change to this file. Everything else — the scraper body, Anthropic call, and DB `.set({...})` — is untouched.

**Why this works:**
- If `job.jobDescription` is a non-empty string: `description` is truthy, the `if` condition short-circuits, the scraper is never called.
- If `job.jobDescription` is `null` or `''`: `description` is `''` (falsy), the guard `!description` is true, and the scraper proceeds as before.
- The existing DB update at line 184 already writes `jobDescription: description || null`. When a pre-stored description is used, `description` holds the original value, so `description || null` stores it back unchanged. No data loss.

**Line numbers for reference (current file):**
- `let description = ''` → line 95
- `if (scraperUrl && job.sourceUrl) {` → line 96

---

### 2. `src/server/services/analysis-service.test.ts`

Add one new test inside the existing `describe('runAnalysis()', () => { ... })` block, after the last test.

The existing `insertPendingJob()` helper does not insert `job_description`, so use a direct SQL insert for this test:

```ts
test('pre-stored jobDescription: skips scraper, passes description to Anthropic, retains in DB', async () => {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, source, source_url, external_job_id, analysis_status, job_description)
     VALUES ('PreDesc Co', 'Staff Engineer', 'manual', null, 'ext-pre-1', 'pending', 'We build developer tools for AI teams.')`,
  )
  const { id } = prodSqlite.prepare('SELECT id FROM jobs ORDER BY id DESC LIMIT 1').get() as { id: number }

  let scraperCalled = false
  let anthropicBody: Record<string, unknown> | null = null

  globalThis.fetch = mock((url: string, init?: RequestInit) => {
    if (String(url).includes('scrape/listing')) {
      scraperCalled = true
      return Promise.resolve(new Response(null, { status: 500 }))
    }
    // Anthropic call — capture the body to assert Description field
    anthropicBody = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>
    return Promise.resolve(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }],
          usage: { input_tokens: 40, output_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  }) as typeof globalThis.fetch

  const result = await runAnalysis(undefined, 1)

  expect(scraperCalled).toBe(false)
  expect(result.processed).toBe(1)
  expect(result.failed).toBe(0)

  // Description was passed through to Anthropic
  const messages = (anthropicBody?.messages as Array<{ content: string }> | undefined) ?? []
  expect(messages[0]?.content).toContain('We build developer tools for AI teams.')

  // DB retains the original description (not overwritten)
  const row = prodSqlite.prepare('SELECT job_description, analysis_status FROM jobs WHERE id = ?').get(id) as {
    job_description: string | null; analysis_status: string
  }
  expect(row.job_description).toBe('We build developer tools for AI teams.')
  expect(row.analysis_status).toBe('done')
})
```

**Notes on the test:**
- No `source_url` column value is needed — the job has `null` for `source_url`, so even the old code path would have skipped the scraper; the pre-populated `job_description` now kicks in before that guard, but both paths produce the same "skip" outcome. The test's `scraperCalled = false` assertion proves it was the description guard, not the missing URL, that gated it.
- The `VALID_ANALYSIS_RESPONSE` constant (already defined at line 83 of the test file) is reused — no new fixture needed.
- `afterEach` already restores `globalThis.fetch = originalFetch` — no teardown needed in this test.
- `beforeEach` already runs `DELETE FROM jobs` — no cleanup needed.

---

### Architecture & Pattern Compliance

- **Data ownership:** `jobDescription` is scraper-owned per `project-context.md`. The user-supplied description stored in story 39.1 is treated identically — it lives in the same column, and the analysis service reads from it like it would a scraper result. No new column, no ownership change.
- **`jobDescription` in PATCH allowlist:** still NOT added — correct, `jobDescription` must never be user-patchable after creation (data ownership invariant).
- **No migration:** `jobDescription` column already exists (TEXT nullable).
- **TypeScript strict:** `job.jobDescription` is already typed `string | null` by Drizzle's select result — `?? ''` handles both `null` and `undefined` safely.
- **Test runner:** `bun:test` — `describe`, `test`, `expect`, `mock` from `bun:test` only; never import from `vitest` or `jest`.
- **Error shape:** no API changes in this story — error handling rules not applicable here.
- **No new dependencies.**

---

### Previous Story Learnings (39.1)

- The `description` state in `AddJobDrawer` needed a full reset on close/success — not applicable here (server-side story), but confirms the pattern: always verify reset paths.
- Review patch: whitespace-only description passes `min(1)` but is trimmed to NULL on insert — the `job.jobDescription ?? ''` initialiser here correctly inherits that trimmed-to-NULL behaviour from 39.1. If `jobDescription` is `null` (whitespace was trimmed), `description` starts as `''` and falls through to the scraper path.
- Review defer: `analysisStatus: 'pending'` on description-only jobs with no analysis trigger — this story is the resolution. Once 39.2 is implemented, a description-only job will be processed by the next `runAnalysis()` call and the pre-stored description will be used.

---

### Project Context Reference

- Stack: Bun 1.3.x, Hono 4.x, React 19.x, Drizzle ORM + bun:sqlite, TanStack Query v5 — no new dependencies
- Test runner: `bun:test` — never import from `vitest` or `jest`
- TypeScript strict: `noUnusedLocals`/`noUnusedParameters` enforced — ensure `description` is used wherever declared
- `jobDescription` is scraper-owned; do NOT add to PATCH allowlist

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward, no unexpected issues.

### Completion Notes List

- Changed `let description = ''` → `let description = job.jobDescription ?? ''` at analysis-service.ts:95
- Changed `if (scraperUrl && job.sourceUrl)` → `if (!description && scraperUrl && job.sourceUrl)` at analysis-service.ts:96
- Added test `pre-stored jobDescription: skips scraper, passes description to Anthropic, retains in DB` to analysis-service.test.ts
- All 14 analysis-service tests pass; 11 pre-existing failures in api-onboarding.test.ts are unrelated to this story

### File List

- job-hunt-dashboard/src/server/services/analysis-service.ts (modified)
- job-hunt-dashboard/src/server/services/analysis-service.test.ts (modified)

## Change Log

- 2026-05-26: Implemented pre-stored description shortcut in analysis-service; 2 lines changed in service, 1 new test added
