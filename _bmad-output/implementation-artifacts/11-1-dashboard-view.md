# Story 11.1: Dashboard View

Status: done

## Story

As a job seeker,
I want a dashboard with time-filtered metrics and charts across my pipeline, applications, emails, and automation activity,
so that I can quickly assess the health of my job hunt at a glance.

## Acceptance Criteria

1. **Given** I navigate to `/dashboard`, **When** the page loads, **Then** I see four stat cards (Total Jobs, Applied, Response Rate, Emails), four chart sections (Recommendation Breakdown, Fit Score Distribution, Application Status, Email Types, Automation Runs), and a period selector.
2. **Given** I am on the Dashboard, **When** I select a period (24h, 7d, 30d, All Time), **Then** all metrics and charts update to reflect only data within that period, with no page reload.
3. **Given** the period is "All Time", **When** the dashboard renders, **Then** pipeline metrics show all non-archived jobs; application metrics show all applied jobs; email metrics show all messages; automation metrics show all webhook runs.
4. **Given** the period is 24h, 7d, or 30d, **When** the dashboard renders, **Then** pipeline metrics filter by `dateScraped`; application metrics filter by `dateApplied`; email metrics filter by `receivedAt`; automation metrics filter by `runAt`.
5. **Given** the Dashboard tab exists in the nav, **When** I visit any route, **Then** "Dashboard" appears as the first nav tab linking to `/dashboard`.
6. **Given** no data exists for a chart, **When** the chart renders, **Then** it shows a "No data" empty state rather than a broken chart.
7. **Given** the dashboard is loading, **When** the API request is in flight, **Then** I see a loading state (skeleton or spinner); errors surface as an inline error message.
8. **Given** a chart displays, **When** I hover over a bar or pie slice, **Then** a tooltip shows the exact value.

## Tasks / Subtasks

- [x] Install Recharts (AC: 1, 4)
  - [x] `bun add recharts` in `job-hunt-dashboard/`
  - [x] Confirm `recharts` appears in `package.json` dependencies (not devDependencies)

- [x] Add `Stats` type to shared schemas (AC: 1, 2)
  - [x] Add `statsSchema` and `export type Stats` to `src/shared/schemas.ts`
  - [x] Add `StatsPeriod` literal type: `'24h' | '7d' | '30d' | 'all'`

- [x] Create `GET /api/stats` route (AC: 2, 3, 4)
  - [x] Create `src/server/routes/api-stats.ts`
  - [x] Accept `?period=24h|7d|30d|all` query param; default to `'all'`
  - [x] Return stats shape matching `statsSchema`
  - [x] Mount route in `src/index.ts` as `app.route('/api/stats', statsRoute)`

- [x] Create `useStatsQuery` hook (AC: 2, 7)
  - [x] Create `src/client/hooks/useStatsQuery.ts`
  - [x] Query key: `['stats', period]`
  - [x] Fetch `GET /api/stats?period={period}`

- [x] Create Dashboard route component (AC: 1, 5, 6, 7, 8)
  - [x] Create `src/client/routes/dashboard.tsx`
  - [x] Period selector (dropdown or tab group): `24h | 7d | 30d | All Time`; default `all`; stored in `useState`
  - [x] Stat cards row: Total Jobs, Applied, Response Rate, Emails
  - [x] Charts: Recommendation Donut, Fit Score Bar, Application Status Horizontal Bar, Email Types Bar, Automation Runs Grouped Bar
  - [x] Loading state via `isPending`, error state via `isError`

- [x] Register `/dashboard` route and nav tab (AC: 5)
  - [x] Add `dashboardRoute` in `src/client/lib/router.ts` with path `/dashboard` and route loader
  - [x] Add `routeTree` entry — insert before existing routes
  - [x] Add "Dashboard" `<Link to="/dashboard">` as first tab in `src/client/components/shared/Layout.tsx`

## Dev Notes

### Dependencies
- **Install Recharts**: `bun add recharts` — runtime dep, not dev. Recharts is a React charting library built on D3. No separate type package needed (types bundled).
- Current project has NO charting library installed. Do not use Chart.js, Victory, or Visx — use Recharts only.

### API: `GET /api/stats`

**File**: `src/server/routes/api-stats.ts`

