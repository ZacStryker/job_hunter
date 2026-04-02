# Story 3.4: View Switching, Loading & Empty States

Status: done

## Dev Agent Record

### Completion Notes

- AC1 & AC2: Verified — Layout.tsx and router.ts already had correct TanStack Router Link/route setup; no code changes needed
- AC3: Installed shadcn Skeleton component via `bunx shadcn@latest add skeleton`; added `SkeletonCard` function component to `routes/index.tsx` with 7-column structure matching PipelineTable, controls bar placeholder, and same card dimensions
- AC4: Replaced disabled static Button with functional `EmptyState` component using `useSyncMutation()` directly; button disabled during `syncMutation.isPending`, shows "Syncing…" label while pending
- Split `isPending` (skeleton) and empty-data (empty state) checks into distinct branches per story spec
- Zero TypeScript errors; 28 tests pass

## Review Findings

- [x] [Review][Patch] Sync mutation error not surfaced — `EmptyState` renders no user feedback when `syncMutation.isError` is true; button silently resets to "Sync" after a failed sync [src/client/routes/index.tsx]
- [x] [Review][Defer] Query fetch error silently maps to EmptyState — `isError` not destructured; failed fetch shows "No jobs yet" instead of an error message — explicitly out of scope per story spec [src/client/routes/index.tsx]
- [x] [Review][Defer] No loading indicator during post-sync refetch — `isPending` stays false while jobs query refetches after sync success; no skeleton shown during background fetch [src/client/routes/index.tsx]
- [x] [Review][Defer] Sync mutation instances not shared across navigation — remounted `PipelineRoute` creates a new `useSyncMutation()` instance with fresh `isPending: false` while a request is still in-flight; second sync can be triggered [src/client/routes/index.tsx]
- [x] [Review][Defer] `data === undefined` falls through to EmptyState — conflates error, uninitialized, and legitimately-empty states; explicitly out of scope per story spec [src/client/routes/index.tsx]
- [x] [Review][Defer] SkeletonCard column headers hardcoded — will drift if PipelineTable column definitions change; no shared source of truth [src/client/routes/index.tsx]
- [x] [Review][Defer] `bg-muted` CSS variable may not render correctly in dark zinc theme — shadcn-generated; verify `--muted` is defined in global stylesheet [src/client/components/ui/skeleton.tsx]

## Change Log

- 2026-04-02: Story created by SM agent (create-story workflow)
- 2026-04-02: Implemented by dev agent — skeleton loading state, functional empty state sync button, view switching verified

## File List

- `job-hunt-dashboard/src/client/routes/index.tsx` — modified (split states, added SkeletonCard + EmptyState, wired useSyncMutation)
- `job-hunt-dashboard/src/client/components/ui/skeleton.tsx` — new (shadcn generated)
- `job-hunt-dashboard/bun.lock` — updated (shadcn skeleton dependency)
- `job-hunt-dashboard/package.json` — updated (shadcn skeleton dependency)

## Story

As a user,
I want smooth transitions between Pipeline and Tracker views, a skeleton during initial load, and a clear prompt when no jobs exist,
So that the interface feels polished and purposeful in every state.

## Acceptance Criteria

1. **Given** the app loads **When** the Pipeline view is the default **Then** the Pipeline tab in the header is active (`text-zinc-100` + bottom border); Tracker tab is muted (`text-zinc-500`)

2. **Given** the user clicks the Tracker tab **When** the view switches **Then** TanStack Router navigates to `/tracker`; the Tracker tab becomes active; the Pipeline table unmounts **And** the Tracker route renders a placeholder — no crash, no blank screen

3. **Given** the app is performing the initial jobs fetch (`isPending` is true) **When** the Pipeline table area renders **Then** 5–8 Skeleton rows appear in place of the table, preserving the column structure so no layout shift occurs when data arrives

4. **Given** the database contains zero job records **When** the Pipeline table renders with empty data **Then** a centered empty state is shown inside the card: "No jobs yet. Hit Sync to pull from Google Sheets." with a Button that triggers sync

## Tasks / Subtasks

- [x] Task 1: Verify AC1 & AC2 — view switching is already implemented (AC: 1, 2)
  - [x] Confirm `Layout.tsx` has `<Link to="/">` and `<Link to="/tracker">` with `activeProps`/`inactiveProps`
  - [x] Confirm `router.ts` has both `/` and `/tracker` routes
  - [x] Confirm `TrackerRoute` renders without crash
  - [x] Run `bun test` — all existing tests pass
  - [x] If tests pass and code is correct, AC1 & AC2 require no code changes — just verification

- [x] Task 2: Install shadcn Skeleton component (AC: 3)
  - [x] From `job-hunt-dashboard/`, run: `bunx shadcn@latest add skeleton`
  - [x] Verify `src/client/components/ui/skeleton.tsx` exists — do NOT hand-edit it

