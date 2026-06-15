---
title: 'Resizable columns with text ellipsis on all data tables'
type: 'feature'
created: '2026-06-12'
status: 'done'
baseline_commit: 'bbdd617e38d1996a4d30635c05792ee4035d60e9'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** All five data tables (Jobs, Matches, Applications, Messages, Archive) have fixed column widths and either allow text to wrap or silently clip long values, with no way for the user to adjust widths.

**Approach:** Enable TanStack Table's built-in column resizing on each table, persist sizes to `localStorage` per table, apply `table-layout: fixed` so declared widths are respected, and enforce no-wrap + ellipsis on all cell text.

## Boundaries & Constraints

**Always:**
- No text may wrap inside any table cell; use `whitespace-nowrap overflow-hidden text-ellipsis` on all cell content.
- Column sizes persist to `localStorage` using frozen keys (one per table). PipelineTable receives a `sizingStorageKey` prop because it is rendered in three contexts (Jobs, Matches, Archive).
- `columnResizeMode: 'onChange'` for immediate drag feedback.
- `table-layout: fixed` on every `<table>` element; table width set to `table.getTotalSize()px` so horizontal scroll works when columns expand beyond the container.
- Default column widths set in the column `size:` field (not via Tailwind `max-w-*`). Remove existing `max-w-[...]` constraints from cell spans now that truncation is handled by `overflow-hidden` on the `<td>`.
- localStorage keys follow the frozen naming scheme: `hitlobster-column-sizing-jobs`, `hitlobster-column-sizing-matches`, `hitlobster-column-sizing-archive`, `hitlobster-column-sizing-tracker`, `hitlobster-column-sizing-messages`, `hitlobster-column-sizing-logs`.

**Ask First:** None.

**Never:**
- Do not wrap cell text or add vertical height to rows.
- Do not persist sizes in TanStack Query or React state that doesn't survive a page reload.
- Do not add column resizing to non-data tables (config views, skeleton). (Logs table excluded from this list on 2026-06-15 — see Renegotiation note below.)
- Do not change existing column sets, sort logic, visibility toggle, or pagination.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Drag resize | User drags right edge of a header cell | Column width updates live; adjacent columns do not shrink (independent widths; table expands) | N/A |
| Persist across reload | User resizes, reloads page | Column widths restored from localStorage | If parse fails, fall back to column `size:` defaults |
| Long text in cell | Cell value longer than column width | Text truncated with `…`; `title` attribute shows full value on hover (where already present) | N/A |
| Interactive cell (MessagesTable type/company/jobTitle) | Cell contains a dropdown or typeahead | Outer column resizes; inner control retains its own fixed width | N/A |

</frozen-after-approval>

## Renegotiation — 2026-06-15

The original "Never" list excluded the **logs** table (webhook runs, `src/client/routes/config/logs.tsx`). The human renegotiated this: the logs table now uses the same resizable-column pattern as the data tables, with localStorage key `hitlobster-column-sizing-logs`. Implemented in commit `8630001`. The exclusion now covers only config views and skeleton tables.

## Code Map

- `src/client/components/pipeline/PipelineTable.tsx` -- shared table for Jobs, Matches, Archive; needs sizing state + resize handles + `sizingStorageKey` prop
- `src/client/components/tracker/TrackerTable.tsx` -- Applications table; needs sizing state + resize handles
- `src/client/components/messages/MessagesTable.tsx` -- Messages table; needs sizing state + resize handles
- `src/client/routes/index.tsx` -- renders PipelineTable for Jobs; pass `sizingStorageKey='hitlobster-column-sizing-jobs'`
- `src/client/routes/matches.tsx` -- renders PipelineTable for Matches; pass `sizingStorageKey='hitlobster-column-sizing-matches'`
- `src/client/routes/archived.tsx` -- renders PipelineTable for Archive; pass `sizingStorageKey='hitlobster-column-sizing-archive'`

## Tasks & Acceptance

**Execution:**

- [x] `src/client/components/pipeline/PipelineTable.tsx` -- Add `sizingStorageKey: string` to `PipelineTableProps`. Add `loadSizing(key)` / `saveSizing(key, state)` helpers (same pattern as existing `loadVisibility`). Add `columnSizing` / `setColumnSizing` state initialized from `localStorage[sizingStorageKey]`. Add `size:` defaults to every column in `staticColumns` (select: 36, company: 180, jobTitle: 240, location: 160, locationType: 90, fitScore: 70, recommendation: 130, date_analyzed: 120, notes: 180, source: 100, relevanceScore: 90, date_scraped: 120, date_applied: 120, status: 120, date_archived: 120). Pass `enableColumnResizing: true`, `columnResizeMode: 'onChange'`, `state: { ..., columnSizing }`, `onColumnSizingChange` to `useReactTable`. On the `<table>`: `style={{ tableLayout: 'fixed', width: table.getTotalSize() }}` (remove `w-full`). On each `<TableHead>`: add `style={{ width: header.getSize() }}` and `position: relative`; append a resize handle `<div>` absolutely positioned on the right edge using `onMouseDown={header.getResizeHandler()}` / `onTouchStart={header.getResizeHandler()}`. On each `<TableCell>`: add `style={{ width: cell.column.getSize(), overflow: 'hidden' }}`. Strip `max-w-[...]` from all cell content `<span>`s; add `whitespace-nowrap overflow-hidden text-ellipsis block` to every text-bearing `<span>`.