**Period filtering logic**:
```typescript
function getPeriodCutoffs(period: string) {
  if (period === 'all') return { datetimeCutoff: null, dateCutoff: null }
  const ms = period === '24h' ? 86_400_000 : period === '7d' ? 604_800_000 : 2_592_000_000
  const iso = new Date(Date.now() - ms).toISOString()
  return { datetimeCutoff: iso, dateCutoff: iso.slice(0, 10) }
}
```
- `dateCutoff` (`'2026-04-04'`) → use for `dateScraped`, `dateApplied` (date-only columns)
- `datetimeCutoff` (full ISO) → use for `receivedAt`, `runAt` (datetime columns)
- Always `AND archived = false` for pipeline job counts

**Drizzle query pattern for conditional date filter**:
```typescript
const where = dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined
const rows = db.select().from(jobs).where(and(eq(jobs.archived, false), where)).all()
```

**Response shape** (no envelope — direct fields per project convention):
```typescript
{
  pipeline: {
    total: number,
    byRecommendation: Array<{ name: string; value: number }>,  // 'apply'|'investigate'|'skip'|null→'None'
    byFitScore: Array<{ bucket: string; count: number }>,       // '<60' | '60-79' | '80+'
  },
  applications: {
    total: number,
    byStatus: Array<{ status: string; count: number }>,         // statusOverride values + 'Applied (no status)'
    responseRate: number | null,                                 // null if total === 0
  },
  emails: {
    total: number,
    byType: Array<{ type: string; count: number }>,             // MESSAGE_TYPES + 'Unclassified'
  },
  automation: {
    totalRuns: number,
    successRate: number | null,
    byWorkflow: Array<{ workflow: string; success: number; failed: number }>,
    coverLettersGenerated: number,
  }
}
```

**`byWorkflow` construction**: Use `parseName` logic (same as `history.tsx`) to extract workflow from `webhook_runs.name`:
- Names starting with `'Cover Letter - '` → workflow = `'Cover Letter'`
- Names starting with `'Resume - '` → workflow = `'Resume'`
- Otherwise → workflow = name as-is (`'Discovery'`, `'Analysis'`)

**`responseRate`**: `(count of applied jobs with statusOverride not null) / total applied jobs`

**`coverLettersGenerated`**: Count rows in `cover_letters` table filtered by `createdAt` using `datetimeCutoff`.

### TanStack Query

**Query key**: `['stats', period]` — period is part of the key so each period is independently cached.

**Do NOT use** `['stats']` alone — all period selections would share one stale cache entry.

```typescript
// src/client/hooks/useStatsQuery.ts
export function useStatsQuery(period: StatsPeriod) {
  return useQuery<Stats>({
    queryKey: ['stats', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats?period=${period}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Stats>
    },
  })
}
```

### Router

Add to `src/client/lib/router.ts`:
```typescript
import { DashboardRoute } from '../routes/dashboard'

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardRoute,
  // No loader needed — stats query uses period state, not pre-fetchable at route level
})

const routeTree = rootRoute.addChildren([dashboardRoute, indexRoute, trackerRoute, ...])
```

**No route loader** for dashboard — the query key includes `period` which is runtime state (not known at load time). Omit `loader` entirely; let `useStatsQuery` handle loading state normally.

### Dashboard Component Structure

**File**: `src/client/routes/dashboard.tsx`

```
DashboardRoute
  ├── Period selector (useState<StatsPeriod>('all'))
  ├── useStatsQuery(period) → { data, isPending, isError }
  ├── Stat cards (4x): Total Jobs / Applied / Response Rate / Emails
  └── Charts grid:
      ├── Recommendation Breakdown (PieChart + Pie + Cell — donut)
      ├── Fit Score Distribution (BarChart — vertical bars)
      ├── Application Status (BarChart — horizontal, layout="vertical")
      ├── Email Types (BarChart — vertical bars)
      └── Automation Runs (BarChart — grouped bars: success + failed)
```

**Period selector**: Use a `<select>` or inline button group. Avoid shadcn `<Select>` unless already used in this style — prefer a simple button group matching the dark zinc theme:
```tsx
const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
]
```

### Recharts Dark Theme Configuration

All charts live in a dark zinc UI. Apply these Recharts props:
- `<CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />` — zinc-700
- `<XAxis tick={{ fill: '#a1a1aa' }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} />`
- `<YAxis tick={{ fill: '#a1a1aa' }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} />`
- `<Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5' }} />`
- Wrap every chart in `<ResponsiveContainer width="100%" height={220}>` (or `height={180}` for smaller cards)

