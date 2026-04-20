# Story 21.1: Dashboard Redesign — Four-Quadrant Layout with Source & Temporal Granularity

**Epic:** 21 — Dashboard Redesign  
**Story ID:** 21-1-dashboard-redesign  
**Status:** done  
**Date:** 2026-04-20

---

## Story

As a job hunter,  
I want a reorganized dashboard with four clearly labeled quadrants (Jobs, Matches, Applications, Automations), each with stat cards, a timeline area chart, and a breakdown bar chart,  
so that I can immediately see the health of each pipeline stage at a glance.

---

## Acceptance Criteria

### AC1 — Filter bar: period + archivedFilter only
- The filter bar has two button groups: `[24h | 7 days | 30 days | All time]` and `[Active | Archived | All]`.
- The current three-group bar (which includes `Applied | Unapplied | All`) is removed entirely.
- `period` defaults to `all`; `archivedFilter` defaults to `active` (matching current behavior).

### AC2 — Quadrant 01: Jobs
- **Stat cards (3, grid cols-3):** "Jobs" (total scraped), "Companies" (distinct company count), "Sources" (distinct source count).
- **Timeline chart:** "Jobs per Day by Source" — stacked `AreaChart`, one series per scraper source (`linkedin`, `indeed`, `indeed_nl`, `arc`), `xAxis = date`.
- **Bar chart:** "Source Breakdown" — vertical `BarChart`, `xAxis = value`, `yAxis = name`, series per source.
- Both charts only render when `perDay.length > 0`.

### AC3 — Quadrant 02: Matches
- **Stat cards (3, grid cols-3):** "Matches" (total apply+investigate), "Investigate" count, "Apply" count.
- **Timeline chart:** "Matches per Day by Recommendation" — stacked `AreaChart`, series `Apply` and `Investigate`, `xAxis = date`.
- **Bar chart:** "Recommendation Breakdown" — vertical `BarChart`, series `Apply` and `Investigate`.
- Only `apply` and `investigate` recommendations appear — `skip` and `None` are excluded from this quadrant's charts.

### AC4 — Quadrant 03: Applications
- **Stat cards (3, grid cols-3):** "Applications" (total applied), "Companies" (distinct companies applied to), "Responses" (jobs with non-null `statusOverride`).
- **Timeline chart:** "Applications per Day by Response Type" — stacked `AreaChart`, series `["No Response","Submitted","Rejected","Screening","Interview","Offer","Other"]`, `xAxis = date`, grouped by `dateApplied`.
- **Bar chart:** "Status Breakdown" — vertical `BarChart`, same 7 series.
- Applications always filtered to `applied = true`; `archivedFilter` applies.

### AC5 — Quadrant 04: Automations
- **Stat cards (3, grid cols-3):** "Workflow Runs" (total run count), "Tokens" (total `inputTokens + outputTokens` across all runs, formatted as e.g. `"12.3K"`), "Cost" (total `costUsd`, formatted as `"$0.0234"`).
- **Timeline chart:** "Workflows per Day by Workflow Type" — stacked `AreaChart`, series `["Discovery","Analysis","Cover Letter","Resume"]`, `xAxis = date`, grouped by `runAt` date.
- **Bar chart:** "Cost Breakdown" — vertical `BarChart`, `costUsd` summed per workflow type, series `["Discovery","Analysis","Cover Letter","Resume"]`.
- Period filter applies; `archivedFilter` has no effect on automation data.

### AC6 — API new data shape
- `GET /api/stats` returns the new shape (see Technical Design). The old shape is replaced entirely.
- All existing `api-stats.test.ts` tests are updated or replaced to cover the new shape.

### AC7 — No regressions
- All other views (Pipeline, Matches, Tracker, History, Config, etc.) are unaffected.
- `useStatsQuery` hook updated to remove `appliedFilter` param; only `period` and `archivedFilter` remain.

---

## Technical Design

### 1. New `Stats` schema shape — `src/shared/schemas.ts`

Replace `statsSchema` and `Stats` type entirely:

