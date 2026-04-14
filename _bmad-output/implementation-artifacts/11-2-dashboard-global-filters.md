# Story 11.2: Dashboard Global Filters (Show Archives / Show Unapplied)

Status: done

## Story

As a job seeker,
I want two toggle filters on the dashboard (Show Archives, Show Unapplied) that narrow all metrics and charts to the job subset I care about,
so that I can focus my analysis on active applied jobs or expand it to include archived or unapplied records as needed.

## Acceptance Criteria

1. **Given** I am on the Dashboard, **When** the page loads, **Then** both "Show Archives" and "Show Unapplied" toggles default to **off**.
2. **Given** "Show Archives" is **off** (default), **When** any metric or chart renders, **Then** all data excludes jobs where `archived = true`.
3. **Given** "Show Unapplied" is **off** (default), **When** any metric or chart renders, **Then** all data excludes jobs where `applied = false`.
4. **Given** I toggle "Show Archives" **on**, **When** the dashboard re-fetches, **Then** archived jobs are included across all affected metrics and charts with no page reload.
5. **Given** I toggle "Show Unapplied" **on**, **When** the dashboard re-fetches, **Then** unapplied jobs are included across all affected metrics and charts with no page reload.
6. **Given** both toggles are **off**, **When** any pipeline chart renders, **Then** only non-archived, applied jobs appear in Jobs per Day, Recommendation Breakdown, and Fit Score Distribution.
7. **Given** both toggles are **off**, **When** stat cards render, **Then** Scrapes / Matches / Applications all reflect the same non-archived+applied subset; Archives shows 0.
8. **Given** the Email Types chart renders, **When** filters are applied, **Then** only emails matched (by company+jobTitle) to jobs in the filtered set are counted; unmatched emails are included only when "Show Unapplied" is on.
9. **Given** any combination of toggles, **When** the Automation Runs chart renders, **Then** it is **not** affected by either toggle.
10. **Given** the filters change, **When** TanStack Query re-fetches, **Then** all four params (period, showArchived, showUnapplied) are part of the query key so each combination caches independently.

## Tasks / Subtasks

- [x] Extend `GET /api/stats` with `showArchived` and `showUnapplied` query params (AC: 2, 3, 6, 7, 8, 9)
  - [x] Parse `showArchived` (`'true'` → `true`, anything else → `false`) and `showUnapplied` from query
  - [x] Build `baseConditions` array: push `eq(jobs.archived, false)` when `!showArchived`; push `eq(jobs.applied, true)` when `!showUnapplied`
  - [x] Replace existing `scrapedWhere` / `pipelineWhere` / `archivedWhere` logic with `baseConditions + dateCutoff` composition (see API section below)
  - [x] `pipelineJobs` = non-archived subset of view jobs (always `archived=false`; when `showArchived=true` filter in-memory, when `false` viewJobs already excludes them)
  - [x] `appliedJobs` query: always `applied=true`; apply `!showArchived` condition; use `dateApplied` cutoff
  - [x] Email filtering: load all emails with date filter; build `matchingJobKeys` set from jobs matching `baseConditions` (no date filter); filter emails in-memory per rules in API section below
  - [x] Automation runs query: unchanged — no new conditions added

- [x] Update `useStatsQuery` hook (AC: 10)
  - [x] Add `showArchived: boolean` and `showUnapplied: boolean` params to function signature
  - [x] Query key: `['stats', period, showArchived, showUnapplied]`
  - [x] Build URL with `URLSearchParams`; set `showArchived=true` and `showUnapplied=true` only when `true` (omit when false → server defaults to false)

- [x] Add filter toggles to `DashboardRoute` (AC: 1, 4, 5)
  - [x] Add `useState(false)` for `showArchived` and `showUnapplied`
  - [x] Pass both booleans to `useStatsQuery`
  - [x] Render two toggle buttons in the existing filter bar alongside the period buttons — use same pill style; active (on) = `bg-zinc-700 text-zinc-100`; inactive (off) = `text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800`
  - [x] Separate toggles from period buttons visually with a `|` divider or `ml-4` gap

