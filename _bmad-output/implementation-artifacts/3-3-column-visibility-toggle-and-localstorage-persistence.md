# Story 3.3: Column Visibility Toggle & localStorage Persistence

Status: done

## Dev Agent Record

### Completion Notes

- Installed `dropdown-menu` shadcn component via `bunx shadcn@latest add dropdown-menu`
- Created `ColumnVisibilityToggle.tsx` with `Table<Job>` prop, 3 optional column checkboxes (`reqs_met`, `reqs_missed`, `notes`)
- Updated `PipelineTable.tsx`: added 3 optional column definitions (`requirementsMet`→`reqs_met`, `requirementsMissed`→`reqs_missed`, `roleFit`→`notes`), localStorage visibility persistence using frozen key `"job-hunt-column-visibility"`, controlled sorting defaulting to fitScore desc, controls bar with flex layout, clickable sortable headers with ↑/↓ indicators
- TypeScript: zero errors (`tsc --noEmit`)
- Tests: 28 pass, 0 fail — no regressions

## Change Log

- 2026-04-01: Story created by SM agent (create-story workflow)
- 2026-04-01: Story implemented — column visibility toggle, localStorage persistence, sorting (Date: 2026-04-01)

## File List

- `job-hunt-dashboard/src/client/components/ui/dropdown-menu.tsx` (new — shadcn generated)
- `job-hunt-dashboard/src/client/components/pipeline/ColumnVisibilityToggle.tsx` (new)
- `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` (modified — add optional columns, visibility state, sorting)
- `job-hunt-dashboard/package.json` (possibly modified — shadcn dependency update)
- `job-hunt-dashboard/bun.lockb` (possibly modified — lockfile)

## Story

As a user,
I want to show or hide optional table columns and have my preference remembered across sessions,
So that my table layout stays exactly how I left it every time I open the dashboard.

## Acceptance Criteria

1. **Given** the Pipeline table is visible **When** the user clicks the column visibility toggle in the header **Then** a `DropdownMenu` opens showing checkboxes for optional columns: `reqs_met`, `reqs_missed`, `notes` **And** all optional columns are shown by default on first load

2. **Given** the user unchecks a column **When** the dropdown closes **Then** that column is immediately hidden in the table without a page reload

3. **Given** the user has hidden one or more columns and refreshes the page **When** the app loads **Then** the same columns are hidden, restored from localStorage under the frozen key `"job-hunt-column-visibility"`

4. **Given** a column header is clicked **When** it is clicked once **Then** the table sorts by that column ascending; clicking again sorts descending **And** the fit score column sorts descending by default on initial load; no multi-column sort is supported

## Tasks / Subtasks

- [x] Task 1: Install DropdownMenu shadcn component (AC: 1)
  - [x] From `job-hunt-dashboard/`, run: `bunx shadcn@latest add dropdown-menu`
  - [x] Verify `src/client/components/ui/dropdown-menu.tsx` exists — do NOT hand-edit it

- [x] Task 2: Create `src/client/components/pipeline/ColumnVisibilityToggle.tsx` (AC: 1, 2)
  - [x] See complete implementation below in Dev Notes
  - [x] Props: `{ table: Table<Job> }` — accepts the TanStack Table instance directly
  - [x] Renders a `Button` trigger (variant="outline" size="sm", label "Columns") + `DropdownMenu`
  - [x] Checkboxes for exactly 3 column IDs: `reqs_met`, `reqs_missed`, `notes`
  - [x] Each `DropdownMenuCheckboxItem` reads `column.getIsVisible()` and calls `column.toggleVisibility(value)` on change
  - [x] Import `Table` type from `@tanstack/react-table`; import `Job` type from `@shared/schemas`
  - [x] Import `Button` from `../ui/button`
  - [x] Import dropdown primitives from `../ui/dropdown-menu`

- [x] Task 3: Update `PipelineTable.tsx` — add optional columns (AC: 1, 2)
  - [x] Add 3 new column definitions using `columnHelper.accessor(...)` with explicit `id`:
    - `requirementsMet` field → `id: 'reqs_met'`, header: `'Reqs Met'`, cell: truncated string or `—` if null
    - `requirementsMissed` field → `id: 'reqs_missed'`, header: `'Reqs Missed'`, cell: truncated string or `—` if null
    - `roleFit` field → `id: 'notes'`, header: `'Notes'`, cell: truncated string or `—` if null
  - [x] These 3 new columns are optional (toggleable); company, jobTitle, fitScore, recommendation stay required/always-visible
  - [x] Cell rendering for text columns: truncate long strings — `<span className="text-zinc-400 max-w-[200px] truncate block">{value}</span>` if non-null, otherwise `<span className="text-zinc-500">—</span>`