```typescript
export const statsSchema = z.object({
  jobs: z.object({
    total: z.number(),
    companies: z.number(),
    sources: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      linkedin: z.number(),
      indeed: z.number(),
      indeed_nl: z.number(),
      arc: z.number(),
    })),
    bySource: z.array(z.object({ name: z.string(), value: z.number() })),
  }),
  matches: z.object({
    total: z.number(),
    apply: z.number(),
    investigate: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      apply: z.number(),
      investigate: z.number(),
    })),
    byRecommendation: z.array(z.object({ name: z.string(), value: z.number() })),
  }),
  applications: z.object({
    total: z.number(),
    companies: z.number(),
    responses: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      'No Response': z.number(),
      Submitted: z.number(),
      Rejected: z.number(),
      Screening: z.number(),
      Interview: z.number(),
      Offer: z.number(),
      Other: z.number(),
    })),
    byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
  }),
  automation: z.object({
    totalRuns: z.number(),
    totalTokens: z.number(),
    totalCost: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      Discovery: z.number(),
      Analysis: z.number(),
      'Cover Letter': z.number(),
      Resume: z.number(),
    })),
    costByWorkflow: z.array(z.object({ workflow: z.string(), cost: z.number() })),
  }),
})
export type Stats = z.infer<typeof statsSchema>
```

**Important:** Keep `STATS_PERIODS`, `StatsPeriod` unchanged. Remove old `statsSchema` only — do not touch any other schemas or types.

### 2. `api-stats.ts` — full rewrite logic

The handler receives `period` and `archivedFilter` only (drop `appliedFilter`).

**Jobs section** (`archivedFilter` + `dateCutoff` apply):
```typescript
// Distinct companies
const companies = new Set(viewJobs.map(j => j.company)).size

// Distinct sources (only non-null)
const sources = new Set(viewJobs.filter(j => j.source).map(j => j.source!)).size

// perDay by source — group viewJobs by dateScraped date, count per source key
const sourceKeys = ['linkedin', 'indeed', 'indeed_nl', 'arc'] as const
const jobsDailyMap: Record<string, Record<string, number>> = {}
for (const job of viewJobs) {
  if (!job.dateScraped) continue
  const date = job.dateScraped.slice(0, 10)
  if (!jobsDailyMap[date]) jobsDailyMap[date] = { linkedin: 0, indeed: 0, indeed_nl: 0, arc: 0 }
  const src = job.source ?? ''
  if (src in jobsDailyMap[date]) jobsDailyMap[date][src]++
}
const jobsPerDay = Object.entries(jobsDailyMap)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, counts]) => ({ date, linkedin: counts.linkedin, indeed: counts.indeed, indeed_nl: counts.indeed_nl, arc: counts.arc }))

// bySource — total per source
const sourceCountMap: Record<string, number> = { linkedin: 0, indeed: 0, indeed_nl: 0, arc: 0 }
for (const job of viewJobs) {
  const src = job.source ?? ''
  if (src in sourceCountMap) sourceCountMap[src]++
}
const bySource = sourceKeys.map(k => ({ name: k, value: sourceCountMap[k] }))
```

**Matches section** (same `viewJobs` — only `apply`/`investigate`):
```typescript
const applyCount = viewJobs.filter(j => j.recommendation === 'apply').length
const investigateCount = viewJobs.filter(j => j.recommendation === 'investigate').length

const matchesDailyMap: Record<string, { apply: number; investigate: number }> = {}
for (const job of viewJobs) {
  if (job.recommendation !== 'apply' && job.recommendation !== 'investigate') continue
  if (!job.dateScraped) continue
  const date = job.dateScraped.slice(0, 10)
  if (!matchesDailyMap[date]) matchesDailyMap[date] = { apply: 0, investigate: 0 }
  if (job.recommendation === 'apply') matchesDailyMap[date].apply++
  else matchesDailyMap[date].investigate++
}
const matchesPerDay = Object.entries(matchesDailyMap)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, c]) => ({ date, apply: c.apply, investigate: c.investigate }))

const byRecommendation = [
  { name: 'Apply', value: applyCount },
  { name: 'Investigate', value: investigateCount },
]
```

