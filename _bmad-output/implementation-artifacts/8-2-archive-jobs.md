# Story 8.2: Archive Jobs

Status: done

## Story

As a user,
I want to archive jobs I'm no longer interested in,
So that my Pipeline and Tracker views stay focused on active opportunities.

## Acceptance Criteria

1. **Given** the user opens the job drawer for any non-archived job
   **When** they view the drawer
   **Then** an "Archive" button is visible

2. **Given** the user clicks "Archive"
   **When** the PATCH request completes
   **Then** the job's `archived` field is set to `true`, the drawer closes, and the job is no longer visible in the Pipeline or Tracker view

3. **Given** the user switches to the "Archived" tab
   **When** the view renders
   **Then** only archived jobs are shown, using the same Pipeline table layout (no Sync button in the content area, no Tracker switch)

4. **Given** the user opens an archived job's drawer
   **When** they view it
   **Then** an "Unarchive" button is shown instead of "Archive"

5. **Given** the user clicks "Unarchive"
   **When** the PATCH request completes
   **Then** `archived` is set to `false`, the job reappears in Pipeline/Tracker, and disappears from the Archived view

6. **Given** the Sheets sync runs
   **When** a job record is upserted
   **Then** the `archived` field is never overwritten (user-owned field, excluded from ON CONFLICT UPDATE clause)

## Tasks / Subtasks

- [x] Task 1: Add `archived` column to DB schema, generate migration, extend shared Zod schema (AC: 2, 5, 6)
  - [x] Add `archived: integer('archived', { mode: 'boolean' }).notNull().default(false)` to `jobs` table in `src/db/schema.ts` — annotated as user-owned (after `dateApplied`)
  - [x] Run `bun run db:generate` to produce a new migration file in `src/db/migrations/` (will be named `0004_*.sql`)
  - [x] Verify the generated SQL contains `ALTER TABLE jobs ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`
  - [x] Add `archived: z.boolean()` to `jobSchema` in `src/shared/schemas.ts` (not `jobInputSchema` — this is user-owned, not Sheets-sourced)

- [x] Task 2: Extend `PATCH /api/jobs/:id` to accept `archived` + add server tests (AC: 2, 5, 6)
  - [x] In `src/server/routes/api-jobs.ts`: add `archived: z.boolean().optional()` to `jobPatchSchema`
  - [x] In `api-jobs.ts`: update `hasFields` check to include `patch.archived !== undefined`
  - [x] In `api-jobs.ts`: add `if (patch.archived !== undefined) updateFields.archived = patch.archived` in the update block (no side effects like statusEvents — pure boolean toggle)
  - [x] In `src/server/routes/api-jobs.test.ts`: add `archived INTEGER NOT NULL DEFAULT 0` to `CREATE_JOBS_TABLE` DDL constant (both INSERT and SELECT tests use this table)
  - [x] In `api-jobs.test.ts`: add test — `PATCH { archived: true }` returns 200 with `job.archived === true`
  - [x] In `api-jobs.test.ts`: add test — `PATCH { archived: false }` returns 200 with `job.archived === false`
  - [x] In `src/server/routes/api-ingest.test.ts`: add `archived INTEGER NOT NULL DEFAULT 0` to `CREATE_JOBS_TABLE` DDL constant
  - [x] In `api-ingest.test.ts`: add test — archive a job (`UPDATE jobs SET archived=1`), re-ingest same company/jobTitle, verify `archived` is still `1` after upsert
  - [x] Confirm `src/server/services/ingest-service.ts` ON CONFLICT `set` block does NOT contain `archived` (no code change — just verify; `archived` was never Sheets-owned)

- [x] Task 3: Extend `useJobMutation` to support `archived` (AC: 2, 5)
  - [x] In `src/client/hooks/useJobMutation.ts`: add `archived?: boolean` to the `JobPatch` type
  - [x] No other changes needed — the optimistic update already spreads `{ ...j, ...patch }`, so `archived` in the patch will update the cache automatically

