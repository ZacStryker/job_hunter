---
title: 'Stats dashboard: swap heatmap for cost-over-time chart + add applied-status filter'
type: 'feature'
created: '2026-06-28'
status: 'done'
context: ['{project-root}/_bmad-output/project-context.md']
baseline_commit: '0a8dc2cc274aee106422218aaf666e8e65c01a33'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The stats dashboard's activity heatmap adds little signal, there's no view of LLM spend over time, and stats can't be sliced by application status.

**Approach:** Remove the heatmap and replace its full-width slot with a "Workflow Cost Over Time" stacked area chart sourced from `webhookRuns.costUsd`. Add a top "Applied status" filter (`unapplied`/`applied`/`all`) that layers `jobs.applied` onto the existing job-scoped stats queries.

## Boundaries & Constraints

**Always:**
- All cross-boundary types flow through `src/shared/schemas.ts` (`statsSchema` → `Stats`). API response keys must exactly match the schema.
- Reuse existing dashboard primitives: `DARK_GRID`, `AXIS_PROPS`, `WORKFLOW_FILL`, `FilteredTooltip`, `NoData`, `formatShortDate`, and the `rounded-lg border border-zinc-800 bg-zinc-900` card wrapper.
- Cost chart is scoped by `userId` + existing period cutoff ONLY — the applied filter does NOT apply to it (webhook runs aren't jobs).
- `totalJobs` stays fully unscoped (empty-state gate) — applied filter must not touch it.
- The four workflow keys are exactly `Discovery`, `Analysis`, `Cover Letter`, `Resume`; only these names map from `webhookRuns.name`, others ignored. Null `costUsd` → 0. Dates are `runAt.slice(0,10)`.
- TypeScript strict-clean (`noUnusedLocals`/`noUnusedParameters`); booleans true/false; arrays not keyed objects.

**Ask First:** (none — all decisions resolved)

**Never:**
- Do not bump the `['stats','v3',...]` query-key namespace string; only append the new `appliedFilter` segment.
- Do not add the applied filter to `workflowCostOverTime` or `totalJobs`.
- Do not break the existing `active` archived branch (matches/applications restriction) — layer applied via AND.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cost grouping | 2 Discovery runs + 1 Analysis run same day, distinct days | `workflowCostOverTime` has one row per day with any run, sorted ascending; per-day costs summed by name; absent workflows = 0 | N/A |
| Null cost | webhook_run with `cost_usd` NULL | Treated as 0 in that day/workflow sum | N/A |
| Cost period scope | run outside period cutoff | Excluded (filter `runAt >= datetimeCutoff`) | N/A |
| Cost empty | no runs in period (or all costs 0) | `workflowCostOverTime` is `[]` (or all-zero rows) → client renders `<NoData />` | N/A |
| appliedFilter=unapplied | mix of applied/unapplied jobs | jobsByFitScore / recentActivity / timeSaved count only `applied=false` jobs | N/A |
| appliedFilter=applied | same | count only `applied=true` jobs | N/A |
| appliedFilter=all / absent | default | no applied constraint (current behavior) | invalid value → `all` |

</frozen-after-approval>

## Code Map

- `src/server/routes/api-stats.ts` — remove heatmap block + `activityHeatmap` return; add `workflowCostOverTime` (query `webhookRuns`); read/validate `appliedFilter`, layer `eq(jobs.applied, …)` into `scrapedWhere`, `feedJobs`, and time-saved counts. Import `webhookRuns`.
- `src/shared/schemas.ts` — drop `activityHeatmap` field; add `workflowCostOverTime` array field on `statsSchema`.
- `src/client/hooks/useStatsQuery.ts` — export `AppliedFilter`; add `appliedFilter` arg, query-key segment, and conditional `appliedFilter` param.
- `src/client/routes/dashboard.tsx` — delete `ActivityHeatmap` + its render; add `WorkflowCostOverTime` (recharts `AreaChart`/`Area`) full-width where heatmap was; add `appliedFilter` state + button group with `w-px h-4 bg-zinc-700 mx-1.5` divider.
- `src/server/routes/api-stats.test.ts` — drop heatmap assertions/type; add `workflowCostOverTime` + `appliedFilter` cases.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` -- remove `activityHeatmap`, add `workflowCostOverTime: z.array(z.object({ date: z.string(), Discovery: z.number(), Analysis: z.number(), 'Cover Letter': z.number(), Resume: z.number() }))` -- schema is the contract source of truth.
- [x] `src/server/routes/api-stats.ts` -- delete heatmap computation + return field; add `workflowCostOverTime` aggregation; parse `appliedFilter`, build `eq(jobs.applied, …)` predicate, AND it into `scrapedWhere` and into the `feedJobs`/time-saved JS filters (cover-letter count scoped via owning job); leave `totalJobs`/`workflowCostOverTime` unscoped -- core behavior.
- [x] `src/client/hooks/useStatsQuery.ts` -- export `AppliedFilter = 'unapplied' | 'applied' | 'all'`; add 3rd arg, key segment, conditional param -- client contract.
- [x] `src/client/routes/dashboard.tsx` -- remove heatmap; add `WorkflowCostOverTime` + `AreaChart`/`Area` imports; add applied-status button group + divider; wire `appliedFilter` state -- UI.
- [x] `src/server/routes/api-stats.test.ts` -- remove heatmap assertions + `StatsResponse.activityHeatmap`; add I/O-matrix tests for `workflowCostOverTime` and `appliedFilter` scoping -- regression coverage.

**Acceptance Criteria:**
- Given any period, when `/api/stats` responds, then it contains `workflowCostOverTime` and NOT `activityHeatmap`, and the dashboard renders the cost chart full-width below the fit-score/time-saved grid.
- Given `appliedFilter=applied` with one applied and one unapplied qualifying job, when stats load, then jobsByFitScore/recentActivity/timeSaved reflect only the applied job while `totalJobs` still counts both.
- Given the `active` archived filter combined with `appliedFilter`, when stats load, then the matches/applications restriction still holds (no regression).
- Given `bunx tsc --noEmit` and the stats test suite, when run, then both pass clean.

## Design Notes

Server cost aggregation (keep names type-safe so prototype keys like `toString` can't leak in):

```ts
const WF_NAMES = ['Discovery', 'Analysis', 'Cover Letter', 'Resume'] as const
const costRuns = db.select().from(webhookRuns)
  .where(and(eq(webhookRuns.userId, userId), datetimeCutoff ? gte(webhookRuns.runAt, datetimeCutoff) : undefined)).all()
const byDate = new Map<string, Record<typeof WF_NAMES[number], number>>()
for (const r of costRuns) {
  const date = r.runAt.slice(0, 10)
  const row = byDate.get(date) ?? { Discovery: 0, Analysis: 0, 'Cover Letter': 0, Resume: 0 }
  if ((WF_NAMES as readonly string[]).includes(r.name)) row[r.name as typeof WF_NAMES[number]] += r.costUsd ?? 0
  byDate.set(date, row)
}
const workflowCostOverTime = [...byDate.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([date, row]) => ({ date, ...row }))
```

Applied predicate (JS filters): `const matchesApplied = (j: { applied: boolean }) => appliedFilter === 'all' ? true : appliedFilter === 'applied' ? j.applied : !j.applied`. SQL side: `appliedWhere = appliedFilter === 'all' ? undefined : eq(jobs.applied, appliedFilter === 'applied')`, AND-ed into `scrapedWhere`.

Client chart mirrors `TimeSavedByWorkflow` but uses `AreaChart` with four stacked `<Area stackId="1" type="monotone">`, `XAxis dataKey="date" tickFormatter={formatShortDate}`, `YAxis {...AXIS_PROPS} unit="$" allowDecimals`, `<NoData/>` when every row is all-zero (empty array → all-zero → NoData).

## Verification

**Commands:**
- `cd job-hunt-dashboard && bunx tsc --noEmit` -- expected: no errors (strict mode; no unused locals/params).
- `cd job-hunt-dashboard && bun test src/server/routes/api-stats.test.ts` -- expected: all pass incl. new cost/applied cases.

## Suggested Review Order

**Contract (start here)**

- The new response field that drives both server and UI — defines the four workflow keys.
  [`schemas.ts:174`](../../job-hunt-dashboard/src/shared/schemas.ts#L174)

**Server — applied filter**

- Validate `appliedFilter`; invalid → `all`.
  [`api-stats.ts:49`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L49)
- The two predicates: SQL `appliedWhere` + JS `matchesApplied`, one per layer.
  [`api-stats.ts:54`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L54)
- Layered into the fit-score query via AND — does not disturb the `active` matches/applications branch.
  [`api-stats.ts:63`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L63)
- Applied to the activity feed and time-saved counts (cover letters scoped via owning job).
  [`api-stats.ts:73`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L73)

**Server — cost over time**

- Aggregate `webhookRuns.costUsd` by day×name; userId+period only; null→0; one row per run-day.
  [`api-stats.ts:139`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L139)

**Client**

- Hook: new arg + query-key segment + conditional param (namespace `v3` unchanged).
  [`useStatsQuery.ts:7`](../../job-hunt-dashboard/src/client/hooks/useStatsQuery.ts#L7)
- The stacked area chart replacing the heatmap; `<NoData/>` when every row is all-zero.
  [`dashboard.tsx:187`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L187)
- Applied-status button group + divider, mirroring the archived group.
  [`dashboard.tsx:242`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L242)

**Tests**

- Cost aggregation cases (grouping, null cost, period scope, applied-agnostic).
  [`api-stats.test.ts:373`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L373)
- Applied-filter scoping + active-branch composition + invalid-value fallback.
  [`api-stats.test.ts:417`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L417)