**Applications section** (`applied = true`, `archivedFilter`, `dateCutoff` on `dateApplied`):
```typescript
// appliedJobs already computed — same as before but archivedFilter + dateApplied cutoff
const appCompanies = new Set(appliedJobs.map(j => j.company)).size
const appResponses = appliedJobs.filter(j => j.statusOverride !== null).length

const STATUS_KEYS = ['No Response', 'Submitted', 'Rejected', 'Screening', 'Interview', 'Offer', 'Other'] as const
const appDailyMap: Record<string, Record<string, number>> = {}
for (const job of appliedJobs) {
  if (!job.dateApplied) continue
  const date = job.dateApplied.slice(0, 10)
  if (!appDailyMap[date]) appDailyMap[date] = Object.fromEntries(STATUS_KEYS.map(k => [k, 0]))
  const key = job.statusOverride ?? 'No Response'
  const bucket = STATUS_KEYS.includes(key as typeof STATUS_KEYS[number]) ? key : 'Other'
  appDailyMap[date][bucket]++
}
const appPerDay = Object.entries(appDailyMap)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, counts]) => ({ date, ...counts }))

const byStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }))
```

**Automation section** (period cutoff on `runAt`, no archivedFilter):
```typescript
// totalTokens — sum inputTokens + outputTokens (treat null as 0)
const totalTokens = runRows.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0)
const totalCost = runRows.reduce((s, r) => s + (r.costUsd ?? 0), 0)

// perDay by workflow — group by runAt date
const WORKFLOW_KEYS = ['Discovery', 'Analysis', 'Cover Letter', 'Resume'] as const
const autoDailyMap: Record<string, Record<string, number>> = {}
for (const run of runRows) {
  const date = run.runAt.slice(0, 10)
  if (!autoDailyMap[date]) autoDailyMap[date] = Object.fromEntries(WORKFLOW_KEYS.map(k => [k, 0]))
  const wf = parseWorkflow(run.name)
  if (WORKFLOW_KEYS.includes(wf as typeof WORKFLOW_KEYS[number])) autoDailyMap[date][wf]++
}
const autoPerDay = Object.entries(autoDailyMap)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, counts]) => ({ date, ...counts }))

// costByWorkflow — sum costUsd per workflow
const costMap: Record<string, number> = Object.fromEntries(WORKFLOW_KEYS.map(k => [k, 0]))
for (const run of runRows) {
  const wf = parseWorkflow(run.name)
  if (WORKFLOW_KEYS.includes(wf as typeof WORKFLOW_KEYS[number])) costMap[wf] += (run.costUsd ?? 0)
}
const costByWorkflow = WORKFLOW_KEYS.map(k => ({ workflow: k, cost: costMap[k] }))
```

**Return shape:**
```typescript
return c.json({
  jobs: { total: scrapedTotal, companies, sources, perDay: jobsPerDay, bySource },
  matches: { total: applyCount + investigateCount, apply: applyCount, investigate: investigateCount, perDay: matchesPerDay, byRecommendation },
  applications: { total: appTotal, companies: appCompanies, responses: appResponses, perDay: appPerDay, byStatus },
  automation: { totalRuns, totalTokens, totalCost, perDay: autoPerDay, costByWorkflow },
})
```

**Remove from response:** `pipeline`, `scraped`, `archived`, `emails`, `automation.successRate`, `automation.byWorkflow`, `automation.coverLettersGenerated`.

### 3. `useStatsQuery.ts` — remove `appliedFilter`

```typescript
export function useStatsQuery(period: StatsPeriod, archivedFilter: ArchivedFilter) {
  return useQuery<Stats>({
    queryKey: ['stats', period, archivedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (archivedFilter !== 'active') params.set('archivedFilter', archivedFilter)
      const res = await fetch(`/api/stats?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Stats>
    },
  })
}
```

Remove `AppliedFilter` type export (it was only used by `dashboard.tsx`).

### 4. `dashboard.tsx` — full redesign

**State:** only `period` (StatsPeriod, default `'all'`) and `archivedFilter` (ArchivedFilter, default `'active'`). Remove `appliedFilter` state entirely.

**Layout structure:**
```tsx
<div className="p-4 space-y-6">
  {/* Filter bar */}
  <FilterBar period={period} setPeriod={setPeriod} archivedFilter={archivedFilter} setArchivedFilter={setArchivedFilter} />

  {data && (
    <div className="space-y-8">
      <Quadrant label="Jobs" stats={...} timelineChart={...} barChart={...} />
      <Quadrant label="Matches" stats={...} timelineChart={...} barChart={...} />
      <Quadrant label="Applications" stats={...} timelineChart={...} barChart={...} />
      <Quadrant label="Automations" stats={...} timelineChart={...} barChart={...} />
    </div>
  )}