- [x] Task 4: Filter archived jobs in Pipeline/Tracker routes; add Archived route + nav (AC: 2, 3, 5)
  - [x] In `src/client/routes/index.tsx`: change `jobs` passed to `PipelineTable` and `JobDrawer` lookup to `(jobs ?? []).filter(j => !j.archived)` — the `useEffect` auto-close already fires when the filtered list no longer contains `selectedJobId`
  - [x] In `src/client/routes/tracker.tsx`: add the auto-close `useEffect` (mirrors `PipelineRoute`); change `jobs` passed to `TrackerTable` to `(jobs ?? []).filter(j => !j.archived)`
  - [x] Create `src/client/routes/archived.tsx` — `ArchivedRoute` component (see spec below)
  - [x] In `src/client/lib/router.ts`: add `/archived` route (same loader pattern as existing routes)
  - [x] In `src/client/components/shared/Layout.tsx`: add "Archived" `<Link to="/archived">` nav link after "Tracker"

- [x] Task 5: Add Archive/Unarchive button to `JobDrawer` (AC: 1, 2, 4, 5)
  - [x] In `src/client/components/detail/JobDrawer.tsx`: import `useJobMutation`
  - [x] Call `useJobMutation(job?.id ?? 0)` and destructure `mutate: patchJob, isPending: isArchiving`
  - [x] Add Archive/Unarchive button at the bottom of the scrollable content area (after the Cover Letter section), with a `<Separator>` above it
  - [x] Button label: `job.archived ? 'Unarchive' : 'Archive'`; disabled when `isArchiving`
  - [x] `onClick`: `patchJob({ id: job.id, patch: { archived: !job.archived } })`
  - [x] Drawer auto-close handled by the `useEffect` in each route (PipelineRoute already has it; ArchivedRoute will have it; TrackerRoute gets it in Task 4)

- [x] Task 6: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass, new tests pass

## Dev Notes

### ArchivedRoute Component Spec

```tsx
// src/client/routes/archived.tsx
import { useState, useEffect } from 'react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { PipelineTable } from '../components/pipeline/PipelineTable'
import { JobDrawer } from '../components/detail/JobDrawer'

export function ArchivedRoute() {
  const { data: jobs = [] } = useJobsQuery()
  const archivedJobs = jobs.filter(j => j.archived)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  useEffect(() => {
    if (selectedJobId !== null && !archivedJobs.find(j => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [archivedJobs, selectedJobId])

  if (archivedJobs.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-center py-16 px-4">
            <p className="text-sm text-zinc-400">No archived jobs.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="p-4">
        <PipelineTable
          jobs={archivedJobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
        />
      </div>
      <JobDrawer
        job={archivedJobs.find(j => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
      />
    </>
  )
}
```

### Router Addition

```ts
// Add to src/client/lib/router.ts after trackerRoute:
import { ArchivedRoute } from '../routes/archived'

const archivedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/archived',
  component: ArchivedRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

// Add archivedRoute to routeTree:
const routeTree = rootRoute.addChildren([indexRoute, trackerRoute, archivedRoute])
```

### Layout Nav Addition

```tsx
// In Layout.tsx nav, after the Tracker link:
<Link
  to="/archived"
  className="px-3 py-1.5 text-sm transition-colors"
  activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
  inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
>
  Archived
</Link>
```

### PipelineRoute Filter

```tsx
// In src/client/routes/index.tsx, change the jobs data usage:
const activeJobs = (jobs ?? []).filter(j => !j.archived)

// Replace all references to `jobs` (the raw query data) with `activeJobs`
// in the if-conditions, PipelineTable, and JobDrawer lookup:
if (jobs && activeJobs.length > 0) {
  return (
    <>
      <div className="p-4">
        <PipelineTable
          jobs={activeJobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
        />
      </div>
      <JobDrawer
        job={activeJobs.find((j) => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
      />
    </>
  )
}
// Keep `if (jobs && jobs.length > 0)` check using raw jobs (non-empty means has data for skeleton/empty decision)
// but pass activeJobs to components — or use: if (jobs && activeJobs.length === 0) show EmptyState
```

Wait — nuance: `EmptyState` shows when there are zero jobs total. Should it show when all jobs are archived? Probably yes — if no active (non-archived) jobs exist, show the sync prompt. Keep the empty state check based on `activeJobs.length === 0` when data is loaded.

