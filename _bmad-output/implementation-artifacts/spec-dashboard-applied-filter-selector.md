---
title: 'Dashboard Applied Filter — Three-Way Selector'
type: 'feature'
created: '2026-04-12'
status: 'done'
baseline_commit: '7782a92b84edf430e83a59c1ca43de7f72a60b34'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Unapplied toggle is binary (applied-only vs. all), making it impossible to view *only* unapplied jobs on the dashboard.

**Approach:** Replace the boolean Unapplied toggle with a three-way pill selector — Applied | Unapplied | All — that maps to a new `appliedFilter` query param on `GET /api/stats`. The API's `buildBaseWhere` logic is updated to apply an equality filter for the selected mode.

## Boundaries & Constraints

**Always:**
- Default selection is **Applied** (behaviour identical to current default `showUnapplied=false`).
- Applications section (`appWhere`) always filters to `applied=true` regardless of selection — unchanged.
- Automation Runs query unchanged.
- `showArchived` query param remains supported by the API (existing tests must stay green); the UI continues to hardcode `false` for it.
- Unmatched emails (null company/jobTitle) are shown only when `appliedFilter` is `unapplied` or `all`.

**Ask First:** None anticipated.

**Never:**
- Do not add `appliedFilter` to the shared `Stats` response schema — it is a request param only.
- Do not remove the existing `showArchived` API param or its tests.
- Do not add URL param when value is the default (`applied`) — omit it and let the server default.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Default load | No `appliedFilter` param | Same as `appliedFilter=applied`: only non-archived + applied jobs counted | — |
| Applied selected | `appliedFilter=applied` | `baseWhere` = `archived=false AND applied=true` | — |
| Unapplied selected | `appliedFilter=unapplied` | `baseWhere` = `archived=false AND applied=false`; unmatched emails included | — |
| All selected | `appliedFilter=all` | `baseWhere` = `archived=false` (no applied filter); unmatched emails included | — |
| Unknown value | `appliedFilter=bogus` | Server treats as `applied` (default) | — |

</frozen-after-approval>

## Code Map

- `src/server/routes/api-stats.ts` — `buildBaseWhere` and email filter logic; parse new `appliedFilter` param; remove `showUnapplied` param
- `src/server/routes/api-stats.test.ts` — update `showUnapplied` tests to use `appliedFilter`; add `unapplied` mode test
- `src/client/hooks/useStatsQuery.ts` — replace `showUnapplied: boolean` param with `appliedFilter: 'applied' | 'unapplied' | 'all'`; update query key and URL builder
- `src/client/routes/dashboard.tsx` — replace boolean state + single button with three-way pill state and three buttons

## Tasks & Acceptance

**Execution:**
- [x] `src/server/routes/api-stats.ts` — replace `showUnapplied` boolean param with `appliedFilter` string param (`'applied' | 'unapplied' | 'all'`, default `'applied'`); rewrite `buildBaseWhere` to accept `appliedFilter`; update email unmatched-email guard from `return showUnapplied` to `return appliedFilter !== 'applied'`
- [x] `src/server/routes/api-stats.test.ts` — replace `showUnapplied=true/false` query strings with `appliedFilter=all/applied`; add one new test for `appliedFilter=unapplied` verifying only unapplied jobs appear in `pipeline.total`
- [x] `src/client/hooks/useStatsQuery.ts` — replace `showUnapplied: boolean` with `appliedFilter: 'applied' | 'unapplied' | 'all'`; query key becomes `['stats', period, false, appliedFilter]`; URL omits param when `appliedFilter === 'applied'`, otherwise sets `appliedFilter=<value>`
- [x] `src/client/routes/dashboard.tsx` — replace `useState(false)` + single button with `useState<'applied' | 'unapplied' | 'all'>('applied')`; render three pill buttons (Applied / Unapplied / All) using the same active/inactive class pattern; pass `appliedFilter` to `useStatsQuery`

**Acceptance Criteria:**
- Given the dashboard loads, when no interaction has occurred, then "Applied" is the active pill and metrics match current default behaviour.
- Given "Unapplied" is selected, when the dashboard re-fetches, then `pipeline.total` includes only non-archived + unapplied jobs with no page reload.
- Given "All" is selected, when the dashboard re-fetches, then `pipeline.total` includes all non-archived jobs (applied + unapplied).
- Given "Applied" is re-selected after "All", when the dashboard re-fetches, then metrics return to the applied-only view.
- Given each unique (period, appliedFilter) combination, when queried, then TanStack Query caches each independently.

## Design Notes

`buildBaseWhere` updated signature — `showArchived` is kept so existing API tests remain green; `showUnapplied: boolean` is replaced with `appliedFilter`:

```ts
type AppliedFilter = 'applied' | 'unapplied' | 'all'

function buildBaseWhere(showArchived: boolean, appliedFilter: AppliedFilter) {
  const archivedCond = !showArchived ? eq(jobs.archived, false) : undefined
  const appliedCond =
    appliedFilter === 'applied'   ? eq(jobs.applied, true)  :
    appliedFilter === 'unapplied' ? eq(jobs.applied, false) : undefined
  const conds = [archivedCond, appliedCond].filter((c): c is SQL => c !== undefined)
  return conds.length > 0 ? and(...conds) : undefined
}
```

`appWhere` (applications section) always uses `eq(jobs.applied, true)` and `!showArchived` — unchanged.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/routes/api-stats.test.ts` -- expected: all tests pass, no failures

## Spec Change Log

## Suggested Review Order

**Filter logic — entry point**

- `AppliedFilter` type and `buildBaseWhere` — three-way union replaces boolean; one cond per axis
  [`api-stats.ts:22`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L22)

- Param parsing — whitelist ternary; unknown values silently default to `'applied'`
  [`api-stats.ts:38`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L38)

- Unmatched-email guard — `!== 'applied'` covers both `unapplied` and `all` in one expression
  [`api-stats.ts:121`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L121)

**Hook — cache key and URL**

- `AppliedFilter` exported; query key includes all four cache axes
  [`useStatsQuery.ts:4`](../../job-hunt-dashboard/src/client/hooks/useStatsQuery.ts#L4)

**UI — state and pill buttons**

- State defaults to `'applied'`; hardcoded `false` for showArchived (UI doesn't expose it)
  [`dashboard.tsx:174`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L174)

- Three pill buttons rendered from the `AppliedFilter` union array
  [`dashboard.tsx:197`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L197)

**Tests**

- New `appliedFilter=unapplied` test; updated `showUnapplied` → `appliedFilter` across existing tests
  [`api-stats.test.ts:220`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L220)