- [x] `src/client/components/tracker/TrackerTable.tsx` -- Same pattern as PipelineTable. Add `size:` to all columns (company: 160, jobTitle: 220, location: 140, locationType: 90, fitScore: 70, status: 140, dateApplied: 120). Add `columnSizing` state with key `'hitlobster-column-sizing-tracker'`. Wire resizing into `useReactTable`. Update `<table>`, headers, and cells as above. Cell text (`getValue()` returns, `place ?? '—'`, status, date) needs `whitespace-nowrap overflow-hidden text-ellipsis block` wrapper spans.

- [x] `src/client/components/messages/MessagesTable.tsx` -- Same pattern. `size:` defaults: receivedAt: 160, fromAddress: 200, subject: 260, type: 140, company: 160, jobTitle: 200. Key `'hitlobster-column-sizing-messages'`. Interactive cells (type, company, jobTitle columns) do NOT need ellipsis spans — the controls own their own rendering. Text cells (receivedAt, fromAddress, subject) get `whitespace-nowrap overflow-hidden text-ellipsis block` spans.

- [x] `src/client/routes/index.tsx` -- Pass `sizingStorageKey="hitlobster-column-sizing-jobs"` to the `<PipelineTable>` render.

- [x] `src/client/routes/matches.tsx` -- Pass `sizingStorageKey="hitlobster-column-sizing-matches"` to `<PipelineTable>`.

- [x] `src/client/routes/archived.tsx` -- Pass `sizingStorageKey="hitlobster-column-sizing-archive"` to `<PipelineTable>`.

**Acceptance Criteria:**

- Given any of the five tables, when a user drags the right edge of a column header, then the column width changes live and doesn't snap back on release.
- Given a column has been resized, when the user reloads the page, then the column width is preserved.
- Given any text cell value that exceeds the column width, when the column is at any width, then text is clipped with `…` and never wraps to a second line.
- Given the Jobs, Matches, or Archive table, when rendered in their respective routes, then their column widths are stored independently (resizing Jobs doesn't affect Archive widths).
- Given localStorage is corrupted or absent, when the table renders, then columns default to their `size:` values without error.

## Design Notes

**Resize handle:** An `<div>` with `position: absolute; right: 0; top: 0; height: 100%; width: 4px; cursor: col-resize` on the `<th>` (which must have `position: relative`). Show a subtle highlight on hover and while dragging (`getIsResizing()`). Example:

```tsx
<div
  onMouseDown={header.getResizeHandler()}
  onTouchStart={header.getResizeHandler()}
  className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none ${
    header.column.getIsResizing() ? 'bg-zinc-400' : 'bg-zinc-700 opacity-0 hover:opacity-100'
  }`}
/>
```

**Why `table-layout: fixed` + explicit width on `<table>`:** Without these two together, the browser recalculates column widths from content and ignores the sizing state. Setting `width: table.getTotalSize()` allows the table to exceed the scroll container width, enabling horizontal scrolling when needed.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun run build` -- expected: zero type errors, zero build warnings

**Manual checks (if no CLI):**
- On Jobs/Matches/Archive/Applications/Messages pages: drag a column header edge — column resizes, text truncates with `…`, no row height changes.
- Reload page after resize — widths restored.
- Resize Jobs table columns, then navigate to Archive — Archive widths are independent.

## Suggested Review Order

**Core resizing infrastructure (PipelineTable)**

- localStorage helpers with numeric value validation — safe parsing of persisted sizes
  [`PipelineTable.tsx:54`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L54)

- `useReactTable` config: `enableColumnResizing`, `columnResizeMode`, `defaultColumn.minSize`, and `onColumnSizingChange`
  [`PipelineTable.tsx:363`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L363)

- `table-layout: fixed` + `getTotalSize()` — why both are required for declared widths to take effect
  [`PipelineTable.tsx:419`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L419)

- Resize handle: `stopPropagation` on `mousedown` prevents spurious sort toggle on drag click
  [`PipelineTable.tsx:437`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L437)

**Column size defaults + ellipsis (PipelineTable)**

- `size:` defaults per column and `whitespace-nowrap overflow-hidden text-ellipsis` spans replace `max-w-[...]`
  [`PipelineTable.tsx:80`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L80)

**TrackerTable (same pattern)**

- Same pattern applied to Applications table
  [`TrackerTable.tsx:26`](../../job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx#L26)

- `useReactTable` config and resize handle
  [`TrackerTable.tsx:146`](../../job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx#L146)

**MessagesTable (interactive cells)**

- Text cells get ellipsis spans; interactive Type/Company/JobTitle cells are left untouched
  [`MessagesTable.tsx:200`](../../job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx#L200)

- `useReactTable` config and resize handle
  [`MessagesTable.tsx:330`](../../job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx#L330)

**Route wiring — per-table storage keys**

- Jobs, Matches, and Archive each get an independent `sizingStorageKey` so widths don't bleed across views
  [`index.tsx:255`](../../job-hunt-dashboard/src/client/routes/index.tsx#L255)
  [`matches.tsx:43`](../../job-hunt-dashboard/src/client/routes/matches.tsx#L43)
  [`archived.tsx:38`](../../job-hunt-dashboard/src/client/routes/archived.tsx#L38)
