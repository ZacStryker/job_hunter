---
title: 'Bulk Archive Jobs'
type: 'feature'
created: '2026-04-08'
status: 'done'
baseline_commit: '2c51b9f2c486701b2f52733c3191e65c448b81f5'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Archiving jobs one-by-one via the drawer is slow when the user wants to dismiss a batch of irrelevant listings at once.

**Approach:** Add row checkboxes to the Pipeline table; when 1+ rows are selected, show an "Archive (N)" button in the toolbar that calls a new `POST /api/jobs/bulk-archive` endpoint and optimistically removes the jobs from the view.

## Boundaries & Constraints

**Always:**
- `archived` is user-owned — bulk archive only sets it to `true`; never touches Sheets-owned columns
- Optimistic update maps selected IDs in `['jobs']` cache to `archived: true`; rollback on error
- Checkbox click must not open the job drawer — stop propagation
- Bulk archive only available in the Pipeline view (active jobs)

**Ask First:**
- If the approach requires changing `ColumnVisibilityToggle`'s interface or the `localStorage` key

**Never:**
- Bulk unarchive in this story
- Reuse `useJobMutation` for bulk — it is per-job; create a dedicated hook
- Add bulk actions to Tracker or Archived views

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Archive N jobs | Select N rows, click "Archive (N)" | Jobs removed from Pipeline; API returns `{ archived: N }` | N/A |
| Empty ids | POST `{ ids: [] }` | 400 `{ error: "No ids provided" }` | Server validates; client guard ensures non-empty before calling |
| All ids non-existent | POST `{ ids: [99999] }` | 200 `{ archived: 0 }` | Client invalidates cache; no-op |
| Network failure | Mutation rejects | Optimistic update rolled back | Toast shown via existing `onError` path |

</frozen-after-approval>

## Code Map

- `src/server/routes/api-jobs.ts` — add `POST /bulk-archive` before `PATCH /:id` to avoid route shadowing
- `src/server/routes/api-jobs.test.ts` — contract tests for bulk-archive endpoint
- `src/client/hooks/useBulkArchiveMutation.ts` — NEW: bulk archive mutation hook
- `src/client/components/pipeline/PipelineTable.tsx` — add checkbox column, selection state, toolbar button
- `src/client/routes/index.tsx` — wire mutation; pass `onBulkArchive` + `isBulkArchiving` to `PipelineTable`

## Tasks & Acceptance

**Execution:**
- [x] `src/server/routes/api-jobs.ts` -- add `POST /bulk-archive`: validate `{ ids: z.array(z.number().int().positive()).min(1) }`, run `db.transaction` with `db.update(jobs).set({ archived: true }).where(inArray(jobs.id, ids))`, return `{ archived: ids.length }`; import `inArray` from `drizzle-orm`; place before `app.patch('/:id')` -- new bulk endpoint; validates ids non-empty on server
- [x] `src/server/routes/api-jobs.test.ts` -- add 3 contract tests under a new `describe('POST /api/jobs/bulk-archive')` block: (1) archive 2 existing jobs → 200 `{ archived: 2 }`; (2) empty ids array → 400 `{ error: ... }`; (3) all non-existent ids → 200 `{ archived: 0 }` -- validates API contract; use `prodSqlite` to insert/verify rows
- [x] `src/client/hooks/useBulkArchiveMutation.ts` -- NEW file: `useBulkArchiveMutation()` with `mutationFn` POSTing to `/api/jobs/bulk-archive`; `onMutate` optimistically sets `archived: true` for all matching IDs in `['jobs']` cache; `onError` rolls back; `onSettled` invalidates `['jobs']` -- follows `useJobMutation` pattern; one hook per file
- [x] `src/client/components/pipeline/PipelineTable.tsx` -- add `onBulkArchive: (ids: number[]) => void` and `isBulkArchiving: boolean` props; add `rowSelection` state (`Record<string, boolean>`); add `enableRowSelection: true` to `useReactTable`; prepend a display column with `row.getToggleSelectedHandler()` checkbox wrapped in `<div onClick={(e) => e.stopPropagation()}>` to block row click; in toolbar show "Archive (N)" / "Archiving…" button when `selectedCount > 0`; on click call `onBulkArchive(selectedIds)` then `setRowSelection({})` -- stops checkbox from opening drawer; clears selection after action
- [x] `src/client/routes/index.tsx` -- call `useBulkArchiveMutation()`; pass `onBulkArchive={bulkArchiveMutation.mutate}` and `isBulkArchiving={bulkArchiveMutation.isPending}` to `PipelineTable` -- wires mutation into route layer