</div>
```

**Keep all existing chart utilities:** `DARK_GRID`, `DARK_TICK`, `TOOLTIP_STYLE`, `TOOLTIP_PROPS`, `AXIS_PROPS`, `formatPerDayDate`, `LabelInsideTop`, `LabelInsideRight`, `StatCard`, `ChartCard`, `NoData` — do not remove these. They'll be reused.

**Color maps needed:**
```typescript
const SOURCE_COLOR_MAP: Record<string, string> = {
  linkedin: '#60a5fa',   // blue
  indeed: '#4ade80',     // green
  indeed_nl: '#a78bfa',  // purple
  arc: '#fb923c',        // orange
}
const REC_COLOR_MAP: Record<string, string> = {
  Apply: '#4ade80',
  Investigate: '#facc15',
}
const STATUS_COLOR_MAP: Record<string, string> = {
  'No Response': '#a1a1aa',
  Submitted: '#60a5fa',
  Rejected: '#f87171',
  Screening: '#facc15',
  Interview: '#86efac',
  Offer: '#16a34a',
  Other: '#fb923c',
}
const WORKFLOW_COLOR_MAP: Record<string, string> = {
  Discovery: '#60a5fa',
  Analysis: '#4ade80',
  'Cover Letter': '#facc15',
  Resume: '#a78bfa',
}
```

**Token formatting helper:**
```typescript
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
```

**Quadrant section structure (rendered inline, not extracted as a component):**
```tsx
{/* ── Q01 Jobs ── */}
<section className="space-y-3">
  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Jobs</h2>
  <div className="grid grid-cols-3 gap-3">
    <StatCard label="Jobs" value={String(data.jobs.total)} />
    <StatCard label="Companies" value={String(data.jobs.companies)} />
    <StatCard label="Sources" value={String(data.jobs.sources)} />
  </div>
  {data.jobs.perDay.length > 0 && (
    <ChartCard title="Jobs per Day by Source" tableHeaders={['Date','LinkedIn','Indeed','Indeed NL','Arc']}
      tableData={data.jobs.perDay.map(e => [e.date, e.linkedin, e.indeed, e.indeed_nl, e.arc])}>
      {/* AreaChart stacked by source */}
    </ChartCard>
  )}
  <ChartCard title="Source Breakdown" tableHeaders={['Source','Count']}
    tableData={data.jobs.bySource.map(e => [e.name, e.value])}>
    {/* Vertical BarChart */}
  </ChartCard>
