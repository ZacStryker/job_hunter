---
title: 'Fix jobs stranded outside the analysis queue; surface failed analyses for manual retry'
type: 'bugfix'
created: '2026-07-10'
status: 'done'
context: ['{project-root}/_bmad-output/project-context.md']
baseline_commit: 'e6c8c393c89fe1589149930446bc7cdd674438bd'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `runAnalysis` selects only jobs with `analysis_status = 'pending'`, and nothing ever returns a job to that state — `'pending'` is written only at insert. Jobs strand in three states, permanently invisible: `NULL` (no column default; `ingestJobs` writes whatever the payload carried, which `jobInputSchema` allows to be `null`), `'failed'` (any transient error — 429, scraper timeout, bad JSON — never reset), and `'analyzing'` (set *before* the Anthropic call, so a restart strands the row). The jobs list filters on `fitScore == null` and never renders `analysis_status`, so all three look like "not analyzed yet." Analyze Jobs truthfully reports "0 analyzed" while stranded rows sit there forever.

**Approach:** Batch runs select `'pending'` and `NULL`, never `'failed'` — so a permanently-failing job cannot consume the 10-job batch budget. Failed jobs become visible via an error glyph and are retried explicitly through a targeted run that reuses `POST /api/webhooks/analysis` with an optional `{ jobIds }` body. Ingest stops writing `NULL`; a boot repair reclaims stranded `'analyzing'` rows.

## Boundaries & Constraints

