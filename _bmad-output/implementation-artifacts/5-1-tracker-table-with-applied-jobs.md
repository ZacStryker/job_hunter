# Story 5.1: Tracker Table with Applied Jobs

Status: done

## Story

As a user,
I want a dedicated view showing only my applied jobs with their status and application date,
So that I can monitor the state of my active application pipeline at a glance.

## Acceptance Criteria

1. **Given** the user navigates to `/tracker`
   **When** the route renders
   **Then** a table appears showing only jobs where `applied === true`, filtered client-side from the existing `['jobs']` TanStack Query cache — no additional API call

2. **Given** applied jobs exist
   **When** the Tracker table renders
   **Then** the table shows columns: company, job title, status (or `statusOverride` if set), and date applied formatted as "Mar 27, 2026"
   **And** rows use `py-1.5 px-3` density and `text-sm` typography matching the Pipeline table

3. **Given** no jobs have `applied === true`
   **When** the Tracker table renders
   **Then** an empty state is shown: "No applied jobs yet. Mark jobs as applied in the Pipeline view."

4. **Given** the user clicks a row in the Tracker table
   **When** the click is registered
   **Then** the `JobDrawer` opens for that job — same drawer from Epic 4, reused here

## Tasks / Subtasks

- [x] Task 1: Update `trackerRoute` loader in `src/client/lib/router.ts`
  - [x] Add `loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs })` — same pattern as `indexRoute`
  - [x] `fetchJobs` and `queryClient` are already imported — no new imports needed

- [x] Task 2: Create `src/client/components/tracker/TrackerTable.tsx`
  - [x] See Dev Notes for full implementation
  - [x] Props: `jobs: Job[]`, `onRowClick: (job: Job) => void`, `selectedJobId: number | null`
  - [x] Filter applied jobs: `jobs.filter(j => j.applied)`
  - [x] Status display: `job.statusOverride ?? job.status ?? '—'`
  - [x] Date formatting: `new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(job.dateApplied + 'T00:00:00'))` — the `+ 'T00:00:00'` suffix is critical (see Dev Notes)
  - [x] Empty state: `<p className="text-sm text-zinc-400">No applied jobs yet. Mark jobs as applied in the Pipeline view.</p>`
  - [x] Active row highlight: `bg-zinc-800` when `job.id === selectedJobId`; hover: `hover:bg-zinc-800/50`
  - [x] No column visibility toggle — all four columns are always visible
  - [x] No sorting needed — not specified in AC

- [x] Task 3: Replace `TrackerRoute` in `src/client/routes/tracker.tsx`
  - [x] See Dev Notes for full implementation
  - [x] `useJobsQuery()` for data; `useState<number | null>(null)` for `selectedJobId`
  - [x] `JobDrawer` reused — same import and usage as `PipelineRoute`
  - [x] Loading state: same `SkeletonCard` pattern is NOT needed here (route loader ensures data is pre-cached); but `isPending` guard is safe to include as a fallback

- [x] Task 4: Verify
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests still pass (no new server-side code; no new tests required for this story)
  - [x] Manual: navigate to `/tracker` — see "No applied jobs yet." if none applied
  - [x] Manual: mark a job as applied in Pipeline view → navigate to Tracker → job appears with correct date and status
  - [x] Manual: click a Tracker row → `JobDrawer` opens for that job

## Dev Notes

### `src/client/lib/router.ts` — Add loader to trackerRoute

```ts
const trackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tracker',
  component: TrackerRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})
```

`fetchJobs` and `queryClient` are already imported — this is the only change to `router.ts`.

**Why add a loader:** Consistent with `indexRoute`; ensures jobs are in cache before `TrackerRoute` renders. Without it, `useJobsQuery()` would show a loading state on first `/tracker` visit.

---

### `src/client/components/tracker/TrackerTable.tsx` — Full Implementation

```tsx
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import type { Job } from '@shared/schemas'

interface TrackerTableProps {
  jobs: Job[]
  onRowClick: (job: Job) => void
  selectedJobId: number | null
}

function formatDate(dateApplied: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateApplied + 'T00:00:00'))
}

export function TrackerTable({ jobs, onRowClick, selectedJobId }: TrackerTableProps) {
  const appliedJobs = jobs.filter((j) => j.applied)

  if (appliedJobs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <p className="text-sm text-zinc-400">
            No applied jobs yet. Mark jobs as applied in the Pipeline view.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
      <div className="overflow-auto flex-1">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800">
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Company</TableHead>
              <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Job Title</TableHead>
              <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Status</TableHead>
              <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Date Applied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appliedJobs.map((job) => (
              <TableRow
                key={job.id}
                onClick={() => onRowClick(job)}
                className={`border-zinc-800 cursor-pointer ${
                  job.id === selectedJobId ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                }`}
              >
                <TableCell className="py-1.5 px-3 text-sm text-zinc-200">{job.company}</TableCell>
                <TableCell className="py-1.5 px-3 text-sm text-zinc-200">{job.jobTitle}</TableCell>
                <TableCell className="py-1.5 px-3 text-sm text-zinc-200">
                  {job.statusOverride ?? job.status ?? '—'}
                </TableCell>
                <TableCell className="py-1.5 px-3 text-sm text-zinc-200">
                  {job.dateApplied ? formatDate(job.dateApplied) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
```

**Key implementation notes:**
- `jobs.filter((j) => j.applied)` — `applied` is `boolean` (not nullable); no `=== true` needed
- Status column: `statusOverride` takes priority over `status`; both can be null → fall through to `'—'`
- `dateApplied + 'T00:00:00'` — **critical**: `dateApplied` is stored as a date-only ISO string (e.g. `"2026-03-27"`); parsing it as-is treats it as UTC midnight, which renders the previous day in negative-offset timezones. Appending `T00:00:00` forces local-time parsing. This exact pattern is already used in `AppliedToggle.tsx:18`.
- No TanStack Table instance needed — 4 fixed columns, no sorting/filtering/visibility in AC