**Chart colors** (consistent palette):
```typescript
const CHART_COLORS = {
  apply: '#4ade80',      // green-400
  investigate: '#facc15', // yellow-400
  skip: '#f87171',        // red-400
  high: '#4ade80',
  medium: '#facc15',
  low: '#f87171',
  success: '#4ade80',
  failed: '#f87171',
  default: '#a1a1aa',    // zinc-400 for neutral bars
}
```

**Donut chart** (Recommendation): `<Pie innerRadius="55%" outerRadius="80%" cx="50%" cy="50%">` — use `Cell` to color each slice.

**Horizontal bar chart** (Application Status): `<BarChart layout="vertical">` with `<XAxis type="number">` and `<YAxis type="category" dataKey="status" width={90}>`.

### Shared Schemas Addition

Add to `src/shared/schemas.ts`:
```typescript
export const STATS_PERIODS = ['24h', '7d', '30d', 'all'] as const
export type StatsPeriod = typeof STATS_PERIODS[number]

export const statsSchema = z.object({
  pipeline: z.object({
    total: z.number(),
    byRecommendation: z.array(z.object({ name: z.string(), value: z.number() })),
    byFitScore: z.array(z.object({ bucket: z.string(), count: z.number() })),
  }),
  applications: z.object({
    total: z.number(),
    byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
    responseRate: z.number().nullable(),
  }),
  emails: z.object({
    total: z.number(),
    byType: z.array(z.object({ type: z.string(), count: z.number() })),
  }),
  automation: z.object({
    totalRuns: z.number(),
    successRate: z.number().nullable(),
    byWorkflow: z.array(z.object({ workflow: z.string(), success: z.number(), failed: z.number() })),
    coverLettersGenerated: z.number(),
  }),
})
export type Stats = z.infer<typeof statsSchema>
```

### Layout Nav Change

Add **first** in the nav list in `src/client/components/shared/Layout.tsx`:
```tsx
<Link to="/dashboard" className="px-3 py-1.5 text-sm transition-colors"
  activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
  inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}>
  Dashboard
</Link>
```

### Empty States

When a chart's data array is empty (e.g., no emails in the selected period), render:
```tsx
<div className="flex items-center justify-center h-[180px] text-sm text-zinc-500">No data for this period</div>
```
Do not render `<ResponsiveContainer>` or `<BarChart>` with empty data — Recharts may throw on zero-length data.

### Anti-Patterns to Avoid

- Do NOT use `useState` to hold stats data — `useStatsQuery` owns all server state
- Do NOT use `['stats']` as query key — must include period: `['stats', period]`
- Do NOT add Recharts to `devDependencies` — it's a runtime dep
- Do NOT use `{ success: true, data: ... }` envelope in API response
- Do NOT create a second Drizzle instance — import `db` from `src/db/client.ts`
- Do NOT import `Stats` or `StatsPeriod` from anywhere except `src/shared/schemas.ts`
- Do NOT use `console.log` for errors; use `console.error`
- Do NOT bind to `0.0.0.0` — API route handler uses the existing Hono app

### Project Structure Notes

New files:
```
src/server/routes/api-stats.ts
src/client/hooks/useStatsQuery.ts
src/client/routes/dashboard.tsx
```

Modified files:
```
src/shared/schemas.ts          — add statsSchema, Stats, StatsPeriod, STATS_PERIODS
src/index.ts                   — mount app.route('/api/stats', statsRoute)
src/client/lib/router.ts       — add dashboardRoute, insert first in routeTree
src/client/components/shared/Layout.tsx  — add Dashboard nav link first
```

No new DB schema/migration needed — all data is read from existing tables.

### Testing

**`src/server/routes/api-stats.test.ts`** (co-located):

Set `process.env.DB_PATH = ':memory:'` before imports. Create `webhook_runs`, `jobs`, `messages`, `cover_letters` tables via raw SQL in `beforeAll`. Clear rows in `beforeEach`.

Business logic tests (call handler directly):
- `GET /api/stats` (no period) returns all-time stats with correct shapes
- `GET /api/stats?period=7d` filters correctly — job scraped 8 days ago excluded, job scraped 6 days ago included
- `GET /api/stats?period=all` returns same as no period
- `responseRate` is `null` when no applied jobs
- `successRate` is `null` when no webhook runs
- Empty arrays returned (not nulls) when no data for a section