Revised PipelineRoute logic:
```tsx
const activeJobs = (jobs ?? []).filter(j => !j.archived)

// After isPending check:
if (jobs !== undefined && activeJobs.length > 0) {
  return ( /* PipelineTable + JobDrawer with activeJobs */ )
}
if (jobs !== undefined && activeJobs.length === 0) {
  return <EmptyState syncMutation={syncMutation} />
}
// isPending case already handled above
```

### TrackerRoute Changes

```tsx
// src/client/routes/tracker.tsx
import { useState, useEffect } from 'react'  // add useEffect
import { useJobsQuery } from '../hooks/useJobsQuery'
import { TrackerTable } from '../components/tracker/TrackerTable'
import { JobDrawer } from '../components/detail/JobDrawer'

export function TrackerRoute() {
  const { data: jobs = [] } = useJobsQuery()
  const activeJobs = jobs.filter(j => !j.archived)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  useEffect(() => {
    if (selectedJobId !== null && !activeJobs.find(j => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [activeJobs, selectedJobId])

  return (
    <>
      <div className="p-4">
        <TrackerTable
          jobs={activeJobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
        />
      </div>
      <JobDrawer
        job={activeJobs.find((j) => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
      />
    </>
  )
}
```

### JobDrawer Archive Button

Add at the very bottom of the scrollable `<div className="flex-1 overflow-y-auto p-4 space-y-4">`, after the existing Cover Letter section:

```tsx
// Add to imports at top of JobDrawer.tsx:
import { useJobMutation } from '../../hooks/useJobMutation'

// Inside JobDrawer function, alongside other hooks:
const { mutate: patchJob, isPending: isArchiving } = useJobMutation(job?.id ?? 0)

// At the bottom of the scrollable content div (after the cover letter block):
{job && (
  <>
    <Separator className="bg-zinc-800" />
    <div>
      <button
        onClick={() => patchJob({ id: job.id, patch: { archived: !job.archived } })}
        disabled={isArchiving}
        className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isArchiving ? (job.archived ? 'Unarchiving…' : 'Archiving…') : (job.archived ? 'Unarchive' : 'Archive')}
      </button>
    </div>
  </>
)}
```

### Schema Changes Detail

**`src/db/schema.ts`** — add after `dateApplied`:
```ts
  // User-owned (NEVER overwritten on sync — protected by ON CONFLICT clause in Story 2.1)
  // ... existing user-owned fields ...
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
```

**`src/shared/schemas.ts`** — `jobSchema` extension:
```ts
export const jobSchema = jobInputSchema.extend({
  id: z.number().int(),
  applied: z.boolean(),
  status: z.string().nullable(),
  statusOverride: z.string().nullable(),
  coverLetterSentAt: z.string().nullable(),
  dateApplied: z.string().nullable(),
  archived: z.boolean(),  // ADD THIS
})
```

### PATCH Handler Extension

```ts
// jobPatchSchema — add archived:
const jobPatchSchema = z.object({
  applied: z.boolean().optional(),
  statusOverride: z.enum(STATUS_OVERRIDE_VALUES).nullable().optional(),
  archived: z.boolean().optional(),  // ADD THIS
})

// hasFields check — add archived:
const hasFields = patch.applied !== undefined || patch.statusOverride !== undefined || patch.archived !== undefined

// In updateFields block — add:
if (patch.archived !== undefined) updateFields.archived = patch.archived
// No statusEvents insertion for archive — it's a pure boolean toggle, not a status event
```

### Ingest Preservation Test Pattern