---

### `src/client/routes/tracker.tsx` — Full Replacement

```tsx
import { useState } from 'react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { TrackerTable } from '../components/tracker/TrackerTable'
import { JobDrawer } from '../components/detail/JobDrawer'

export function TrackerRoute() {
  const { data: jobs = [] } = useJobsQuery()
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  return (
    <>
      <div className="p-4">
        <TrackerTable
          jobs={jobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
        />
      </div>
      <JobDrawer
        job={jobs.find((j) => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
      />
    </>
  )
}
```

**Why no `isPending` guard:** The route loader (`queryClient.ensureQueryData`) guarantees jobs are cached before the component renders — `isPending` will always be false on mount. Using `data: jobs = []` default handles the edge case gracefully.

**Why no `useEffect` to clear `selectedJobId`:** Unlike `PipelineRoute` where a sync can remove jobs from the list, `TrackerRoute` only shows applied jobs. A job cannot be un-applied while the drawer is open in this view. The `PipelineRoute` pattern was defensive against sync; not needed here.

---

### New File Structure After This Story

```
src/
  client/
    lib/
      router.ts                        ← MODIFIED (add loader to trackerRoute)
    routes/
      tracker.tsx                      ← MODIFIED (replace placeholder with full implementation)
    components/
      tracker/
        TrackerTable.tsx               ← NEW
```

---

### Critical Anti-Patterns (Do NOT Do)

- ❌ Do NOT add a new query hook or call `fetch('/api/jobs')` directly — use `useJobsQuery()` from `src/client/hooks/useJobsQuery.ts`
- ❌ Do NOT create a new `QueryClient` or use a different query key — `['jobs']` cache is shared
- ❌ Do NOT put `TrackerTable.tsx` in `components/pipeline/` — it belongs in `components/tracker/`
- ❌ Do NOT use `new Date(job.dateApplied)` without appending `'T00:00:00'` — date-only ISO strings parse as UTC and will show the wrong date in local timezones
- ❌ Do NOT import `Job` from anywhere except `@shared/schemas`
- ❌ Do NOT add a column visibility toggle — Tracker has no optional columns
- ❌ Do NOT implement `AgingRow` opacity or Tooltip — those are Story 5.2, not this story
- ❌ Do NOT use `status` as the display value when `statusOverride` is non-null — `statusOverride` always wins

---

### Architecture Compliance Checkpoints

- **No new API endpoint** — Tracker filters client-side from `['jobs']` cache (AC explicit)
- **TanStack Query key** — `useJobsQuery()` uses `['jobs']` — no new key shapes
- **Job type** — imported from `@shared/schemas` only
- **Drawer reuse** — `JobDrawer` from `components/detail/` unchanged; same props interface
- **Component folder** — `components/tracker/` per architecture structure spec
- **Route loader** — `trackerRoute` loader mirrors `indexRoute` pattern for cache consistency

---

### Previous Story Learnings (Carried Forward)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; no unused imports
- **`db.update().returning()` not iterable** — N/A for this story (no DB writes)
- **shadcn/ui files in `components/ui/`** — extend via `className` only; do not edit generated files
- **`dateApplied` timezone fix** — `AppliedToggle.tsx` already established the `+ 'T00:00:00'` pattern; reuse it in `TrackerTable`

---

### References

- Epic 5 story 5.1 AC: `_bmad-output/planning-artifacts/epics/epic-5-tracker-view-monitoring-applied-applications.md`
- Existing placeholder: `job-hunt-dashboard/src/client/routes/tracker.tsx`
- Existing router: `job-hunt-dashboard/src/client/lib/router.ts`
- Table/drawer pattern to mirror: `job-hunt-dashboard/src/client/routes/index.tsx`
- PipelineTable (style reference): `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx`
- Date formatting pattern: `job-hunt-dashboard/src/client/components/detail/AppliedToggle.tsx:18`
- Architecture constraints: `_bmad-output/planning-artifacts/architecture-distillate.md`
- Project rules: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward with no issues.

### Completion Notes List

- Added `loader` to `trackerRoute` in `router.ts` to pre-cache jobs before route renders, matching `indexRoute` pattern
- Created `TrackerTable.tsx` in `components/tracker/` with 4 fixed columns (company, job title, status, date applied), empty state, active row highlight, and `+T00:00:00` timezone fix for `dateApplied` formatting
- Replaced placeholder `TrackerRoute` with full implementation: `useJobsQuery()` for data, `useState` for selected job, `JobDrawer` reused from Epic 4
- All 43 existing tests pass; zero TypeScript errors

### File List

- `job-hunt-dashboard/src/client/lib/router.ts` (modified)
- `job-hunt-dashboard/src/client/routes/tracker.tsx` (modified)
- `job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx` (new)

### Review Findings

- [x] [Review][Defer] `open=true` + `job=null` if selected job disappears mid-session [tracker.tsx:19] — deferred, design decision documented in story notes; same pattern as PipelineRoute; scenario not applicable in this view
- [x] [Review][Defer] Raw enum values (e.g. `phone_screen`) rendered in Status column without formatting [TrackerTable.tsx:63] — deferred, pre-existing across all status-displaying views; not in AC

## Change Log

- 2026-04-04: Story created by SM agent (create-story workflow)
- 2026-04-04: Implementation complete by dev agent (claude-sonnet-4-6) — TrackerTable created, TrackerRoute replaced, router loader added; all ACs satisfied, 43 tests pass