- [x] Task 3: Update `routes/index.tsx` — add skeleton loading state (AC: 3)
  - [x] Destructure `isPending` from `useJobsQuery()` alongside `data`
  - [x] Add early return: when `isPending` is true, render skeleton card (see Dev Notes for implementation)
  - [x] Skeleton must use same outer card class as PipelineTable: `rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden`
  - [x] Render 6 skeleton rows; each row: 7 cells matching column widths (see Dev Notes)
  - [x] Include controls bar placeholder in skeleton (matching PipelineTable structure)
  - [x] Import `Skeleton` from `../components/ui/skeleton`

- [x] Task 4: Update `routes/index.tsx` — fix empty state sync button (AC: 4)
  - [x] Import `useSyncMutation` from `../hooks/useSyncMutation`
  - [x] Call `useSyncMutation()` in `PipelineRoute` component
  - [x] In empty state, replace disabled Button with functional Button calling `syncMutation.mutate()`
  - [x] Disable button while `syncMutation.isPending` is true (prevents double-fire)
  - [x] Do NOT import or use `SyncButton` component — use a plain `Button` (see Dev Notes for reasoning)
  - [x] Separate the `isPending` check (skeleton) from the empty data check (empty state) — they are distinct states

- [x] Task 5: Verify (AC: 1–4)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `bun test` — all existing tests still pass
  - [x] Manual: app loads → Pipeline tab has active styling; Tracker tab is muted
  - [x] Manual: click Tracker tab → navigates to `/tracker`; Tracker tab active; no crash
  - [x] Manual: click back to Pipeline → Pipeline tab active again
  - [x] Manual: temporarily force `isPending` true (or clear cache) → skeleton rows visible in card
  - [x] Manual: with empty DB → empty state shows correct text + functional Sync button

## Dev Notes

### CRITICAL: AC1 & AC2 Are Already Implemented

View switching via TanStack Router is **already done** — do not rewrite it.

`Layout.tsx` already uses:
```tsx
<Link to="/" activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
              inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}>Pipeline</Link>
<Link to="/tracker" activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
                    inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}>Tracker</Link>
```

`router.ts` already has both routes. `TrackerRoute` already renders a placeholder. AC1 and AC2 need verification only — no code changes.

### UX Spec Conflict (Resolved)

The UX spec (`ux-consistency-patterns.md`) says "No routing — view switch is local state." This was overridden by the architecture design. The epic AC explicitly says "TanStack Router navigates to `/tracker`" and `router.ts` was implemented with two routes in Story 3.1. Follow the architecture + epic AC — routing is the correct approach.

### State Logic for PipelineRoute

The current `index.tsx` combines loading and empty into one check — this must be **split**:

```tsx
export function PipelineRoute() {
  const { data: jobs, isPending } = useJobsQuery()
  const syncMutation = useSyncMutation()

  if (isPending) {
    return <SkeletonCard />   // AC3
  }

  if (jobs && jobs.length > 0) {
    return (
      <div className="p-4">
        <PipelineTable jobs={jobs} />
      </div>
    )
  }

  // data loaded, zero records
  return <EmptyState syncMutation={syncMutation} />  // AC4
}
```

These can be inline JSX or small helper components inside the file — do not extract to separate files.

### Skeleton Implementation

The skeleton must match PipelineTable's column structure to prevent layout shift. PipelineTable has 7 columns: Company, Job Title, Score, Action, Reqs Met, Reqs Missed, Notes.

