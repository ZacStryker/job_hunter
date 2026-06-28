---
title: 'Dashboard KPI tile row above Recent Activity'
type: 'feature'
created: '2026-06-28'
status: 'done'
baseline_commit: '4dd40b66675aa44934a2cf3631b818ba05ea2408'
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The dashboard surfaces charts but no at-a-glance headline numbers; users can't instantly see the value delivered (time saved) or their live pipeline health.

**Approach:** Add a responsive row of 4 KPI tiles above `RecentActivityFeed`, fed by a new server-computed `kpis` object on the stats payload that honours the same period / archived / applied filters already driving the dashboard.

## Boundaries & Constraints

**Always:**
- `kpis` is computed server-side in `api-stats.ts` and validated by `statsSchema`; the client only renders it.
- Reuse the filter scoping already in the route — do not introduce new query params or bypass existing filters.
- Terminal statuses are exactly `offer` and `rejected` (the only terminal values in `STATUS_OVERRIDE_VALUES`); there is no "Withdrawn". Match case-insensitively against `statusOverride`.
- A job's "in play" liveness uses `applied && !archived && statusOverride not terminal` — a current-state snapshot (period-independent, always non-archived by definition).
- Match existing tile chrome: `rounded-lg border border-zinc-800 bg-zinc-900`.
- TypeScript strict: no unused locals/params, no `_`-prefix suppression.

**Ask First:**
- Changing which filters a given tile responds to (the per-tile scoping decided below).

**Never:**
- No new DB columns/migrations. `latestStatus` is unavailable here (it is email-derived in `api-jobs`, not a column).
- No envelope wrapper or `{ message }` error shape.
- Do not touch user-owned column write logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hours saved | any period/applied filter | `kpis.hoursSaved` = sum of `timeSavedByWorkflow.hours`, rounded to 1 decimal | N/A |
| Strong matches | active filter set (same as `jobsByFitScore`/`viewJobs`) | count of jobs with `fitScore >= 80` | N/A |
| Applications sent | applied jobs in period+archive+applied scope | count of `applied` jobs whose `dateApplied` is within the period | N/A |
| In play | all user jobs | count of `applied && !archived && statusOverride ∉ {offer,rejected}` | N/A |
| Terminal excluded | applied job, `statusOverride='offer'` or `'rejected'` | excluded from `inPlay` | N/A |
| Empty DB | no jobs | all four values `0` (`hoursSaved` `0`) | N/A |
| Zero count (UI) | a count tile value is `0` | render encouraging subtext instead of a bare number where natural | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/schemas.ts` -- `statsSchema` (~L163); add `kpis` object → `Stats` type flows to all consumers.
- `src/server/routes/api-stats.ts` -- compute `kpis` from existing `viewJobs`, `feedJobs`, `allUserJobs`, `timeSavedByWorkflow`; add to `c.json` response.
- `src/server/routes/api-stats.test.ts` -- extend `StatsResponse`, shape test, empty-DB test; add `kpis` describe block.
- `src/client/routes/dashboard.tsx` -- new `KpiTile` + `KpiRow`; render above `<RecentActivityFeed />` inside `data.totalJobs > 0`.
- `src/client/hooks/useStatsQuery.ts` -- no change (types flow through `Stats`).

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` -- add `kpis: z.object({ hoursSaved, strongMatches, applicationsSent, inPlay }).` of `z.number()` to `statsSchema` -- single source of truth for the new shape.
- [x] `src/server/routes/api-stats.ts` -- compute the 4 values (reusing `viewJobs` for strong matches, `feedJobs`+`inPeriod(dateApplied)` for applications sent, `allUserJobs` for in-play, `timeSavedByWorkflow` sum for hours) and add `kpis` to the response -- server owns aggregation.
- [x] `src/server/routes/api-stats.test.ts` -- add `kpis` to `StatsResponse`/shape/empty tests + a describe block covering hours-sum, fit≥80, period-scoped applications, and terminal/archived exclusion for in-play -- lock behavior.
- [x] `src/client/routes/dashboard.tsx` -- build reusable `<KpiTile>` (icon, label, big value, optional subtext) + responsive `grid-cols-2 lg:grid-cols-4` row, rendered immediately above `<RecentActivityFeed />` -- UI surface.

**Acceptance Criteria:**
- Given any active filter combination, when the dashboard loads, then the 4 tiles render with values matching the filtered stats payload (no client-side recomputation).
- Given `inPlay` is `0`, when the tile renders, then it shows "Apply to get the ball rolling" instead of a bare `0`.
- Given an applied job with `statusOverride='rejected'`, when stats are computed, then it is excluded from `inPlay`.
- Given `bunx tsc --noEmit` and the stats test suite, when run, then both pass.

## Design Notes

Per-tile filter scoping mirrors the existing charts (intentionally not uniform):
- Hours saved → period + applied (archive-agnostic), inherited from `timeSavedByWorkflow`.
- Strong matches → period + archived + applied + active matches/applications branch (`viewJobs`).
- Applications sent → period + archived + applied (`feedJobs` filtered to `applied && inPeriod(dateApplied)`).
- In play → snapshot: `applied && !archived && !terminal` over `allUserJobs` (period-independent).

Terminal check:
```ts
const TERMINAL = new Set(['offer', 'rejected'])
const isTerminal = (s: string | null) => s !== null && TERMINAL.has(s.toLowerCase())
```
Effective status of an applied job is `statusOverride ?? 'Applied'`, so checking `statusOverride` against terminal values is sufficient.

## Verification

**Commands:**
- `bunx tsc --noEmit` -- expected: no errors (strict).
- `bun test src/server/routes/api-stats.test.ts` -- expected: all pass incl. new `kpis` cases.

## Suggested Review Order

**Contract (the new shape)**

- Entry point: the `kpis` shape every layer agrees on.
  [`schemas.ts:165`](../../job-hunt-dashboard/src/shared/schemas.ts#L165)

**Server aggregation**

- The 4 values reuse existing scoped sets — no new filters introduced.
  [`api-stats.ts:122`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L122)

- Terminal-status helper: only `offer`/`rejected` close an opportunity.
  [`api-stats.ts:46`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L46)

- `kpis` added to the response (no envelope).
  [`api-stats.ts:183`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L183)

**UI binding**

- Reusable tile + responsive `grid-cols-2 lg:grid-cols-4` row.
  [`dashboard.tsx:108`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L108)

- Rendered directly above the activity feed; client only reads the payload.
  [`dashboard.tsx:312`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L312)

**Tests**

- Locks hours-sum, fit≥80, period scoping, and terminal/archived exclusion.
  [`api-stats.test.ts:486`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L486)
</content>
</invoke>