**Always:** Every `jobs` query stays scoped on `userId`. The targeted path takes ids **from the client**, so its tenant filter is the only barrier to cross-tenant reads — prove it (seed as A, act as B, assert A's rows invisible). Preserve on `/api/webhooks/analysis`: the `hasRunning` 409 guard and its client-side swallow, `activityRegistry` register/progress/finalize, `recordRun` cost and token accounting, and NDJSON event shape and order. A bodiless POST must behave exactly as today. Client requests go through `apiFetch` (CSRF). Cross-boundary types come only from `src/shared/schemas.ts`. Errors are `{ error: string }` + status.

**Ask First:** Adding a DB-level `DEFAULT` to `jobs.analysis_status` (one in-memory DB is shared across `bun test`; every hand-rolled `CREATE TABLE` would have to change in lockstep). Changing `.limit(10)` or adding a drain loop. Widening the `PATCH /api/jobs/:id` allowlist.

**Never:** No `analysis_attempts` column, no retry cap. No new archive endpoint — `PATCH /api/jobs/:id` and `POST /api/jobs/bulk-archive` already work. Never select `'analyzing'` (double-charges Anthropic) or `'done'` (silently discards a result) on either path. No `@anthropic-ai/sdk`. Do not touch `onConflictDoUpdate.set` in `ingest-service.ts` — it is the data-ownership contract.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior | Error Handling |
|----------|--------------|-------------------|----------------|
| Batch picks up stranded row | `NULL`, `archived=0` | Selected, analyzed | On failure → `'failed'` |
| Batch skips failed | `'failed'` | Not selected; budget unspent | N/A |
| Batch skips in-flight/complete | `'analyzing'` / `'done'` | Not selected | N/A |
| Batch skips archived | `archived=1`, any status | Not selected | N/A |
| Targeted retry succeeds | own `'failed'` job | Re-analyzed → `'done'`; glyph clears | On failure → `'failed'` |
| Targeted retry, foreign job | id owned by another user | Not selected; `processed: 0` | No cross-tenant read |
| Targeted retry, ineligible | `'analyzing'` / `'done'` | Not selected | N/A |
| Invalid `jobIds` | empty, non-integer, or >25 | `400 { error }` | Zod rejects |
| Run already in flight | `hasRunning(userId,'analysis')` | `409`; no `register`/`recordRun` | Client swallows |
| Bodiless POST | no body | Batch run, exactly as today | N/A |
| Boot with stranded rows | `'analyzing'` at startup | Reset to `'pending'`, count logged | Idempotent |
| Ingest omits status | payload `analysisStatus: null` | Stored as `'pending'` | N/A |

</frozen-after-approval>

## Code Map

- `src/server/services/analysis-service.ts` -- `runAnalysis`; predicate at ~L104-113 is the bug. Add `opts?: { jobIds?: number[] }`. Error path L256 writes `'failed'` (keep).
- `src/server/routes/api-webhooks.ts` -- `POST /analysis` (L57) reads no body today. 409 guard L66.
- `src/server/services/ingest-service.ts` -- `.values({ ...row, userId })` L21 writes `NULL`.
- `src/db/migrate.ts` -- add repair beside `backfillDateArchived()` (L61); call from `runMigrations()` (L75), which runs at boot before requests are served (`src/index.ts:75`).
- `src/shared/schemas.ts` -- `analysisStatus` enum L24; home for the `jobIds` request schema.
- `src/client/hooks/useWebhookStream.ts` -- `trigger` L11, `apiFetch` L46; preserve `inFlightRef` L29-30 and 409 swallow L52-55. Already invalidates `['jobs']`, so the glyph self-clears.
- `src/client/components/pipeline/PipelineTable.tsx` -- `fitScore` cell L193-197; `selectedIds` L495; `Archive (n)` button L508-510.
- `src/client/components/pipeline/ScoreBadge.tsx` -- styling reference for the glyph.
- `src/client/routes/index.tsx` -- `activeJobs` L85 already surfaces failed jobs; Analyze button L212.
- `src/server/routes/api-webhooks.test.ts` -- `asUser(n)` harness L63 injects a real `userId`; reuse for tenant tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/services/analysis-service.ts` -- added `opts?: { jobIds?: number[] }`; batch selects `IS NULL OR 'pending'` with `.limit(10)`; targeted adds `inArray(jobs.id, jobIds)`, allows `'failed'`, `.limit(jobIds.length)`. `archived=false` + `userId` kept on both
- [x] `src/shared/schemas.ts` -- `analysisRequestSchema`: `jobIds` optional, non-empty, positive ints, max 25; `AnalysisRequest` type exported
- [x] `src/server/routes/api-webhooks.ts` -- absent body tolerated (only a request with no `application/json` content-type counts as bodiless); malformed JSON → 400 rather than a silent batch run; `{ jobIds }` passed through; all 400s land before `register`/`recordRun`
- [x] `src/server/services/ingest-service.ts` -- `analysisStatus: row.analysisStatus ?? 'pending'` in `.values(...)` only; `onConflictDoUpdate.set` untouched
- [x] `src/db/migrate.ts` -- idempotent `reclaimStrandedAnalyzing()`, called from `runMigrations()`
- [x] `src/client/hooks/useWebhookStream.ts` -- `trigger` widened to `(body?: Record<string, unknown>) => void` (deliberately not `unknown`, which would accept a React `MouseEvent`); JSON body + `Content-Type` sent only when a body is supplied
- [x] `src/client/components/pipeline/PipelineTable.tsx` -- error glyph + `onRetryAnalysis` / `isRetryingAnalysis` props and a `Retry analysis (n)` button beside `Archive (n)`. **Deviation:** the glyph went in the `company` cell, not `fitScore` — see Design Notes
- [x] `src/client/routes/index.tsx` -- wired `onRetryAnalysis={(ids) => analysisStream.trigger({ jobIds: ids })}`; pending state keys off the analysis stream only (discovery may legitimately overlap)
- [x] `src/server/services/analysis-service.test.ts` -- 12 new tests covering every Matrix selection row on both paths, incl. tenant isolation on the targeted path (17 → 29 pass)
- [x] `src/server/routes/api-webhooks.test.ts` -- bodiless POST passes no `jobIds`; `{ jobIds }` reaches `runAnalysis`; 5 invalid shapes → 400 with no run started; 409 still fires; targeted run still records cost (20 → 29 pass)
- [x] `src/server/routes/api-ingest.test.ts` -- repaired the stale DDL (added `date_archived`). This alone cleared **33** baseline failures, not 10: the shared in-memory DB meant this file's short `CREATE TABLE` was defining `jobs` for `api-jobs`, `discovery-service` and the ingest suites too
- [x] `src/server/routes/api-ingest.test.ts` -- `analysisStatus: null` lands as `'pending'`; an explicit status is preserved
- [x] `src/db/migrate.test.ts` -- new file: `'analyzing'` → `'pending'`; every other status untouched; second run is a no-op; reclaims across all users

**Acceptance Criteria:**
- Given jobs stranded at `NULL`, when the user clicks Analyze Jobs, then they are analyzed and the toast reports a non-zero `processed` count.
- Given a job at `'failed'`, when the user clicks Analyze Jobs, then it is not selected and the batch spends its budget on healthy jobs.
- Given a job at `'failed'`, when the user views the jobs page, then its row shows an accessible error glyph distinguishing it from a merely unanalyzed job.
- Given a selected `'failed'` job, when the user clicks Retry analysis, then only that job re-runs, the 409 guard and cost accounting still apply, and on success the glyph clears without a manual refresh.
- Given user B posts `jobIds` belonging to user A, when the targeted run executes, then A's jobs are neither read nor modified and B sees `processed: 0`.
- Given rows stranded at `'analyzing'`, when the server boots, then they reset to `'pending'` and the count is logged; booting again changes nothing.

## Design Notes

Excluding `'failed'` from the batch is load-bearing. Auto-retrying failures lets one permanently-unanalyzable job consume a slot in every 10-job batch forever — the exact "click Analyze and nothing drains" behaviour being fixed. Visibility plus explicit action replaces silent retry; archiving retires a hopeless job.

Routing retry through the existing `/api/webhooks/analysis` keeps the 409 guard, activity registry, SSE progress and `recordRun` accounting unchanged; a new endpoint would duplicate all four. Known pre-existing race (see `spec-fix-discovery-analysis-double-fire.md`): `hasRunning` is checked before `return stream(...)` while `register` runs inside the stream callback, so two near-simultaneous POSTs can slip past. The client `inFlightRef` gate is the deterministic guard — do not try to close that race here.

**Deviation — glyph moved from the Score cell to the Company cell.** The spec placed the error glyph in the `fitScore` cell, which turned out to be unrenderable where it matters: the Jobs page passes `fixedColumns={['company', 'jobTitle', 'location', 'locationType', 'source', 'relevanceScore', 'date_scraped']}`, and `PipelineTable` derives `columnVisibility` from that list, so the Score column is **hidden** on the one page a failed analysis needs to be visible on. The glyph now renders inline before the company name, which is the first column and present in every page's `fixedColumns`. Acceptance ("the row shows an accessible error glyph") is met; only the cell changed.

**The `api-ingest.test.ts` DDL repair was worth far more than expected.** It was scoped as unblocking one test and clearing 10 failures. Because the whole `bun test` run shares a single in-memory SQLite database, the first file to run `CREATE TABLE IF NOT EXISTS jobs` defines the schema for every other file — and this file's copy was missing `date_archived`. Repairing it took the suite from 42 failures to 9: `api-jobs` (POST, PATCH, bulk-archive), `discovery-service`, and both ingest suites were all collateral damage from that one missing column. The 9 that remain (onboarding/LinkedIn, Gmail labels, message sync, cover-letter, scraper `AUTH_DIR`) are untouched by this work.

## Review Outcome (2026-07-12)

Three-layer adversarial review (Blind Hunter / Edge Case Hunter / Acceptance Auditor). The Auditor found all 6 acceptance criteria MET, no boundary violations, no "Ask First" item taken unilaterally, and no project-context violations — **no spec loopback**. The other two found real defects in the code, all classified `patch` and fixed:

- **Cross-tenant hardening.** `runAnalysis` now *throws* if the targeted path is called without a `userId`, instead of degrading to `sql\`1=1\`` and analyzing whatever ids it was handed. The ids come from the client, so this was the one guard standing between tenants.
- **`jobIds: []` no longer falls through to a batch run.** "Analyze these zero jobs" was billing a full 10-job batch. It now returns an empty result. (The old behavior had a test asserting it; that test was wrong and was rewritten.)
- **Malformed JSON is now a 400, not a silent batch run.** `c.req.json().catch(() => ({}))` swallowed a truncated body as "no body", quietly converting an intended one-job retry into a billed 10-job batch. Only a request with no `application/json` content-type is treated as bodiless now.
- **Ingest coerces `'analyzing'` → `'pending'`.** A payload could previously write the one status invisible to *both* selection paths until the next reboot.
- **The retry button no longer clears the selection.** Clearing it unmounted the button on the same commit (its render is gated on `retryableIds.length`), making its own `Retrying…` state unreachable — and destroying the user's selection if the request 409'd or 400'd. On success the invalidated jobs query retires the button naturally.
- **Retry request is clamped to `ANALYSIS_RETRY_MAX`** (exported from `shared/schemas.ts` so client and server cannot disagree). Selecting 40 failed rows now retries 25 instead of 400-ing on all 40.
- **`trigger` is typed `(body?: Record<string, unknown>)`, not `unknown`.** `unknown` accepts a React `MouseEvent`, so `onClick={stream.trigger}` would have compiled and then POSTed a circular synthetic event that `JSON.stringify` throws on. Verified the new type makes that a compile error.
- **`isRetryingAnalysis` no longer keys off the discovery stream** (it claimed a retry was in flight during an unrelated discovery run), and the company cell got `min-w-0` so long names still truncate inside the new flex container.

Rejected as false positives (verified against the code): row selection is *not* index-keyed (`getRowId: (row) => String(row.id)`, `PipelineTable.tsx:453`); `GET /api/jobs` *does* return `analysisStatus`; and a dying SSE stream cannot strand a row mid-run — `onProgress` fires *before* the row is marked `'analyzing'`. Four findings deferred to `deferred-work.md`.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun run typecheck` -- expected: clean (the only type gate; currently green)
- `cd job-hunt-dashboard && bun test src/server/services/analysis-service.test.ts src/server/routes/api-webhooks.test.ts` -- expected: pass, incl. new selection, tenant-isolation, 400/409 cases
- `cd job-hunt-dashboard && bun test` -- expected: **no new failing test names** vs the `e6c8c39` baseline. Compare names, never counts — the suite is red on a clean checkout.

**Results (all green):**
- `bun run typecheck` -- clean.
- `bun run build` -- built (the >500 kB chunk warning is pre-existing).
- `bun test` -- **42 failing names at baseline → 9 after; zero new failures.** 33 pre-existing failures fixed as a side effect of the DDL repair. Targeted files: `analysis-service.test.ts` 17→29 pass, `api-webhooks.test.ts` 20→29 pass, `api-ingest.test.ts` 7→19 pass, `migrate.test.ts` 4 pass (new).
- Live-DB reproduction against `data/jobs.db` (one job at `analysis_status = NULL`, `archived = 0` — the reported stuck job): the old predicate selects **0** rows (hence the "0 jobs analyzed" toast); the new batch predicate selects **1**.

**Manual checks (still owed — needs a human at a browser):**
- `bun run dev`: a `'failed'` job shows the glyph beside its company name; Analyze Jobs skips it; selecting it and clicking `Retry analysis (1)` re-runs only that job and the glyph clears without a refresh; archiving removes it.
