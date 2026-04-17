# Story 16.1: Jobs / Matches Page Split

Status: done

## Story

As a job seeker,
I want the Jobs page to show only unanalyzed jobs and a new Matches page to show analyzed jobs worth pursuing,
so that I can triage incoming jobs separately from deciding which analyzed matches to pursue.

## Acceptance Criteria

1. **Jobs page** (`/`) shows only non-archived jobs where `analysisStatus` is NOT `'done'` (i.e. null, `'pending'`, `'analyzing'`, `'failed'`).
2. **Matches page** (`/matches`) shows non-archived jobs where `analysisStatus === 'done'` AND `recommendation` is `'apply'` or `'investigate'`.
3. A new "Matches" nav link appears in the header between "Jobs" and "Applications".
4. When the analysis service completes analysis with `recommendation === 'skip'`, the job is automatically archived (no UI action required).
5. Jobs page empty state message is contextually appropriate ("No jobs pending analysis…").
6. Matches page has its own empty state message ("No matches yet. Run analysis to populate matches.").
7. Both pages support row-click to open the JobDrawer.
8. The Matches page reuses the existing `PipelineTable` component (no new table component).

## Tasks / Subtasks

- [x] **Task 1 — Auto-archive skip in analysis service** (AC: #4)
  - [x] In `analysis-service.ts`, add `archived: true` to the DB update `.set({...})` block when `result.recommended_action === 'skip'`
  - [x] No new API endpoints needed — this is a server-side side effect of analysis

- [x] **Task 2 — Update Jobs page filter** (AC: #1, #5)
  - [x] In `src/client/routes/index.tsx`, change `activeJobs` filter from `!j.archived` to `!j.archived && j.analysisStatus !== 'done'`
  - [x] Update empty state message to: "No jobs pending analysis. Run the scraper to discover new jobs."

- [x] **Task 3 — Create Matches route** (AC: #2, #6, #7, #8)
  - [x] Create `src/client/routes/matches.tsx`
  - [x] Filter: `!j.archived && j.analysisStatus === 'done' && (j.recommendation === 'apply' || j.recommendation === 'investigate')`
  - [x] Reuse `PipelineTable` and `JobDrawer` exactly as in `archived.tsx` — follow that file as the pattern
  - [x] Empty state: "No matches yet. Run analysis to populate matches."
  - [x] Export `MatchesRoute` function

- [x] **Task 4 — Register route in router** (AC: #2)
  - [x] In `src/client/lib/router.ts`, import `MatchesRoute` from `'../routes/matches'`
  - [x] Add `matchesRoute` with `path: '/matches'` and loader calling `queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs })`
  - [x] Add to `routeTree.addChildren([...])`

- [x] **Task 5 — Add Matches nav link** (AC: #3)
  - [x] In `src/client/components/shared/Layout.tsx`, add `<Link to="/matches">` between the "Jobs" and "Applications" links

## Dev Notes

### Key Implementation Details

**Auto-archive in analysis-service.ts (Task 1):**
The update block starting at line 138 of `analysis-service.ts` writes analysis results. Add `archived: true` conditionally:
```ts
db.update(jobs)
  .set({
    // ... existing fields ...
    analysisStatus: 'done',
    ...(result.recommended_action === 'skip' ? { archived: true } : {}),
  })
  .where(eq(jobs.id, job.id))
  .run()
```

**Jobs page filter (Task 2):**
Current code at `src/client/routes/index.tsx:67`:
```ts
const activeJobs = (jobs ?? []).filter(j => !j.archived)
```
Change to:
```ts
const activeJobs = (jobs ?? []).filter(j => !j.archived && j.analysisStatus !== 'done')
```

**Matches route pattern (Task 3):**
Use `src/client/routes/archived.tsx` as the exact structural template — it's ~45 lines and follows all conventions. Just change the filter and empty state text. No `onBulkArchive` prop needed on the Matches page.

**analysisStatus values** (from `src/shared/schemas.ts`):
- `null` — scraped, no analysis queued
- `'pending'` — queued for analysis
- `'analyzing'` — in-flight
- `'done'` — analysis complete
- `'failed'` — analysis error

**recommendation values** (from `src/shared/schemas.ts`):
- `'apply'` | `'investigate'` | `'skip'` | `null`

### Project Structure Notes

- New file: `src/client/routes/matches.tsx` — follows `kebab-case.tsx` in routes folder
- No new hooks needed — reuses `useJobsQuery` (already shared cache key `['jobs']`)
- No new API endpoints — filtering is client-side from existing `GET /api/jobs` data
- The `Job` type (from `@shared/schemas`) already has `analysisStatus` and `recommendation` fields

### Critical Rules

- **Never** redefine `Job` type — import only from `@shared/schemas`
- The `['jobs']` query key is shared by all views — do NOT create a new query key for Matches
- TanStack Router: new routes use `createRoute` with `getParentRoute: () => rootRoute` — see existing routes as the pattern
- TypeScript strict mode: `j.analysisStatus !== 'done'` is safe because `analysisStatus` is `string | null`

### No Testing Required for Client-Side Changes

Route components and client-side filtering do not have test files in this project (see `archived.tsx` — no `.test.ts` file). Only server-side service changes require tests.

**Analysis service test file:** `src/server/services/analysis-service.test.ts` exists. Add a test case verifying that when `recommended_action === 'skip'`, the job's `archived` field is set to `true` in the DB.

### References

- Jobs page: `src/client/routes/index.tsx` (filter logic at line 67)
- Matches template: `src/client/routes/archived.tsx` (use as structural pattern)
- Router: `src/client/lib/router.ts` (add route and loader)
- Nav: `src/client/components/shared/Layout.tsx` (add link between Jobs and Applications)
- Analysis service: `src/server/services/analysis-service.ts` lines 138–156 (add archived flag)
- Analysis test: `src/server/services/analysis-service.test.ts` (add skip→archive test)
- Schema: `src/shared/schemas.ts` — `analysisStatus` enum and `recommendation` enum

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 1: Added `...(result.recommended_action === 'skip' ? { archived: true } : {})` to analysis-service.ts DB update block. Added 2 tests: skip→archived=1, apply→archived=0. All 9 analysis tests pass.
- Task 2: Updated Jobs page filter to exclude `analysisStatus === 'done'` jobs. Updated empty state message.
- Task 3: Created `src/client/routes/matches.tsx` following `archived.tsx` pattern exactly. Filters for non-archived, done analysis, apply/investigate recommendation.
- Task 4: Registered `matchesRoute` at `/matches` in router.ts with `['jobs']` cache key loader.
- Task 5: Added Matches nav link in Layout.tsx between Jobs and Applications.
- Full regression suite: 192 tests pass, 0 failures.

### File List

- job-hunt-dashboard/src/server/services/analysis-service.ts
- job-hunt-dashboard/src/server/services/analysis-service.test.ts
- job-hunt-dashboard/src/client/routes/index.tsx
- job-hunt-dashboard/src/client/routes/matches.tsx (new)
- job-hunt-dashboard/src/client/lib/router.ts
- job-hunt-dashboard/src/client/components/shared/Layout.tsx

### Review Findings

- [x] [Review][Patch] Invalid model ID `claude-opus-4-6` should be `claude-opus-4-7` — every production Anthropic call will fail [analysis-service.ts:116]
- [x] [Review][Defer] Concurrent `runAnalysis()` calls can process same jobs twice (no atomic SELECT+UPDATE) [analysis-service.ts:52-62] — deferred, pre-existing
- [x] [Review][Defer] Greedy regex `/\{[\s\S]*\}/` can extract wrong JSON object when Anthropic response contains multiple JSON blocks [analysis-service.ts:132] — deferred, pre-existing

## Change Log

- 2026-04-17: Implemented Jobs/Matches page split — auto-archive on skip recommendation, Jobs page excludes analyzed jobs, new /matches route for apply/investigate results, Matches nav link added.