</section>
```

Repeat pattern for Q02 Matches, Q03 Applications, Q04 Automations.

**AreaChart gradient IDs** — use unique IDs per quadrant/series to avoid SVG `id` collisions:
- Q01: `gradJobsLinkedin`, `gradJobsIndeed`, `gradJobsIndeed_nl`, `gradJobsArc`
- Q02: `gradMatchesApply`, `gradMatchesInvestigate`
- Q03: `gradAppNoResp`, `gradAppSubmitted`, etc.
- Q04: `gradAutoDiscovery`, `gradAutoAnalysis`, etc.

**Applications bar chart** — the JSON spec mistakenly lists series `["Apply","Investigate"]` for Q03 bar chart. The correct series is the 7 application statuses: `['No Response','Submitted','Rejected','Screening','Interview','Offer','Other']`. Use `byStatus` data from the API.

---

## Files to Change

| File | Change |
|------|--------|
| `src/shared/schemas.ts` | Replace `statsSchema` + `Stats` type with new 4-section shape |
| `src/server/routes/api-stats.ts` | Full rewrite of handler logic; return new shape |
| `src/server/routes/api-stats.test.ts` | Update all tests for new response shape |
| `src/client/hooks/useStatsQuery.ts` | Remove `appliedFilter` param; update query key |
| `src/client/routes/dashboard.tsx` | Full redesign: 4 quadrants, new charts, new colors |

---

## Dev Agent Guardrails

**`schemas.ts` — only touch `statsSchema` and `Stats`.**  
All other exports (`jobSchema`, `messageSchema`, `webhookRunSchema`, etc.) must remain byte-for-byte identical. TypeScript strict mode means any type drift in the Stats shape will fail compilation.

**`api-stats.ts` — keep `appliedFilter` query param parsing code removed, but keep `archivedFilter` and `period` logic intact.**  
The `buildBaseWhere` helper still works — just stop passing `appliedFilter` to it. `appliedJobs` query always uses `applied = true`.

**`api-stats.ts` — keep `parseWorkflow` helper unchanged.** It's used for automation perDay grouping.

**`api-stats.ts` — the `costUsd` column comes from SQLite as `number | null` (Drizzle maps REAL → number).** The `history.tsx` story noted a bug where it was arriving as string — that was fixed in story 20-1 review. In this story use `r.costUsd ?? 0` directly; no `parseFloat` needed.

**`useStatsQuery.ts` — remove `AppliedFilter` type export.** It was only used internally by `dashboard.tsx`. If TypeScript complains about unused exports elsewhere, grep for `AppliedFilter` before removing.

**`dashboard.tsx` — do NOT create helper components outside the file.** All quadrant sections are rendered inline in `DashboardRoute`. The existing `StatCard`, `ChartCard`, `NoData`, and chart utility functions stay in the same file.

**SVG gradient `id` uniqueness.** Recharts renders `<defs>` into the SVG. If two charts on the same page share the same gradient `id` (e.g., both use `"gradApply"`), the second chart picks up the first chart's gradient. Use unique IDs per chart (prefixed by quadrant abbreviation as shown above).

**Applications `perDay` keying.** Use `job.dateApplied.slice(0, 10)` — this is already a date-only string from the DB (no time component), but `.slice(0,10)` is safe as a guard. Do NOT use `T00:00:00Z` date arithmetic here (no date comparison needed, just string grouping).

**No `bun:test` changes for `dashboard.tsx`.** The dashboard component has no unit tests — only `api-stats.test.ts` needs updates.

**Recharts imports.** All needed chart types (`AreaChart`, `Area`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `Cell`, `LabelList`, `ResponsiveContainer`) are already imported in the current `dashboard.tsx`. Do not add new Recharts dependencies.

**Stacked AreaChart pattern.** All 4 timeline charts use `stackId="1"` on every `<Area>` — this is how the existing charts work (see current `dashboard.tsx` lines 286–289). Replicate the same pattern.

**Vertical BarChart pattern for breakdown charts** — same as existing "Recommendation Breakdown" chart: `<BarChart layout="vertical">`, `<XAxis type="number">`, `<YAxis type="category" dataKey="name" width={90}>`. For source/workflow names that are longer, increase `width` to `100` or `110`.

---

## Test Guidance

**`api-stats.test.ts`** — replace shape assertions:
- Check `jobs.total`, `jobs.companies`, `jobs.sources`, `jobs.perDay`, `jobs.bySource`
- Check `matches.total`, `matches.apply`, `matches.investigate`
- Check `applications.total`, `applications.companies`, `applications.responses`
- Check `automation.totalRuns`, `automation.totalTokens`, `automation.totalCost`
- Verify `jobs.perDay` groups by source key, not recommendation
- Verify `automation.perDay` groups by workflow type
- Verify `applications.perDay` groups by `dateApplied`

Old assertions for `pipeline.byRecommendation`, `scraped.perDay`, `archived.total`, `emails.*` should be removed — those keys no longer exist.

---

## Project Context Reference

- `src/shared/schemas.ts` is single source of truth — the `Stats` type change propagates to both server and client automatically; no inline type re-definitions elsewhere
- `bun:test` only — never import from `vitest` or `jest`
- `DB_PATH = ':memory:'` at top of every test file, before any production module imports
- In-test table DDL: created manually in `beforeAll`, not via migration runner
- No new DB migrations needed — this story is pure UI/API reshaping of existing data
- `console.error` for server-side errors; `console.log` for errors is forbidden
- TanStack Query key `['stats', period, archivedFilter]` — two params after `'stats'`, not three

---

## Tasks / Subtasks

- [x] Task 1: Update `src/shared/schemas.ts` — replace `statsSchema` and `Stats` with new 4-section shape (AC6)
- [x] Task 2: Rewrite `src/server/routes/api-stats.ts` — new aggregation logic, return new shape (AC6)
  - [x] Jobs section: total, companies, sources, perDay by source, bySource
  - [x] Matches section: total, apply count, investigate count, perDay by recommendation, byRecommendation
  - [x] Applications section: total, companies, responses, perDay by status, byStatus
  - [x] Automation section: totalRuns, totalTokens, totalCost, perDay by workflow, costByWorkflow
  - [x] Remove `appliedFilter` query param handling
- [x] Task 3: Update `src/server/routes/api-stats.test.ts` — replace all assertions for new shape (AC6, AC7)
- [x] Task 4: Update `src/client/hooks/useStatsQuery.ts` — remove `appliedFilter` param and `AppliedFilter` export (AC1, AC7)
- [x] Task 5: Redesign `src/client/routes/dashboard.tsx` — 4 quadrants with new layout (AC1–AC5)
  - [x] Remove `appliedFilter` state and filter group
  - [x] Add period + archivedFilter filter bar (2 groups only)
  - [x] Quadrant 01 Jobs: 3 stat cards + timeline AreaChart by source + breakdown BarChart
  - [x] Quadrant 02 Matches: 3 stat cards + timeline AreaChart + breakdown BarChart
  - [x] Quadrant 03 Applications: 3 stat cards + timeline AreaChart by status + breakdown BarChart
  - [x] Quadrant 04 Automations: 3 stat cards + timeline AreaChart by workflow + cost BarChart
  - [x] Add `formatTokens` helper for "12.3K" display
  - [x] Use unique gradient IDs per quadrant to prevent SVG collision

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Replaced `statsSchema` and `Stats` type in schemas.ts with 4-section shape (jobs, matches, applications, automation)
- Rewrote api-stats.ts: removed appliedFilter, new aggregation for all 4 sections; kept parseWorkflow unchanged
- Replaced 32 api-stats tests covering new shape, perDay grouping, archivedFilter, period filter, automation metrics
- Updated useStatsQuery.ts: removed appliedFilter param and AppliedFilter export; query key now 2 params after 'stats'
- Redesigned dashboard.tsx: 2-group filter bar, 4 inline quadrant sections with stacked AreaCharts and vertical BarCharts; unique gradient IDs per quadrant; formatTokens helper; NoData for empty breakdown charts
- Pre-existing api-ingest.test.ts failures (date_analyzed column missing in that test's DDL) were present before this story and not introduced by these changes

### File List
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/routes/api-stats.ts`
- `job-hunt-dashboard/src/server/routes/api-stats.test.ts`
- `job-hunt-dashboard/src/client/hooks/useStatsQuery.ts`
- `job-hunt-dashboard/src/client/routes/dashboard.tsx`