```ts
// In api-ingest.test.ts:
test('ingest does not overwrite archived field on upsert conflict', async () => {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, applied, archived) VALUES ('Acme', 'Engineer', 0, 1)`
  )
  const payload: JobInput[] = [{ company: 'Acme', jobTitle: 'Engineer', fitScore: 80, recommendation: 'apply', roleFit: null, requirementsMet: null, requirementsMissed: null, redFlags: null, jobDescription: null, sourceUrl: null, dateScraped: null }]
  const res = await ingestApp.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  expect(res.status).toBe(200)
  const row = prodSqlite.query('SELECT archived FROM jobs WHERE company = ?').get('Acme') as { archived: number }
  expect(row.archived).toBe(1)  // preserved — not overwritten
})
```

### What Already Exists — Do NOT Re-Implement

- **`useJobMutation` optimistic update** — already spreads `{ ...j, ...patch }` into the cache; just add `archived` to `JobPatch` type
- **PipelineRoute `useEffect` auto-close** — already implemented in `src/client/routes/index.tsx`; no changes needed to the effect itself, only to what `jobs` is filtered before being passed to components
- **Column visibility `localStorage` key** — Archived view reuses `PipelineTable` which shares the same `"job-hunt-column-visibility"` key; no new storage needed
- **`ingest-service.ts` ON CONFLICT** — `archived` is NOT in the `set` block and never was; confirm but do NOT add it

### File Locations

```
src/db/schema.ts                                    ← MODIFIED (add archived column)
src/db/migrations/0004_*.sql                        ← NEW (generated by drizzle-kit)
src/shared/schemas.ts                               ← MODIFIED (add archived to jobSchema)
src/server/routes/api-jobs.ts                       ← MODIFIED (PATCH allowlist + handler)
src/server/routes/api-jobs.test.ts                  ← MODIFIED (DDL + new tests)
src/server/routes/api-ingest.test.ts                ← MODIFIED (DDL + ingest preservation test)
src/client/hooks/useJobMutation.ts                  ← MODIFIED (JobPatch type)
src/client/routes/index.tsx                         ← MODIFIED (filter archived)
src/client/routes/tracker.tsx                       ← MODIFIED (filter archived + useEffect)
src/client/routes/archived.tsx                      ← NEW
src/client/lib/router.ts                            ← MODIFIED (add /archived route)
src/client/components/shared/Layout.tsx             ← MODIFIED (add Archived nav link)
src/client/components/detail/JobDrawer.tsx          ← MODIFIED (archive/unarchive button)
```

### Data Ownership — `archived` is User-Owned

Per the architecture's data ownership invariant:
- `archived` is **user-owned** — never overwritten by Sheets sync
- It belongs in `schema.ts` after `dateApplied` in the user-owned block
- It is NOT in `jobInputSchema` (Sheets-sourced)
- It IS in `jobSchema` (full record returned by GET /api/jobs)
- `PATCH /api/jobs/:id` allowlist MUST include it
- `ingestJobs` ON CONFLICT `set` MUST NOT include it (verify: it won't be there since it's not in `jobInputSchema`)

### Migration Note

After modifying `schema.ts`, run:
```
/home/zac/.bun/bin/bun run db:generate
```
This produces `src/db/migrations/0004_*.sql`. Verify it contains:
```sql
ALTER TABLE jobs ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
```
Commit this file. The migration runner at `bun start` will apply it automatically (idempotent).

### Previous Story Learnings (from 8.1)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for ALL CLI commands
- **TypeScript strict mode** — `noUnusedLocals` is active; any imported symbol not used is a compile error
- **`OPTIONAL_COLUMNS` in `ColumnVisibilityToggle.tsx` duplicates column IDs** — known tech debt; no abstraction needed
- **Test DDL must be updated manually** — `CREATE_JOBS_TABLE` in test files is handwritten SQL, not auto-derived from schema.ts; when adding columns to schema.ts, also update the DDL strings in `api-jobs.test.ts` and `api-ingest.test.ts`
- **Test count baseline**: 83 passing tests; this story adds server tests (expect ~87–88 after)

### Architecture Compliance

- `archived` accessed via `src/shared/schemas.ts` `Job` type — no inline type redefinition ✓
- PATCH route follows existing pattern: validate ID → parse body → check job exists → update → return updated job ✓
- Optimistic update uses `['jobs']` cache only ✓
- No direct `fetch` in components — `useJobMutation` hook used ✓
- No new query keys beyond `['jobs']` ✓
- Error response shape `{ error: string }` preserved ✓
- Drizzle casing config handles snake_case ↔ camelCase (`archived` → `archived`, no alias needed) ✓

## Dev Agent Record

### Implementation Plan

1. Added `archived` boolean column (user-owned) to Drizzle schema and generated migration `0004_parched_sumo.sql`
2. Extended `jobSchema` Zod type with `archived: z.boolean()`
3. Extended PATCH handler with `archived` in allowlist and update block (no statusEvents side effect — pure toggle)
4. Updated all 4 test file DDLs to include `archived INTEGER NOT NULL DEFAULT 0`; added 3 new server tests
5. Added `archived?: boolean` to `JobPatch` type — optimistic update spreads it automatically
6. Filtered archived jobs from Pipeline and Tracker routes; added auto-close `useEffect` to TrackerRoute
7. Created `ArchivedRoute` + `/archived` router entry + "Archived" nav link in Layout
8. Added Archive/Unarchive button to `JobDrawer` bottom using `useJobMutation`

### Completion Notes

All 6 tasks completed. 86 tests pass (83 baseline + 3 new: PATCH archived true, PATCH archived false, ingest preservation). Zero TypeScript errors. Key implementation notes:
- Migration generated as `0004_parched_sumo.sql` — uses `integer DEFAULT false NOT NULL` (SQLite equivalent of DEFAULT 0)
- Test DDL cross-file contamination: all 4 test files sharing `prodSqlite` needed `archived` column; fixed `imap-poller.test.ts` and `api-cover-letter.test.ts` as well
- `archived` confirmed NOT in `ingest-service.ts` ON CONFLICT set block — data ownership invariant preserved
- `useEffect` auto-close added to TrackerRoute (was missing before this story)
- PipelineRoute logic updated: filter `activeJobs`, check `jobs !== undefined && activeJobs.length > 0` (all-archived case shows EmptyState)

### File List

- `src/db/schema.ts` (modified — added `archived` column)
- `src/db/migrations/0004_parched_sumo.sql` (new — generated migration)
- `src/shared/schemas.ts` (modified — added `archived: z.boolean()` to `jobSchema`)
- `src/server/routes/api-jobs.ts` (modified — PATCH allowlist + handler)
- `src/server/routes/api-jobs.test.ts` (modified — DDL + 2 new PATCH tests)
- `src/server/routes/api-ingest.test.ts` (modified — DDL + ingest preservation test)
- `src/server/routes/api-cover-letter.test.ts` (modified — DDL updated)
- `src/server/services/imap-poller.test.ts` (modified — DDL updated)
- `src/client/hooks/useJobMutation.ts` (modified — `archived?: boolean` in `JobPatch`)
- `src/client/routes/index.tsx` (modified — filter archived, revised empty state logic)
- `src/client/routes/tracker.tsx` (modified — filter archived + auto-close useEffect)
- `src/client/routes/archived.tsx` (new — `ArchivedRoute` component)
- `src/client/lib/router.ts` (modified — added `/archived` route)
- `src/client/components/shared/Layout.tsx` (modified — "Archived" nav link)
- `src/client/components/detail/JobDrawer.tsx` (modified — Archive/Unarchive button)

### Change Log

- 2026-04-07: Story created by SM agent
- 2026-04-07: Story implemented by dev agent — all ACs satisfied, 86 tests passing
- 2026-04-07: Code review completed — 0 patch, 5 deferred, 9 dismissed

### Review Findings

- [x] [Review][Defer] useEffect uses inline-computed filtered array as dependency — `activeJobs`/`archivedJobs` is recreated on every render, causing the auto-close effect to run every render cycle rather than only when jobs data changes. Not a correctness bug (setSelectedJobId is only called when the job is genuinely absent), but a code quality concern; useMemo would be cleaner. [archived.tsx, tracker.tsx, index.tsx] — deferred, minor code quality
- [x] [Review][Defer] No success feedback when job disappears after archive/unarchive — job silently vanishes from view with no toast or notification [JobDrawer.tsx] — deferred, UX enhancement out of scope for this story
- [x] [Review][Defer] ArchivedRoute shows "No archived jobs." during initial data load — `useJobsQuery` defaults to `[]`, so the empty state briefly renders on cold cache before route loader resolves [archived.tsx] — deferred, route loader mitigates in practice; spec does not require a skeleton
- [x] [Review][Defer] Ingest preservation test queries by company name only — `WHERE company = 'Acme'` could return an arbitrary row if multiple Acme rows existed; should query `WHERE company = ? AND job_title = ?` [api-ingest.test.ts:333] — deferred, per-test DB isolation makes this safe in practice
- [x] [Review][Defer] Mutation error is silently lost when drawer auto-closes — optimistic update triggers auto-close before PATCH response arrives; if the request fails after close, no error is surfaced to the user [useJobMutation.ts] — deferred, pre-existing limitation of the optimistic-update pattern across all mutations