- [x] Task 4: Update `PipelineTable.tsx` — add column visibility state + localStorage persistence (AC: 1, 2, 3)
  - [x] Import `useState`, `VisibilityState` (type) from React/TanStack
  - [x] Initialize `columnVisibility` state from localStorage (see Dev Notes for exact pattern)
  - [x] Persist to localStorage on every change via `onColumnVisibilityChange` (see Dev Notes)
  - [x] Pass `state: { columnVisibility, sorting }` and `onColumnVisibilityChange` to `useReactTable`

- [x] Task 5: Update `PipelineTable.tsx` — add sorting (AC: 4)
  - [x] Import `getSortedRowModel`, `SortingState` from `@tanstack/react-table`
  - [x] Add `sorting` state with default `[{ id: 'fitScore', desc: true }]`
  - [x] Add `onSortingChange` setter
  - [x] Pass `getSortedRowModel: getSortedRowModel()` and `enableMultiSort: false` to `useReactTable`
  - [x] Add `onClick={header.column.getToggleSortingHandler()}` to `<TableHead>` — add `cursor-pointer` class
  - [x] Add sort indicator: append `↑` / `↓` after header text based on `header.column.getIsSorted()`

- [x] Task 6: Update `PipelineTable.tsx` — add controls bar (AC: 1)
  - [x] Render a controls bar div as the first child of the outer card div (before the scroll container)
  - [x] Controls bar: `<div className="flex items-center justify-end px-3 py-2 border-b border-zinc-800">`
  - [x] Inside: `<ColumnVisibilityToggle table={table} />`
  - [x] Change outer card div to flex+flex-col and move max-h constraint to the outer div (see Dev Notes for exact structure)

- [x] Task 7: Verify (AC: 1–4)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `bun test` — all existing tests still pass
  - [x] Manual: click "Columns" button → DropdownMenu appears with 3 checkboxes, all checked
  - [x] Manual: uncheck "Reqs Met" → column disappears immediately
  - [x] Manual: refresh page → "Reqs Met" column still hidden
  - [x] Manual: table initially sorted by fit score descending
  - [x] Manual: click "Company" header → sorts ascending; click again → sorts descending

### Review Findings

- [x] [Review][Patch] `localStorage.setItem` can throw (quota/private mode) inside React state updater — unhandled exception crashes state update [PipelineTable.tsx:101]
- [x] [Review][Patch] Parsed VisibilityState never type-validated — non-object JSON (array, string, number) silently corrupts column state [PipelineTable.tsx:27]
- [x] [Review][Defer] `loadVisibility` has no guard for non-browser environments (SSR, edge runtimes) [PipelineTable.tsx:24] — deferred, pre-existing SPA pattern; non-issue in current browser-only stack
- [x] [Review][Defer] Stale/orphaned column IDs in persisted VisibilityState survive schema changes silently [PipelineTable.tsx:27] — deferred, theoretical; frozen IDs make this unlikely
- [x] [Review][Defer] All column headers sortable including Action chip — no `enableSorting: false` on non-semantic columns [PipelineTable.tsx:133] — deferred, UX improvement not in AC scope
- [x] [Review][Defer] No `aria-sort` attribute on sortable column headers — screen readers cannot communicate sort state [PipelineTable.tsx:130-137] — deferred, accessibility improvement not in AC scope
- [x] [Review][Defer] Truncated cell values lack `title` attribute — full content inaccessible on hover [PipelineTable.tsx:55-87] — deferred, accessibility improvement not in AC scope
- [x] [Review][Defer] `OPTIONAL_COLUMNS` manifest in ColumnVisibilityToggle duplicates column IDs from PipelineTable — no compile-time sync [ColumnVisibilityToggle.tsx:11] — deferred, minor tech debt; frozen IDs reduce risk
- [x] [Review][Defer] Empty string cell values treated identically to null (em-dash) — may mask blank-but-present data [PipelineTable.tsx:55-87] — deferred, edge case; Sheets data unlikely to produce empty strings vs null

## Dev Notes

### CRITICAL: `"job-hunt-column-visibility"` localStorage Key Is Frozen

The project-context.md declares this key frozen: `"job-hunt-column-visibility"`. Use this key exactly. **Do NOT use** `"job-dashboard:column-visibility"` (appears in an older UX spec doc — it is overridden by project-context.md).

### CRITICAL: `notes` Column Maps to `roleFit` Field