```tsx
import { Skeleton } from '../components/ui/skeleton'

function SkeletonCard() {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
        {/* Controls bar placeholder — matches PipelineTable's controls bar */}
        <div className="flex items-center justify-end px-3 py-2 border-b border-zinc-800 shrink-0">
          <Skeleton className="h-8 w-20" />
        </div>
        {/* Table skeleton */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900/80 border-b border-zinc-800">
              <tr>
                {['Company', 'Job Title', 'Score', 'Action', 'Reqs Met', 'Reqs Missed', 'Notes'].map((col) => (
                  <th key={col} className="px-3 h-9 text-left text-xs font-medium uppercase text-zinc-400">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-36" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-5 w-10 rounded-full" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

**Why same `max-h-[calc(100vh-88px)]` and flex layout as PipelineTable:** Prevents layout shift when data loads — the card occupies the same space.

**Why raw `<table>` not shadcn `<Table>`:** Matches the pattern established in Story 3.2 to fix sticky header. Do NOT revert to shadcn `<Table>` wrapper.

### Empty State Implementation

```tsx
function EmptyState({ syncMutation }: { syncMutation: ReturnType<typeof useSyncMutation> }) {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-400">
              No jobs yet. Hit Sync to pull from Google Sheets.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Why not `SyncButton` component:** `SyncButton` in the header takes `onSync` + `isPending` props controlled by Layout's mutation instance. Using `SyncButton` here would require threading props or a second mutation instance that shows spinner — but the header's SyncButton won't show spinner since it's a different mutation instance. Using a plain `Button` keeps the empty state self-contained and avoids confusion. The mutation's `invalidateQueries` call on success will refresh `['jobs']` and cause the empty state to be replaced with the table.

**Why `useSyncMutation()` directly in PipelineRoute, not shared with Layout:** TanStack Query `useMutation` instances are independent — each call creates its own state. This is fine. The important effect is `onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] })` which runs regardless of which component triggered it.

### `useJobsQuery` Returns `isPending`

`useJobsQuery()` returns a standard TanStack Query result. Use `isPending` (not `isLoading`) per TanStack Query v5 conventions:

```tsx
const { data: jobs, isPending } = useJobsQuery()
```

**When `isPending` is true in practice:** Because the route loader calls `queryClient.ensureQueryData`, the jobs query is pre-fetched before the component renders — `isPending` will often be false immediately on render. However, `isPending` is still valid in edge cases (e.g., direct navigation, hot reload). Implement it correctly per spec regardless.

### Updated Complete `routes/index.tsx`

```tsx
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useSyncMutation } from '../hooks/useSyncMutation'
import { PipelineTable } from '../components/pipeline/PipelineTable'

function SkeletonCard() {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
        <div className="flex items-center justify-end px-3 py-2 border-b border-zinc-800 shrink-0">
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900/80 border-b border-zinc-800">
              <tr>
                {['Company', 'Job Title', 'Score', 'Action', 'Reqs Met', 'Reqs Missed', 'Notes'].map((col) => (
                  <th key={col} className="px-3 h-9 text-left text-xs font-medium uppercase text-zinc-400">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-36" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-5 w-10 rounded-full" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ syncMutation }: { syncMutation: ReturnType<typeof useSyncMutation> }) {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-400">
              No jobs yet. Hit Sync to pull from Google Sheets.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PipelineRoute() {
  const { data: jobs, isPending } = useJobsQuery()
  const syncMutation = useSyncMutation()

  if (isPending) {
    return <SkeletonCard />
  }

  if (jobs && jobs.length > 0) {
    return (
      <div className="p-4">
        <PipelineTable jobs={jobs} />
      </div>
    )
  }

  return <EmptyState syncMutation={syncMutation} />
}
```

### Previous Story Learnings (From 3.3)

- **`bun` not in PATH** — always use `/home/zac/.bun/bin/bun` for CLI commands
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are errors; remove unused imports
- **shadcn/ui files in `components/ui/` are generated** — only extend via `className` prop, never edit source
- **Raw `<table>` element** — Story 3.2 replaced shadcn `<Table>` wrapper with raw `<table>` to fix sticky header; do not revert
- **`@shared/schemas`** — import `Job` type from here only (used indirectly via hook returns — no direct import needed in this story)
- **No comments for obvious code** — don't add JSDoc or explanatory comments

### Project Structure After This Story

```
src/client/
  routes/
    index.tsx        ← MODIFIED (split isPending/empty/loaded states; add skeleton; fix sync button)
    tracker.tsx      ← existing (unchanged)
  components/ui/
    skeleton.tsx     ← NEW (shadcn generated — do not hand-edit)
    (all others unchanged)
  components/pipeline/
    PipelineTable.tsx      ← existing (unchanged)
    ColumnVisibilityToggle.tsx ← existing (unchanged)
    ScoreBadge.tsx         ← existing (unchanged)
    ActionChip.tsx         ← existing (unchanged)
```

### Out-of-Scope (Do NOT Implement)

- ❌ TrackerTable component — Tracker view stays as placeholder until Epic 5
- ❌ AgingRow component — Epic 5
- ❌ Row click → drawer (Story 4.1)
- ❌ Visual row aging in Tracker (Epic 5)
- ❌ Error state for failed jobs fetch — TanStack Query exposes `isError` but this story does not address it
- ❌ Changes to Layout.tsx — view switching is already correct
- ❌ Changes to PipelineTable.tsx — no modifications needed in this story
- ❌ `isLoading` (deprecated in TanStack Query v5) — use `isPending`

### Anti-Patterns (Do Not Do)

- ❌ Combine `isPending` and empty-data into a single check — they are distinct states
- ❌ Use shadcn `<Table>` wrapper in skeleton — use raw `<table>` (matches PipelineTable pattern)
- ❌ Revert sticky header fix from Story 3.2 — keep raw `<table>` element
- ❌ Hand-edit `components/ui/skeleton.tsx` after shadcn generates it
- ❌ Use `isLoading` instead of `isPending` (TanStack Query v5)
- ❌ Put sync mutation logic in the empty state Button without disabling during `isPending`
- ❌ Import `Job` type from anywhere except `src/shared/schemas.ts` (not needed directly in this story)
- ❌ Use `fetch('/api/sync')` directly — use `useSyncMutation` hook
- ❌ Add any new shadcn components beyond `skeleton`

### References

- Epic 3 Story 3.4 AC [Source: `_bmad-output/planning-artifacts/epics/epic-3-pipeline-view-job-triage-at-a-glance.md#Story 3.4`]
- UX loading & empty states [Source: `_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#Loading & Empty States`]
- Architecture: TanStack Query `isPending`, routing, two routes [Source: `_bmad-output/planning-artifacts/architecture-distillate.md`]
- Previous story 3.3: raw `<table>` pattern, shadcn component rules, bun path [Source: `_bmad-output/implementation-artifacts/3-3-column-visibility-toggle-and-localstorage-persistence.md`]
- Project context: TypeScript strict, no unused locals, hook conventions [Source: `_bmad-output/project-context.md`]