- [x] Add tests for new filter params in `api-stats.test.ts` (AC: 2, 3, 6, 7, 8, 9)
  - [x] `showUnapplied=false` (default): unapplied job excluded from pipeline metrics; applied job included
  - [x] `showUnapplied=true`: unapplied job included in pipeline metrics
  - [x] `showArchived=false` (default): archived job excluded; Archives stat = 0
  - [x] `showArchived=true`: archived job included; Archives stat = 1
  - [x] Both on (`showArchived=true&showUnapplied=true`): all jobs visible
  - [x] Email filtering: email matched to an applied non-archived job included when `showUnapplied=false`
  - [x] Email filtering: unmatched email (null company) excluded when `showUnapplied=false`, included when `showUnapplied=true`
  - [x] Email filtering: email matched to an archived job excluded when `showArchived=false`

## Dev Notes

### API: `GET /api/stats` — extended params

**File**: `src/server/routes/api-stats.ts`

**Parse new params** (no new shared type needed — just query strings):
```typescript
const showArchived = c.req.query('showArchived') === 'true'
const showUnapplied = c.req.query('showUnapplied') === 'true'
```

**Base condition builder** (replaces the separate `pipelineWhere` / `scrapedWhere` / `archivedWhere` blocks):
```typescript
function buildBaseWhere(showArchived: boolean, showUnapplied: boolean) {
  const conds = [
    !showArchived ? eq(jobs.archived, false) : undefined,
    !showUnapplied ? eq(jobs.applied, true) : undefined,
  ].filter((c): c is SQL => c !== undefined)
  return conds.length > 0 ? and(...conds) : undefined
}
```

**Scrape / pipeline queries** (replace existing blocks):
```typescript
const baseWhere = buildBaseWhere(showArchived, showUnapplied)
const scrapedWhere = and(baseWhere, dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined)

// Single load — all other pipeline metrics computed from this
const viewJobs = db.select().from(jobs).where(scrapedWhere).all()
const scrapedTotal = viewJobs.length
const archivedTotal = viewJobs.filter(j => j.archived).length

// Pipeline (recommendation breakdown, fit score) = non-archived subset
// When showArchived=false, viewJobs is already non-archived; when true, filter in-memory
const pipelineJobs = showArchived ? viewJobs.filter(j => !j.archived) : viewJobs
const pipelineTotal = pipelineJobs.length

// perDay — build from viewJobs (replace existing dailyRows query)
const dailyMap: Record<string, { apply: number; investigate: number; skip: number; none: number }> = {}
for (const job of viewJobs) {
  if (!job.dateScraped) continue
  const date = job.dateScraped.slice(0, 10)
  if (!dailyMap[date]) dailyMap[date] = { apply: 0, investigate: 0, skip: 0, none: 0 }
  if (job.recommendation === 'apply') dailyMap[date].apply++
  else if (job.recommendation === 'investigate') dailyMap[date].investigate++
  else if (job.recommendation === 'skip') dailyMap[date].skip++
  else dailyMap[date].none++
}
const perDay = Object.entries(dailyMap)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, counts]) => ({ date, ...counts }))
```

**Applications query** (always `applied=true`, showArchived-aware, dateApplied cutoff):
```typescript
const appWhere = and(
  eq(jobs.applied, true),
  !showArchived ? eq(jobs.archived, false) : undefined,
  dateCutoff ? gte(jobs.dateApplied, dateCutoff) : undefined,
)
const appliedJobs = db.select().from(jobs).where(appWhere).all()
```
Note: `showUnapplied` is irrelevant here — applications section always shows applied jobs only.

**Email filtering** (in-memory, because `messages` has no `jobId` FK — matching is on `company`+`jobTitle`):
```typescript
// Build matching set from ALL jobs passing base conditions (no date restriction)
const matchingJobs = db.select({ company: jobs.company, jobTitle: jobs.jobTitle })
  .from(jobs)
  .where(baseWhere)
  .all()
const matchingJobKeys = new Set(matchingJobs.map(j => `${j.company}\x00${j.jobTitle}`))

// Load emails with date filter
const allEmails = datetimeCutoff
  ? db.select().from(messages).where(gte(messages.receivedAt, datetimeCutoff)).all()
  : db.select().from(messages).all()

// Filter: matched emails must exist in matchingJobKeys; unmatched only when showUnapplied=true
const relevantEmails = allEmails.filter(m => {
  if (m.company === null || m.jobTitle === null) return showUnapplied
  return matchingJobKeys.has(`${m.company}\x00${m.jobTitle}`)
})
```
Key separator `\x00` matches project testing convention (see project-context testing rules).

Replace `emailTotal`, `emailRows`, and `byType` computation to use `relevantEmails` instead of raw `emailRows`.