The Job schema has no `notes` field. The AC refers to column IDs used in the DropdownMenu and localStorage:
- `reqs_met` → accessor `requirementsMet`
- `reqs_missed` → accessor `requirementsMissed`
- `notes` → accessor `roleFit` (Claude's role-fit assessment, displayed as "Notes" column header)

Column IDs must match the AC exactly because they are the keys persisted to localStorage. Use explicit `id` in `columnHelper.accessor`:
```ts
columnHelper.accessor('roleFit', { id: 'notes', header: 'Notes', ... })
```

### Column Definitions — Complete Updated List

Define all 7 columns outside the component (to avoid recreation on render):

```tsx
const columnHelper = createColumnHelper<Job>()

const columns = [
  columnHelper.accessor('company', {
    header: 'Company',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('jobTitle', {
    header: 'Job Title',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('fitScore', {
    header: 'Score',
    cell: (info) => <ScoreBadge score={info.getValue()} />,
  }),
  columnHelper.accessor('recommendation', {
    header: 'Action',
    cell: (info) => <ActionChip recommendation={info.getValue()} />,
  }),
  columnHelper.accessor('requirementsMet', {
    id: 'reqs_met',
    header: 'Reqs Met',
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="max-w-[200px] truncate block text-zinc-300">{v}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('requirementsMissed', {
    id: 'reqs_missed',
    header: 'Reqs Missed',
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="max-w-[200px] truncate block text-zinc-300">{v}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('roleFit', {
    id: 'notes',
    header: 'Notes',
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="max-w-[200px] truncate block text-zinc-300">{v}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
]
```

### Column Visibility State + localStorage Persistence

```tsx
import { useState } from 'react'
import type { VisibilityState, SortingState, Updater } from '@tanstack/react-table'

const VISIBILITY_KEY = 'job-hunt-column-visibility'

function loadVisibility(): VisibilityState {
  try {
    const stored = localStorage.getItem(VISIBILITY_KEY)
    return stored ? (JSON.parse(stored) as VisibilityState) : {}
  } catch {
    return {}
  }
}

export function PipelineTable({ jobs }: PipelineTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadVisibility)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'fitScore', desc: true }])

  function handleVisibilityChange(updater: Updater<VisibilityState>) {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next))
      return next
    })
  }

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    state: { columnVisibility, sorting },
    onColumnVisibilityChange: handleVisibilityChange,
    onSortingChange: setSorting,
  })

  // ...
}
```

**Why `loadVisibility` is a function ref** (not `loadVisibility()`): Passing a function to `useState` is the lazy initializer pattern — it only runs once on mount, not on every render.

**Why `Updater<VisibilityState>`**: `onColumnVisibilityChange` passes either a new state value or an updater function. Handle both with the `typeof updater === 'function'` check.

### Sortable Column Headers

```tsx
{headerGroup.headers.map((header) => {
  const sorted = header.column.getIsSorted()
  return (
    <TableHead
      key={header.id}
      className="px-3 h-9 text-xs font-medium uppercase text-zinc-400 cursor-pointer select-none"
      onClick={header.column.getToggleSortingHandler()}
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}
    </TableHead>
  )
})}
```

### Updated PipelineTable Card Structure (controls bar + flex layout)

The outer card must use `flex flex-col` with the `max-h` on the card itself, so the scroll container grows to fill the remaining space:

```tsx
return (
  <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
    {/* Controls bar */}
    <div className="flex items-center justify-end px-3 py-2 border-b border-zinc-800 shrink-0">
      <ColumnVisibilityToggle table={table} />
    </div>
    {/* Scrollable table */}
    <div className="overflow-auto flex-1">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800">
          {/* ... */}
        </TableHeader>
        <TableBody>
          {/* ... */}
        </TableBody>
      </table>
    </div>
  </div>
)
```

**Why flex layout instead of fixed px subtraction:** The controls bar height may vary. Using `flex flex-col` with `max-h` on the outer card + `flex-1 overflow-auto` on the scroll container is more robust than trying to subtract `controls height + padding` from `calc(100vh-...)`.

**Why `max-h-[calc(100vh-88px)]` stays the same:** The controls bar is inside the card, not outside it. The 88px accounts for app header (56px) + route padding (p-4 = 16px top + 16px bottom = 32px). This is unchanged from Story 3.2.

### ColumnVisibilityToggle — Complete Implementation

```tsx
import type { Table } from '@tanstack/react-table'
import type { Job } from '@shared/schemas'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const OPTIONAL_COLUMNS: Array<{ id: string; label: string }> = [
  { id: 'reqs_met', label: 'Reqs Met' },
  { id: 'reqs_missed', label: 'Reqs Missed' },
  { id: 'notes', label: 'Notes' },
]

interface ColumnVisibilityToggleProps {
  table: Table<Job>
}

export function ColumnVisibilityToggle({ table }: ColumnVisibilityToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONAL_COLUMNS.map(({ id, label }) => {
          const column = table.getColumn(id)
          if (!column) return null
          return (
            <DropdownMenuCheckboxItem
              key={id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(value)}
            >
              {label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Why `table.getColumn(id)` may return undefined:** The `id` must match exactly what was declared in the column definition. If the column helper's `id` is wrong, `getColumn` returns `undefined` and the item renders `null`. This is defensive — no crash.

### TanStack Table v8 Sorting Key Points

- `getSortedRowModel` must be imported and passed to `useReactTable` — table won't sort without it
- `state.sorting` + `onSortingChange` are required for controlled sorting
- `enableMultiSort: false` — AC specifies no multi-column sort
- Default sort `[{ id: 'fitScore', desc: true }]` in `useState` initial value — fitScore sorts descending on first load
- `header.column.getToggleSortingHandler()` returns `undefined` for non-sortable columns — always safe to call as `onClick` handler

### shadcn DropdownMenu Key Imports

The shadcn-generated `dropdown-menu.tsx` exports:
```ts
DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem,
DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub,
DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger
```

For this story, import only: `DropdownMenu`, `DropdownMenuCheckboxItem`, `DropdownMenuContent`, `DropdownMenuTrigger`.

### Existing PipelineTable Structure to Preserve

From Story 3.2's review fix, `PipelineTable` uses a raw `<table>` element (not shadcn's `<Table>` wrapper) inside an `overflow-auto` container to fix the sticky header. **Do not revert this** — keep the raw `<table>` element:

```tsx
<div className="overflow-auto flex-1">
  <table className="w-full caption-bottom text-sm">
    <TableHeader ...>   {/* still uses shadcn TableHeader, TableRow, TableHead */}
    <TableBody ...>
  </table>
</div>
```

The raw `<table>` bypasses shadcn's `<Table>` wrapper (which added a conflicting `overflow-auto` that broke sticky). Keep it.

### Previous Story Learnings

- **`bun` not in PATH** — always `/home/zac/.bun/bin/bun` for CLI verification commands
- **TypeScript strict mode** — no implicit `any`; unused locals are compile errors
- **All shared types from `@shared/schemas`** — never inline redefinitions
- **shadcn/ui files in `components/ui/` are generated** — only extend via `className` prop, never edit the source
- **Column defs outside component** — prevents recreation on every render (already done in Story 3.2, keep them outside)
- **Score thresholds use epic AC values** (≥75/50–74/<50), not architecture distillate values — no change needed in this story

### Project Structure After This Story

```
src/client/
  components/pipeline/
    ScoreBadge.tsx           ← existing (unchanged)
    ActionChip.tsx           ← existing (unchanged)
    PipelineTable.tsx        ← MODIFIED (optional columns, visibility, sorting, controls bar)
    ColumnVisibilityToggle.tsx ← NEW
  components/ui/
    dropdown-menu.tsx        ← NEW (shadcn generated — do not hand-edit)
    table.tsx                ← existing (unchanged)
    badge.tsx                ← existing (unchanged)
    button.tsx               ← existing (unchanged)
    alert.tsx                ← existing (unchanged)
  routes/
    index.tsx                ← existing (unchanged)
    tracker.tsx              ← existing (unchanged)
```

### Out-of-Scope (Do NOT Implement)

- ❌ Column visibility toggle in the app header/Layout.tsx — keep it inside PipelineTable's card
- ❌ Sorting persistence to localStorage — only column visibility persists; sorting resets to fitScore desc on page load
- ❌ Loading/skeleton state (Story 3.4)
- ❌ View switching tab styling updates (Story 3.4)
- ❌ Row click → drawer (Story 4.1)
- ❌ Any new shadcn components beyond `dropdown-menu`

### Anti-Patterns (Do Not Do)

- ❌ Use localStorage key `"job-dashboard:column-visibility"` — use `"job-hunt-column-visibility"` (frozen)
- ❌ Use `id: 'requirementsMet'` for the reqs met column — use `id: 'reqs_met'` to match AC and localStorage keys
- ❌ Hand-edit `components/ui/dropdown-menu.tsx` after shadcn generates it
- ❌ Lift `columnVisibility` state out of `PipelineTable` — keep it self-contained
- ❌ Add `enableMultiSort: true` — AC requires single-column sort only
- ❌ Persist sorting to localStorage — only column visibility persists
- ❌ Revert the raw `<table>` fix from Story 3.2 back to shadcn `<Table>` wrapper
- ❌ Define column defs inside the component function — they must remain outside to avoid recreation

### References

- Epic 3 Story 3.3 AC [Source: `_bmad-output/planning-artifacts/epics/epic-3-pipeline-view-job-triage-at-a-glance.md#Story 3.3`]
- UX table interaction patterns — column visibility, sorting [Source: `_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md`]
- Architecture: TanStack Table column visibility + localStorage key [Source: `_bmad-output/planning-artifacts/architecture-distillate.md#Frontend Architecture`]
- Project context: frozen localStorage key, component folders, shadcn rules [Source: `_bmad-output/project-context.md`]
- Previous story 3.2: PipelineTable implementation, sticky header fix, raw `<table>` pattern [Source: `_bmad-output/implementation-artifacts/3-2-pipeline-table-with-fit-score-badge-and-action-chip.md`]
