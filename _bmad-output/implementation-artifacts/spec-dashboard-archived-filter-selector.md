---
title: 'Dashboard Archived Filter — Three-Way Selector'
type: 'feature'
created: '2026-04-12'
status: 'done'
baseline_commit: '47c5b2cb02ac10fb026ee36bcb717b5156b01e5d'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The dashboard always hides archived jobs; there is no way to view archived-only or all-jobs metrics without using the API directly.

**Approach:** Add an Active | Archived | All pill selector to the dashboard filter bar. Replace the existing `showArchived: boolean` param on `GET /api/stats` with `archivedFilter: 'active' | 'archived' | 'all'`. The UI exposes the new state; the API, hook, and `buildBaseWhere` are updated symmetrically to the `appliedFilter` change.

## Boundaries & Constraints

**Always:**
- Default = **Active** (behaviour identical to current default `showArchived=false`).
- When `archivedFilter='all'`, pipeline charts (recommendation breakdown, fit score, perDay) stay focused on non-archived jobs — same behaviour as the existing `showArchived=true` in-memory filter.
- When `archivedFilter='archived'`, pipeline charts show the archived subset (user explicitly selected it).
- `appliedFilter` and `archivedFilter` compose independently in `buildBaseWhere`.
- `appWhere` (applications section) respects `archivedFilter` the same way `buildBaseWhere` does for the archived axis.
- Unmatched-email guard remains `appliedFilter !== 'applied'` — unchanged.
- Automation Runs query unchanged.
- URL param omitted when value is the default (`active`).

**Ask First:** None anticipated.

**Never:**
- Do not add `archivedFilter` to the shared `Stats` response schema.
- Do not remove the existing `showArchived` API param parsing — replace it.
- Do not use `showArchived: boolean` in `useStatsQuery` — remove it entirely and replace with `archivedFilter`.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Behavior |
|---|---|---|
| Default load | No `archivedFilter` param | `archivedFilter=active`: non-archived jobs only — same as today |
| Active selected | `archivedFilter=active` | `archivedCond = eq(archived, false)` |
| Archived selected | `archivedFilter=archived` | `archivedCond = eq(archived, true)`; pipeline charts show archived data |
| All selected | `archivedFilter=all` | No archived condition; pipeline charts in-memory filtered to non-archived |
| Unknown value | `archivedFilter=bogus` | Server treats as `active` (default) |

</frozen-after-approval>

## Code Map

- `src/server/routes/api-stats.ts` — `buildBaseWhere`: replace `showArchived: boolean` with `archivedFilter: ArchivedFilter`; parse new param; update `pipelineJobs` in-memory filter; update `appWhere` archived axis
- `src/server/routes/api-stats.test.ts` — update existing `showArchived=true` tests to `archivedFilter=all`; add `archivedFilter=archived` test
- `src/client/hooks/useStatsQuery.ts` — replace `showArchived: boolean` with `archivedFilter: ArchivedFilter`; update query key and URL builder
- `src/client/routes/dashboard.tsx` — replace hardcoded `false` with `archivedFilter` state; add three Active|Archived|All pill buttons

## Tasks & Acceptance

**Execution:**
- [x] `src/server/routes/api-stats.ts` — add `type ArchivedFilter = 'active' | 'archived' | 'all'`; update `buildBaseWhere(archivedFilter, appliedFilter)`: `archivedCond` = `eq(archived, false)` for `active`, `eq(archived, true)` for `archived`, `undefined` for `all`; replace `showArchived` param parse with `archivedFilter` parse (default `'active'`); update `pipelineJobs` = `archivedFilter === 'all' ? viewJobs.filter(j => !j.archived) : viewJobs`; update `appWhere` archived axis using same three-case logic
- [x] `src/server/routes/api-stats.test.ts` — rename `showArchived=true` → `archivedFilter=all` in existing tests; add one test for `archivedFilter=archived` verifying only archived jobs appear in `scraped.total`
- [x] `src/client/hooks/useStatsQuery.ts` — replace `showArchived: boolean` param with `archivedFilter: ArchivedFilter`; query key becomes `['stats', period, archivedFilter, appliedFilter]`; URL omits param when `archivedFilter === 'active'`, otherwise sets `archivedFilter=<value>`
- [x] `src/client/routes/dashboard.tsx` — replace `useState<AppliedFilter>` pattern: add `useState<ArchivedFilter>('active')`; render Active|Archived|All pills using same button pattern; pass `archivedFilter` to `useStatsQuery`; export `ArchivedFilter` type from hook and import it in dashboard

**Acceptance Criteria:**
- Given the dashboard loads, when no interaction has occurred, then "Active" is selected and metrics match current behaviour.
- Given "Archived" is selected, when the dashboard re-fetches, then only archived jobs appear in `pipeline.total` and all charts with no page reload.
- Given "All" is selected, when the dashboard re-fetches, then pipeline charts show non-archived jobs; `scraped.total` includes all.
- Given each unique (period, archivedFilter, appliedFilter) combination, when queried, TanStack Query caches each independently.

## Design Notes

Updated `buildBaseWhere` signature:

```ts
type ArchivedFilter = 'active' | 'archived' | 'all'

function buildBaseWhere(archivedFilter: ArchivedFilter, appliedFilter: AppliedFilter) {
  const archivedCond =
    archivedFilter === 'active'   ? eq(jobs.archived, false) :
    archivedFilter === 'archived' ? eq(jobs.archived, true)  : undefined
  const appliedCond =
    appliedFilter === 'applied'   ? eq(jobs.applied, true)  :
    appliedFilter === 'unapplied' ? eq(jobs.applied, false) : undefined
  const conds = [archivedCond, appliedCond].filter((c): c is SQL => c !== undefined)
  return conds.length > 0 ? and(...conds) : undefined
}
```

`pipelineJobs` (controls recommendation/fit/perDay charts):
```ts
const pipelineJobs = archivedFilter === 'all' ? viewJobs.filter(j => !j.archived) : viewJobs
```

`appWhere` archived axis:
```ts
const archivedAppCond =
  archivedFilter === 'active'   ? eq(jobs.archived, false) :
  archivedFilter === 'archived' ? eq(jobs.archived, true)  : undefined
const appWhere = and(eq(jobs.applied, true), archivedAppCond, dateCutoff ? gte(jobs.dateApplied, dateCutoff) : undefined)
```

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/routes/api-stats.test.ts` -- expected: all tests pass

## Suggested Review Order

1. `src/server/routes/api-stats.ts` — `buildBaseWhere`, `archivedFilter` param parse, `pipelineJobs` ternary, `appWhere` archived axis
2. `src/server/routes/api-stats.test.ts` — `archivedFilter=archived` and `archivedFilter=all` test cases
3. `src/client/hooks/useStatsQuery.ts` — `ArchivedFilter` type export, query key, URL param omission when default
4. `src/client/routes/dashboard.tsx` — `archivedFilter` state, Active|Archived|All pill buttons in filter bar

## Spec Change Log