**Automation runs** — untouched:
```typescript
// runRows query, totalRuns, successRate, byWorkflow, coverLettersGenerated — NO changes
```

### Hook: `useStatsQuery`

**File**: `src/client/hooks/useStatsQuery.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import type { Stats, StatsPeriod } from '@shared/schemas'

export function useStatsQuery(period: StatsPeriod, showArchived: boolean, showUnapplied: boolean) {
  return useQuery<Stats>({
    queryKey: ['stats', period, showArchived, showUnapplied],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (showArchived) params.set('showArchived', 'true')
      if (showUnapplied) params.set('showUnapplied', 'true')
      const res = await fetch(`/api/stats?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Stats>
    },
  })
}
```

Query key includes `showArchived` and `showUnapplied` so every combination caches independently — never collapse to just `['stats', period]`.

### Dashboard Component

**File**: `src/client/routes/dashboard.tsx`

New state in `DashboardRoute`:
```tsx
const [showArchived, setShowArchived] = useState(false)
const [showUnapplied, setShowUnapplied] = useState(false)
const { data, isPending, isError, error } = useStatsQuery(period, showArchived, showUnapplied)
```

Filter bar — extend existing period selector with the two toggles:
```tsx
<div className="flex items-center gap-1">
  {STATS_PERIODS.map((p) => (
    <button key={p} onClick={() => setPeriod(p)} className={/* existing classes */}>
      {PERIOD_LABELS[p]}
    </button>
  ))}

  <div className="w-px h-5 bg-zinc-700 mx-2" /> {/* visual divider */}

  {[
    { label: 'Archives', value: showArchived, setter: setShowArchived },
    { label: 'Unapplied', value: showUnapplied, setter: setShowUnapplied },
  ].map(({ label, value, setter }) => (
    <button
      key={label}
      onClick={() => setter((s) => !s)}
      className={[
        'px-3 py-1.5 text-sm rounded transition-colors',
        value
          ? 'bg-zinc-700 text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
      ].join(' ')}
    >
      {value ? '✓ ' : ''}{label}
    </button>
  ))}
</div>
```

No other changes to `DashboardRoute` — the data shape returned by the API is unchanged; only what's counted in each field changes.

### Testing

**File**: `src/server/routes/api-stats.test.ts`

Set up existing test infra applies. Add test group `describe('showArchived / showUnapplied filters', ...)`.

Table setup in `beforeAll` already creates `jobs`, `messages`, etc. via raw SQL (existing pattern).

New test scenarios (business logic layer — call handler directly):

```typescript
// Insert a non-archived, applied job and a non-archived, unapplied job and an archived, applied job

test('showUnapplied=false excludes unapplied jobs from pipeline', ...)
// insert unapplied job; GET /api/stats?showUnapplied=false → pipeline.total = 0 or excludes unapplied

test('showUnapplied=true includes unapplied jobs in pipeline', ...)

test('showArchived=false excludes archived jobs; archived stat = 0', ...)

test('showArchived=true includes archived jobs; archived stat = 1', ...)

test('showArchived=true&showUnapplied=true includes all jobs', ...)

test('email matched to applied+non-archived job included when showUnapplied=false', ...)
// insert message with company/jobTitle matching an applied non-archived job
// GET /api/stats?showUnapplied=false → emails.total = 1

test('unmatched email excluded when showUnapplied=false', ...)
// insert message with NULL company
// GET /api/stats?showUnapplied=false → emails.total = 0

test('unmatched email included when showUnapplied=true', ...)