### Review Findings

- [x] [Review][Patch] Q01 Source Breakdown chart missing `perDay.length > 0` guard — AC2 says "Both charts only render when `perDay.length > 0`"; the timeline has the guard but the BarChart does not [dashboard.tsx, Q01 section]
- [x] [Review][Patch] `LabelInsideTop` deleted — spec guardrail explicitly says "do not remove these" for `LabelInsideTop`; restore the function in dashboard.tsx [dashboard.tsx ~line 111]
- [x] [Review][Defer] `LabelInsideRight` shows unformatted float for cost breakdown bar labels — spec does not require formatted labels in bar charts; LabelInsideRight is a generic helper [dashboard.tsx, Q04 Cost Breakdown] — deferred, spec does not specify label format for bar charts
- [x] [Review][Defer] Double iteration over `runRows` (autoDailyMap loop + costMap loop) — minor performance, not a correctness issue [api-stats.ts, Automation section] — deferred, pre-existing pattern, not spec-specified

## Change Log

- 2026-04-20: Implemented 4-quadrant dashboard redesign — new Stats API shape (jobs/matches/applications/automation), rewrote api-stats handler, replaced all api-stats tests, removed appliedFilter from hook and dashboard, full dashboard UI redesign with stacked AreaCharts and vertical BarCharts per quadrant