**Acceptance Criteria:**
- Given Pipeline view with active jobs, when the user checks 1+ checkboxes, then an "Archive (N)" button appears in the toolbar showing the selected count
- Given 1+ rows are selected and the user clicks "Archive (N)", when the request completes, then all selected jobs disappear from the Pipeline view and selection is cleared
- Given the user clicks a checkbox, when it is clicked, then the job drawer does not open
- Given `POST /api/jobs/bulk-archive` receives `{ ids: [] }`, then it returns 400

## Design Notes

**Toolbar layout with selection:**
```tsx
<div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
  <div>
    {selectedCount > 0 && (
      <Button size="sm" variant="outline" onClick={handleBulkArchive} disabled={isBulkArchiving}>
        {isBulkArchiving ? 'Archiving…' : `Archive (${selectedCount})`}
      </Button>
    )}
  </div>
  <ColumnVisibilityToggle table={table} />
</div>
```
Current toolbar has `justify-end` with a single right-side control — change to `justify-between` with a left slot for the action button (empty when nothing selected).

**`inArray` with unknown IDs:** SQLite `IN (...)` with non-existent IDs silently matches 0 rows — safe. But `inArray` with an empty array would produce invalid SQL; the server-side `min(1)` validation prevents this.

**`archived: ids.length` return value:** Returns count sent, not rows actually updated. The client ignores this value (just invalidates cache), so precision isn't needed.

## Verification

**Commands:**
- `/home/zac/.bun/bin/bun test` -- expected: all prior tests pass + 3 new bulk-archive tests
- `/home/zac/.bun/bin/bun run --bun tsc --noEmit` -- expected: zero TypeScript errors

## Suggested Review Order

**API endpoint — validation and atomicity**

- `POST /bulk-archive` route: Zod validation, atomic SELECT+UPDATE inside one transaction
  [`api-jobs.ts:68`](../../job-hunt-dashboard/src/server/routes/api-jobs.ts#L68)

**Client mutation — optimistic update and rollback**

- `useBulkArchiveMutation`: mutationFn, optimistic cache update, rollback on error
  [`useBulkArchiveMutation.ts:4`](../../job-hunt-dashboard/src/client/hooks/useBulkArchiveMutation.ts#L4)

- Optimistic update maps `archived: true` over matching IDs in `['jobs']` cache
  [`useBulkArchiveMutation.ts:26`](../../job-hunt-dashboard/src/client/hooks/useBulkArchiveMutation.ts#L26)

**Table selection — checkbox column and toolbar**

- `selectionColumn` display column: `stopPropagation` guards drawer from opening on checkbox click
  [`PipelineTable.tsx:40`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L40)

- `getRowId` uses job ID (not row index) — selection stable across data changes
  [`PipelineTable.tsx:154`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L154)

- Toolbar: Archive button visible only when `onBulkArchive` prop provided AND rows selected
  [`PipelineTable.tsx:177`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L177)

**Route wiring**

- `PipelineRoute` instantiates mutation and passes it to table; Archived route omits prop (no bulk action there)
  [`index.tsx:78`](../../job-hunt-dashboard/src/client/routes/index.tsx#L78)

**Tests**

- Three contract tests: success count, empty ids → 400, non-existent ids → 200 archived:0
  [`api-jobs.test.ts:370`](../../job-hunt-dashboard/src/server/routes/api-jobs.test.ts#L370)
