---
title: 'Persist row sorting across the six data tables'
type: 'feature'
created: '2026-06-15'
status: 'done'
baseline_commit: '8037ee28d3b20a615b37e2950b91fe572ab5e6ef'
context: ['_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Column sizing already persists per-tab in localStorage, but row sorting (which column + direction) does not. Sorting a table, navigating away, and returning resets to the hardcoded default sort — the user's intent is lost.

**Approach:** Persist the active `SortingState` to a per-tab localStorage key, mirroring the existing `loadSizing`/`saveSizing` pattern already present in every table. On mount, restore the stored sort; fall back to the existing hardcoded default when nothing is stored. The shared `PipelineTable` (Jobs/Matches/Archive) receives a `sortingStorageKey` prop like its existing `sizingStorageKey`; the three self-contained tables get a module-level key constant.

## Boundaries & Constraints

**Always:**
- One distinct localStorage key per tab, namespace-consistent with sizing: `hitlobster-column-sorting-{jobs|matches|archive|tracker|messages|logs}`.
- Mirror the existing `loadSizing`/`saveSizing` shape exactly (try/catch, validate parsed shape, swallow storage errors). Duplicate per-file as sizing already is — do not extract a shared helper.
- An explicitly-empty stored sort (`[]`, user removed all sorting) must restore as no-sort — distinct from "nothing stored" which uses the default.
- Persist on every sort change inside the existing `onSortingChange` handler; keep the existing `table.setPageIndex(0)` reset.

**Ask First:**
- Any change to the existing sizing keys, visibility key, or sort defaults.

**Never:**
- Do not touch column sizing, column visibility, or pagination persistence — already working / out of scope.
- No server-side or DB persistence; no cross-tab shared sort key; no new dependencies.
- Do not add a UI control to reset sort.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nothing stored | localStorage key absent | `loadSorting` returns `null`; table uses hardcoded default sort | N/A |
| Valid stored sort | `[{"id":"company","desc":false}]` | Restored as the active sort on mount | N/A |
| Explicit no-sort | stored `[]` | Restored as empty SortingState (no sort), not the default | N/A |
| Malformed value | non-JSON, non-array, or entries missing string `id` / boolean `desc` | `loadSorting` returns `null`; default sort applied; no throw | swallow, return `null` |
| Write failure | quota exceeded / private mode | sort still applies in-memory | swallow in try/catch |

</frozen-after-approval>

## Code Map

- `src/client/components/pipeline/PipelineTable.tsx` -- shared table for Jobs/Matches/Archive; sorting is `useState(initialSort ?? [{id:'fitScore',desc:true}])`, never persisted. Add `sortingStorageKey` prop + `loadSorting`/`saveSorting`.
- `src/client/routes/index.tsx` -- Jobs; pass `sortingStorageKey="hitlobster-column-sorting-jobs"`.
- `src/client/routes/matches.tsx` -- Matches; pass `...-matches`.
- `src/client/routes/archived.tsx` -- Archive; pass `...-archive` (keeps existing `initialSort` as fallback default).
- `src/client/components/tracker/TrackerTable.tsx` -- Applications; default `dateApplied desc`. Add self-contained persistence.
- `src/client/components/messages/MessagesTable.tsx` -- Messages; default `receivedAt desc`. Add self-contained persistence.
- `src/client/routes/config/logs.tsx` -- Logs; default `runAt desc`. Add self-contained persistence.

## Tasks & Acceptance

**Execution:**
- [x] `src/client/components/pipeline/PipelineTable.tsx` -- add module-level `loadSorting(key): SortingState | null` and `saveSorting(key, state)` mirroring `loadSizing`/`saveSizing`; add required `sortingStorageKey: string` prop; init `sorting` from `loadSorting(sortingStorageKey) ?? initialSort ?? [{ id: 'fitScore', desc: true }]`; inside `onSortingChange`, resolve the updater functionally and `saveSorting(sortingStorageKey, next)` -- closes the gap for the three shared-table tabs.
- [x] `src/client/routes/index.tsx` -- pass `sortingStorageKey="hitlobster-column-sorting-jobs"` to `PipelineTable`.
- [x] `src/client/routes/matches.tsx` -- pass `sortingStorageKey="hitlobster-column-sorting-matches"`.
- [x] `src/client/routes/archived.tsx` -- pass `sortingStorageKey="hitlobster-column-sorting-archive"`.
- [x] `src/client/components/tracker/TrackerTable.tsx` -- add `SORTING_KEY = 'hitlobster-column-sorting-tracker'`, `loadSorting`/`saveSorting`; init `sorting` from `loadSorting() ?? [{ id: 'dateApplied', desc: true }]`; persist in `onSortingChange`.
- [x] `src/client/components/messages/MessagesTable.tsx` -- add `SORTING_KEY = 'hitlobster-column-sorting-messages'`, `loadSorting`/`saveSorting`; init `sorting` from `loadSorting() ?? [{ id: 'receivedAt', desc: true }]`; persist in `onSortingChange`.
- [x] `src/client/routes/config/logs.tsx` -- add `SORTING_KEY = 'hitlobster-column-sorting-logs'`, `loadSorting`/`saveSorting`; init `sorting` from `loadSorting() ?? [{ id: 'runAt', desc: true }]`; persist in `onSortingChange`.

**Acceptance Criteria:**
- Given any of the six tables, when the user clicks a column header to change sort and then navigates away and back (or reloads), then the same sort column and direction are restored.
- Given a stored sort on one tab, when the user opens a different tab, then each tab restores its own independent sort (keys do not collide).
- Given the user removes sorting entirely (cycles a column past descending), when they return to the table, then it restores as unsorted rather than reverting to the default.
- Given no stored value or a corrupted localStorage entry, when the table mounts, then it falls back to the existing default sort without throwing.

## Verification

**Commands:**
- `bunx tsc --noEmit` -- expected: no type errors (new `sortingStorageKey` prop wired at all three `PipelineTable` call sites).
- `bun run build` -- expected: production build succeeds.

**Manual checks:**
- `bun run dev`, then on each of Jobs, Matches, Applications, Messages, Archive, Logs: change the sort, reload the page, confirm the sort persists; inspect `localStorage` for the matching `hitlobster-column-sorting-*` key.

## Suggested Review Order

**Persistence core (the reusable pattern)**

- Entry point — load (returns `null` only when absent/malformed) and save helpers; the whole design in one place.
  [`PipelineTable.tsx:122`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L122)

- Restore-on-mount: stored sort wins, else `initialSort`, else hardcoded default; `[]` (no-sort) survives the `??` chain.
  [`PipelineTable.tsx:346`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L346)

- Persist-on-change: functional updater resolves `next` before `saveSorting`; preserves `setPageIndex(0)`.
  [`PipelineTable.tsx:451`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L451)

**Shared component wiring (3 tabs, distinct keys)**

- New required `sortingStorageKey` prop threaded into the shared table.
  [`PipelineTable.tsx:331`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L331)

- Jobs / Matches / Archive each pass their own per-tab key — no collision.
  [`index.tsx:256`](../../job-hunt-dashboard/src/client/routes/index.tsx#L256)
  [`matches.tsx:44`](../../job-hunt-dashboard/src/client/routes/matches.tsx#L44)
  [`archived.tsx:39`](../../job-hunt-dashboard/src/client/routes/archived.tsx#L39)

**Self-contained tables (same pattern duplicated per file)**

- Applications — `loadSorting`/`saveSorting` + `dateApplied desc` default.
  [`TrackerTable.tsx:29`](../../job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx#L29)

- Messages — same, `receivedAt desc` default.
  [`MessagesTable.tsx:28`](../../job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx#L28)

- Logs — same, `runAt desc` default.
  [`logs.tsx:27`](../../job-hunt-dashboard/src/client/routes/config/logs.tsx#L27)