Contract tests:
- Response status `200` with valid JSON
- Invalid period param → treat as `'all'` (don't reject — graceful default)
- Response shape does NOT have `error` key on success
- Response does NOT use `{ data: ... }` envelope

### References

- [Source: _bmad-output/project-context.md] — date arithmetic rule (always use `T00:00:00Z`)
- [Source: _bmad-output/project-context.md] — API response shape (no envelope), error shape
- [Source: _bmad-output/project-context.md] — query key shapes, never duplicate in useState
- [Source: _bmad-output/project-context.md] — console.error for server errors
- [Source: _bmad-output/planning-artifacts/architecture-distillate.md] — project structure, Hono patterns
- [Source: src/client/routes/history.tsx] — parseName() pattern for webhook_runs.name parsing (reuse same logic server-side in api-stats)
- [Source: src/client/components/shared/Layout.tsx] — nav Link pattern to follow
- [Source: src/client/lib/router.ts] — route registration pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Implemented all 6 tasks. Created `GET /api/stats` endpoint with period filtering using `dateCutoff` for date-only columns (dateScraped, dateApplied) and `datetimeCutoff` for datetime columns (receivedAt, runAt). Added `STATS_PERIODS`, `StatsPeriod`, `statsSchema`, and `Stats` types to shared schemas. Dashboard component uses Recharts with dark zinc theme: donut PieChart for recommendations, vertical BarChart for fit score buckets, horizontal BarChart (layout="vertical") for application status, BarChart for email types, grouped BarChart for automation runs. Empty state rendered instead of chart when data array is empty. Period selector uses inline button group. All 15 new tests pass; 109 total tests pass.

### File List

- job-hunt-dashboard/package.json (recharts added to dependencies)
- job-hunt-dashboard/bun.lock (updated)
- job-hunt-dashboard/src/shared/schemas.ts (STATS_PERIODS, StatsPeriod, statsSchema, Stats added)
- job-hunt-dashboard/src/server/routes/api-stats.ts (new)
- job-hunt-dashboard/src/server/routes/api-stats.test.ts (new)
- job-hunt-dashboard/src/client/hooks/useStatsQuery.ts (new)
- job-hunt-dashboard/src/client/routes/dashboard.tsx (new)
- job-hunt-dashboard/src/client/lib/router.ts (dashboardRoute added first)
- job-hunt-dashboard/src/client/components/shared/Layout.tsx (Dashboard nav link added first)
- job-hunt-dashboard/src/index.ts (app.route('/api/stats', statsRoute) mounted)

### Change Log

- 2026-04-11: Implemented Story 11.1 — Dashboard View with period-filtered metrics, stat cards, and Recharts charts

### Review Findings

- [x] [Review][Patch] Period validation uses inline array instead of STATS_PERIODS constant [src/server/routes/api-stats.ts:22]
- [x] [Review][Patch] No Legend on Automation Runs grouped bar chart — bars are color-coded but undiscoverable without legend [src/client/routes/dashboard.tsx]
- [x] [Review][Patch] Cell key={i} uses array index instead of data-derived value — can misanimate on period switch [src/client/routes/dashboard.tsx]
- [x] [Review][Patch] Missing test for coverLettersGenerated period filtering — spec requires datetime cutoff test coverage [src/server/routes/api-stats.test.ts]
- [x] [Review][Defer] Synchronous .all() DB calls — pre-existing project-wide Bun/SQLite pattern
- [x] [Review][Defer] Full table scans per request — acceptable for single-user tool at current data volumes
- [x] [Review][Defer] responseRate counts any non-null statusOverride — matches spec definition exactly
- [x] [Review][Defer] useStatsQuery res.json() unvalidated cast — pre-existing pattern across all hooks
- [x] [Review][Defer] 30d = fixed 30×24h milliseconds — matches spec-defined cutoff logic
- [x] [Review][Defer] parseWorkflow falls through for unknown names — by design per spec
- [x] [Review][Defer] Stats route lacks try/catch — errorHandler middleware covers unhandled errors
- [x] [Review][Defer] dateScraped/dateApplied null rows silently excluded from filtered queries — reasonable behavior; null-date jobs not in period view
- [x] [Review][Defer] period selector not URL-synced — design choice for single-user tool
- [x] [Review][Defer] No staleTime on useStatsQuery — pre-existing pattern across project hooks