test('email matched to archived job excluded when showArchived=false', ...)
// insert message matching an archived job
// GET /api/stats (default, showArchived=false) → emails.total = 0
```

Remember: `process.env.DB_PATH = ':memory:'` must be set **before** any production imports. Create all tables via raw SQL in `beforeAll`.

### Shared Schemas

No schema changes needed — the two new query params are booleans passed as URL params and consumed server-side only. The `Stats` response shape is unchanged (the filters affect what is counted, not the shape of the response).

### Anti-Patterns to Avoid

- Do NOT use `showArchived=false` omission to infer the default on the server — always parse `=== 'true'` and default to `false`; omitting the param and sending `false` must behave identically
- Do NOT add the `showArchived`/`showUnapplied` booleans to the `statsSchema` in shared schemas — they are request params, not response fields
- Do NOT use `['stats', period]` as query key — must include both booleans: `['stats', period, showArchived, showUnapplied]`
- Do NOT modify the automation runs query — it must remain unaffected by either filter
- Do NOT use `queryClient.setQueryData` — `useStatsQuery` uses standard invalidation via query key
- Do NOT use `console.log` for errors; `console.error` only
- The `messages` table has NO `jobId` FK — do not attempt a SQL join between messages and jobs; use the in-memory `matchingJobKeys` Set approach

### Project Structure Notes

Modified files only (no new files):
```
src/server/routes/api-stats.ts        — add showArchived/showUnapplied params, refactor queries
src/server/routes/api-stats.test.ts   — add filter test group
src/client/hooks/useStatsQuery.ts     — add showArchived/showUnapplied params + query key
src/client/routes/dashboard.tsx       — add two useState toggles, extend filter bar UI
```

No schema migration needed. No new shared type needed.

### References

- [Source: _bmad-output/project-context.md] — `\x00` key separator convention, never join messages to jobs by FK (no FK exists), `console.error` for server errors
- [Source: _bmad-output/project-context.md] — API response shape (no envelope), query key shapes
- [Source: src/server/routes/api-stats.ts] — existing query structure to refactor (replace scrapedWhere/pipelineWhere/archivedWhere/dailyRows blocks)
- [Source: src/client/hooks/useStatsQuery.ts] — existing hook signature to extend
- [Source: src/client/routes/dashboard.tsx] — period selector button pattern to match for toggle buttons
- [Source: src/db/schema.ts] — confirms `messages` has no `jobId` column; matching is via `company`+`jobTitle` (both nullable)

## Review Findings

- [x] [Review][Decision] perDay chart aligned to pipelineJobs — changed `api-stats.ts` to iterate `pipelineJobs` (non-archived subset) instead of `viewJobs` for the daily breakdown, keeping all three pipeline charts consistent.

- [x] [Review][Defer] Period date columns inconsistent across metrics (dateScraped for viewJobs, dateApplied for appliedJobs, receivedAt for emails) [api-stats.ts] — deferred, pre-existing design
- [x] [Review][Defer] No Zod/schema validation on showArchived/showUnapplied params (period is validated against STATS_PERIODS; new params use loose string coercion only) [api-stats.ts] — deferred, pre-existing inconsistency
- [x] [Review][Defer] No test explicitly asserts scraped.total excludes unapplied jobs when showUnapplied=false; only pipeline.total is checked [api-stats.test.ts] — deferred, minor coverage gap
- [x] [Review][Defer] Jobs with null dateScraped are counted in scrapedTotal (period=all) but silently skipped in perDay dailyMap [api-stats.ts] — deferred, pre-existing behavior

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None — implementation went cleanly on first pass.

### Completion Notes List
- Extended `GET /api/stats` with `showArchived` / `showUnapplied` query params; replaced three separate where-clause blocks (`scrapedWhere`, `pipelineWhere`, `archivedWhere`) with a unified `buildBaseWhere` helper and a single `viewJobs` load. The separate `dailyRows` query was eliminated — `perDay` is now computed in-memory from `viewJobs`.
- Email filtering refactored to in-memory approach using a `matchingJobKeys` Set (company+jobTitle keyed with `\x00` separator) since `messages` has no `jobId` FK. Unmatched emails (null company/jobTitle) included only when `showUnapplied=true`.
- Automation runs query left completely untouched as specified.
- Updated `useStatsQuery` to accept `showArchived` and `showUnapplied`; query key is `['stats', period, showArchived, showUnapplied]`.
- Added two toggle buttons to the `DashboardRoute` filter bar (Archives, Unapplied) with a vertical divider separating them from period buttons.
- Updated existing tests to add `applied=1` to job inserts where the test expects pipeline coverage (default behavior now requires applied=true). Added 9 new filter tests covering all AC scenarios.
- All 120 tests pass (26 in api-stats.test.ts including 9 new filter tests).

### File List
- job-hunt-dashboard/src/server/routes/api-stats.ts
- job-hunt-dashboard/src/server/routes/api-stats.test.ts
- job-hunt-dashboard/src/client/hooks/useStatsQuery.ts
- job-hunt-dashboard/src/client/routes/dashboard.tsx

### Change Log
- 2026-04-12: Implemented dashboard global filters (showArchived, showUnapplied) — API params, hook update, UI toggles, and tests (Story 11.2)
