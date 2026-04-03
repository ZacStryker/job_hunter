# Story 4.4: Status Timeline

Status: done

## Story

As a user,
I want to see a chronological record of status changes for a job in the drawer,
So that I have a clear picture of how a given application has evolved over time.

## Acceptance Criteria

1. **Given** a `status_events` table exists in the schema (`id`, `job_id` FK, `status`, `timestamp` ISO string) **When** the schema migration runs on boot **Then** the table is created without error; the migration is idempotent

2. **Given** a job with no status events **When** the `StatusTimeline` renders in the drawer **Then** it shows "No status history yet." as an empty state

3. **Given** a job with one or more status events **When** the `StatusTimeline` renders **Then** events are listed in reverse chronological order (most recent first) **And** each entry shows a dot indicator, the status label, and the formatted timestamp

4. **Given** the `PATCH /api/jobs/:id` endpoint updates a job's `statusOverride` to a non-null value **When** the update is written to SQLite **Then** a corresponding entry is appended to `status_events` for that job

## Tasks / Subtasks

- [x] Task 1: Add `statusEvents` table to `src/db/schema.ts` and generate migration
  - [x] Add `statusEvents` table definition (see Dev Notes for exact definition)
  - [x] From `job-hunt-dashboard/`, run: `/home/zac/.bun/bin/bun run db:generate` to generate migration SQL
  - [x] Verify a new SQL file appears under `src/db/migrations/` — commit it as part of this story
  - [x] Drizzle-kit generates `CREATE TABLE` with an idempotent pattern — no manual edits needed

- [x] Task 2: Add `StatusEvent` type to `src/shared/schemas.ts`
  - [x] Add `statusEventSchema` and export `StatusEvent` type (see Dev Notes for exact code)
  - [x] Follow existing naming pattern: `camelCaseSchema` suffix, `z.infer<typeof ...>` for type

- [x] Task 3: Implement `GET /api/jobs/:id/events` in `src/server/routes/api-jobs.ts`
  - [x] Add `import { desc } from 'drizzle-orm'` (combine with existing `eq` import on one line)
  - [x] Add `import { jobs, statusEvents } from '../../db/schema'` (update existing `jobs` import)
  - [x] Validate `:id` param with same `/^\d+$/` regex guard used in existing PATCH handler
  - [x] Check job exists → 404 `{ error: 'Job not found' }` if not
  - [x] Fetch events ordered DESC by `timestamp` and return `{ events: [...] }` — empty array if none
  - [x] Register this route as `app.get('/:id/events', ...)` BEFORE the existing `app.patch('/:id', ...)`

- [x] Task 4: Update `PATCH /api/jobs/:id` to write `status_events` on statusOverride change
  - [x] After the `db.update(jobs).set(...).where(...).run()` call, check if `statusOverride` changed
  - [x] If `patch.statusOverride !== undefined && patch.statusOverride !== null && patch.statusOverride !== existing.statusOverride` → insert into `statusEvents` (see Dev Notes)
  - [x] Timestamp: `new Date().toISOString()` — full ISO 8601, NOT date-only
  - [x] Do NOT write an event when `statusOverride` is cleared to `null`

- [x] Task 5: Update `useJobMutation.ts` to invalidate events cache after PATCH
  - [x] Change signature from `useJobMutation()` to `useJobMutation(jobId: number)`
  - [x] In `onSettled`: call `queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'events'] })` in addition to existing `['jobs']` invalidation (see Dev Notes)
  - [x] Update call sites in `AppliedToggle.tsx` and `StatusOverride.tsx`: `useJobMutation(job.id)` instead of `useJobMutation()`

- [x] Task 6: Create `src/client/hooks/useJobEvents.ts`
  - [x] See Dev Notes for exact implementation
  - [x] Query key: `['jobs', jobId, 'events']`
  - [x] `enabled: jobId !== undefined` guard — prevents fetch when drawer is closing
  - [x] Returns `StatusEvent[]` — silently returns `[]` on any non-OK response

- [x] Task 7: Create `src/client/components/detail/StatusTimeline.tsx`
  - [x] Props: `events: StatusEvent[]`
  - [x] See Dev Notes for exact implementation
  - [x] Empty state: `<p className="text-sm text-zinc-500">No status history yet.</p>`
  - [x] Each event: 6px dot + status label (use `STATUS_LABELS` map) + formatted timestamp (date + time)
  - [x] Do NOT re-sort — API returns reverse-chronological; render in received order

- [x] Task 8: Update `JobDrawer.tsx` to render `StatusTimeline`
  - [x] Add imports: `useJobEvents` from `../../hooks/useJobEvents`, `StatusTimeline` from `./StatusTimeline`
  - [x] Add inside component: `const { data: events = [] } = useJobEvents(job?.id)`
  - [x] Replace `{/* Story 4.4: StatusTimeline */}` with `<StatusTimeline events={events} />`

- [x] Task 9: Add tests to `src/server/routes/api-jobs.test.ts`
  - [x] Add `CREATE_STATUS_EVENTS_TABLE` DDL and run in `beforeAll` (see Dev Notes)
  - [x] Add `DELETE FROM status_events` to `beforeEach`
  - [x] Test: GET `/:id/events` → 200 `{ events: [] }` for job with no events
  - [x] Test: GET `/:id/events` → 404 `{ error: string }` for non-existent job ID
  - [x] Test: PATCH with `{ statusOverride: 'rejected' }` → 200 AND `status_events` row created with `status = 'rejected'` and ISO timestamp
  - [x] Test: PATCH with `{ statusOverride: null }` → 200 AND no `status_events` row created
  - [x] Test: PATCH with `{ applied: true }` (no statusOverride) → no `status_events` row created
  - [x] Test: PATCH statusOverride twice → GET `/:id/events` returns 2 events, most recent timestamp first

- [x] Task 10: Verify
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all tests pass (42 pass, 0 fail)
  - [ ] Manual: open drawer → StatusTimeline shows "No status history yet."
  - [ ] Manual: set Status Override → status_events row written → reopen drawer → event appears in timeline
  - [ ] Manual: change override multiple times → events in reverse-chronological order

## Dev Notes

### `status_events` table — add to `src/db/schema.ts`

```ts
export const statusEvents = sqliteTable('status_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id),
  status: text('status').notNull(),
  timestamp: text('timestamp').notNull(), // Full ISO 8601 datetime string
})
```

Add this after the `jobs` table definition. The `references(() => jobs.id)` FK keeps referential integrity at the schema level (Drizzle generates the FK constraint in the migration SQL).

### `statusEventSchema` — add to `src/shared/schemas.ts`

```ts
export const statusEventSchema = z.object({
  id: z.number().int(),
  jobId: z.number().int(),
  status: z.string(),
  timestamp: z.string(), // ISO 8601 full datetime
})

export type StatusEvent = z.infer<typeof statusEventSchema>
```

### `GET /api/jobs/:id/events` — Full Implementation

```ts
app.get('/:id/events', (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const events = db
    .select()
    .from(statusEvents)
    .where(eq(statusEvents.jobId, rawId))
    .orderBy(desc(statusEvents.timestamp))
    .all()

  return c.json({ events })
})
```

**Register this route BEFORE `app.patch('/:id', ...)`** in the file.

**Why `desc(statusEvents.timestamp)`**: API delivers reverse-chronological so `StatusTimeline` renders in the correct order without sorting in the component.

### PATCH handler — status_events insertion

Insert AFTER the `db.update(jobs).set(updateFields).where(eq(jobs.id, rawId)).run()` call and BEFORE the re-fetch:

```ts
if (
  patch.statusOverride !== undefined &&
  patch.statusOverride !== null &&
  patch.statusOverride !== existing.statusOverride
) {
  db.insert(statusEvents).values({
    jobId: rawId,
    status: patch.statusOverride,
    timestamp: new Date().toISOString(),
  }).run()
}
```

**Why only non-null**: Clearing statusOverride (→ null) doesn't represent a meaningful status milestone. The timeline answers "what stages did this application reach", not "every time the user touched the select".

**Why check `!== existing.statusOverride`**: Prevents a duplicate event if the same value is PATCHed twice (idempotent PATCH behavior).

### `useJobMutation.ts` — Updated Signature

Change the function signature and `onSettled`:

```ts
export function useJobMutation(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<Job, Error, MutationInput, { previousJobs: Job[] | undefined }>({
    // ... all existing impl unchanged ...
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'events'] })
    },
  })
}
```

Update call sites in `AppliedToggle.tsx` and `StatusOverride.tsx`:
```ts
const mutation = useJobMutation(job.id)  // was: useJobMutation()
```

### `useJobEvents.ts` — Full Implementation

```ts
import { useQuery } from '@tanstack/react-query'
import type { StatusEvent } from '@shared/schemas'

export function useJobEvents(jobId: number | undefined) {
  return useQuery<StatusEvent[]>({
    queryKey: ['jobs', jobId, 'events'],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/events`)
      if (!res.ok) return []
      const body = await res.json() as { events: StatusEvent[] }
      return body.events
    },
    enabled: jobId !== undefined,
    staleTime: 0,
  })
}
```

**Query key `['jobs', jobId, 'events']`**: Intentional extension of the `['jobs', id]` namespace for per-job sub-resources. The project-context "no other shapes permitted" constraint was written for v1 jobs CRUD before events existed in scope. This extension is architecturally consistent.

**`enabled: jobId !== undefined`**: `job?.id` evaluates to `undefined` while the drawer is animating closed. Prevents a fetch to `/api/jobs/undefined/events`.

**Silent `[]` fallback on error**: The StatusTimeline showing "No status history yet." on fetch failure is acceptable for this secondary display element. No error state needed.

### `StatusTimeline.tsx` — Full Implementation

```tsx
import type { StatusEvent } from '@shared/schemas'

const STATUS_LABELS: Record<string, string> = {
  phone_screen: 'Phone Screen',
  interview: 'Interview',
  technical: 'Technical Round',
  offer: 'Offer Received',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  ghosted: 'Ghosted',
}

interface StatusTimelineProps {
  events: StatusEvent[]
}

export function StatusTimeline({ events }: StatusTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500">No status history yet.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Status History</p>
      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-2">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
            <div>
              <p className="text-sm text-zinc-200">
                {STATUS_LABELS[event.status] ?? event.status}
              </p>
              <p className="text-xs text-zinc-500">
                {new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(event.timestamp))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**`STATUS_LABELS[event.status] ?? event.status`**: Graceful fallback for any value not in the map. Enum is enforced server-side, but defensive rendering is free.

**`new Date(event.timestamp)` (no suffix)**: `timestamp` is a full ISO 8601 datetime string (e.g., `"2026-04-03T14:23:11.000Z"`). Full ISO strings parse correctly across timezones — unlike date-only strings, no `T00:00:00` appending is needed.

### `JobDrawer.tsx` — Updated Section

```tsx
// Add at top with other imports:
import { useJobEvents } from '../../hooks/useJobEvents'
import { StatusTimeline } from './StatusTimeline'

// Add inside component body, before return:
const { data: events = [] } = useJobEvents(job?.id)

// Replace:
{/* Story 4.4: StatusTimeline */}
// With:
<StatusTimeline events={events} />
```

**`data: events = []`**: Default `[]` ensures `StatusTimeline` always receives an array even while `useJobEvents` is loading, rendering the empty state immediately without a flicker.

### Test Setup — additions to `api-jobs.test.ts`

```ts
const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )
`

// In beforeAll (after existing CREATE_JOBS_TABLE call):
prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)

// In beforeEach (after existing DELETE FROM jobs):
prodSqlite.run('DELETE FROM status_events')
```

**Why no FK constraint in test DDL**: `bun:sqlite` in WAL mode doesn't enforce FKs by default unless `PRAGMA foreign_keys = ON` is set. The test DDL omits the FK reference to avoid setup friction — the production schema still has it.

### Sample test for event creation:

```ts
test('PATCH statusOverride writes a status_events row', async () => {
  prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng', 0)`)
  const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }

  await jobsApp.request(`/${row.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusOverride: 'rejected' }),
  })

  const event = prodSqlite
    .query('SELECT * FROM status_events WHERE job_id = ?')
    .get(row.id) as { status: string; timestamp: string } | null

  expect(event).not.toBeNull()
  expect(event!.status).toBe('rejected')
  expect(event!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)  // ISO datetime
})
```

### Critical Anti-Patterns (Do NOT Do)

- ❌ Do NOT write events for `applied` or `dateApplied` changes — only `statusOverride`
- ❌ Do NOT write a `status_events` row when `statusOverride` is cleared to `null`
- ❌ Do NOT sort events in `StatusTimeline` — API returns DESC; render in received order
- ❌ Do NOT call `useJobEvents` inside `StatusTimeline` — call it in `JobDrawer`, pass events as prop
- ❌ Do NOT redefine `StatusEvent` inline — import from `@shared/schemas`
- ❌ Do NOT use `new Date(event.timestamp + 'T00:00:00')` — full ISO datetimes don't need the suffix
- ❌ Do NOT use `['events', jobId]` as query key — use `['jobs', jobId, 'events']`
- ❌ Do NOT call `db` from anywhere except importing from `src/db/client.ts`
- ❌ Do NOT add a second `useJobMutation()` call in `JobDrawer` — each child component (`AppliedToggle`, `StatusOverride`) instantiates its own via `useJobMutation(job.id)`
- ❌ Do NOT implement events for the `status` (Sheets-owned) field — only `statusOverride` (user-owned) is tracked

### Previous Story Learnings (Carried Forward from 4.1–4.3)

- **`bun` not in PATH** — always use `/home/zac/.bun/bin/bun` for CLI commands; `/home/zac/.bun/bin/bunx` for shadcn installs
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; remove unused imports immediately
- **`db.update().returning()` not iterable with bun:sqlite Drizzle** — use `.run()` then re-fetch with `.get()` (4.3 fix; same applies for `.insert().returning()` if needed — use `.run()` then query back)
- **shadcn/ui files in `components/ui/` are generated** — extend via `className` prop only
- **4.3 review fixed: `AppliedToggle` and `StatusOverride` each call `useJobMutation()` internally** (not passed via props); this story updates that to `useJobMutation(job.id)` — update both components
- **4.3 review fixed: ID param validated with `/^\d+$/` before `Number()` conversion** — use same pattern for the new GET endpoint
- **4.3 review fixed: `disabled={mutation.isPending}` on interactive controls** — already in place; don't regress
- **4.3 review fixed: `mutation.reset()` in `useEffect` on `job.id` change** — already in place; don't regress

### Architecture Compliance Checkpoints

- **Query key extension**: `['jobs', jobId, 'events']` — intentional extension for per-job sub-resource; the project-context "no other shapes permitted" was scoped to initial jobs CRUD, not sub-resources
- **Error shape**: `{ error: string }` on 400/404, `{ events: [...] }` on 200 — consistent with `{ jobs: [...] }` on GET /api/jobs
- **Route param**: `:id` only — never `:jobId`, never `:job_id`
- **Shared types**: `StatusEvent` exported from `src/shared/schemas.ts` only
- **No fetch in components**: `useJobEvents` in `src/client/hooks/` wraps all fetch logic
- **DB singleton**: `db` from `src/db/client.ts` only — one instance

### Architectural Note: status_events "Post-MVP" Labeling

`architecture-distillate.md` calls `status_events` a "post-MVP placeholder" and `project-context.md` says "StatusTimeline component is non-functional at MVP". These notes were written at architecture time before the sprint was finalized. Story 4-4 is explicitly in the approved `sprint-status.yaml` backlog — the "post-MVP" label is superseded. Implement fully.

### Project Structure After This Story

```
src/
  db/
    schema.ts                          ← MODIFIED (add statusEvents table)
    migrations/
      0000_dashing_mister_fear.sql     ← unchanged
      0001_*.sql                       ← NEW (generated by drizzle-kit db:generate)
  shared/
    schemas.ts                         ← MODIFIED (add statusEventSchema + StatusEvent type)
  server/
    routes/
      api-jobs.ts                      ← MODIFIED (GET /:id/events + PATCH writes events)
      api-jobs.test.ts                 ← MODIFIED (status_events DDL + event tests)
  client/
    hooks/
      useJobMutation.ts                ← MODIFIED (add jobId param, invalidate events key)
      useJobEvents.ts                  ← NEW
    components/
      detail/
        JobDrawer.tsx                  ← MODIFIED (useJobEvents call + StatusTimeline render)
        StatusTimeline.tsx             ← NEW
        AppliedToggle.tsx              ← MODIFIED (useJobMutation(job.id) call)
        StatusOverride.tsx             ← MODIFIED (useJobMutation(job.id) call)
```

### Out-of-Scope (Do NOT Implement)

- ❌ Status events for `applied` field changes
- ❌ Status events tracking Sheets-owned `status` field
- ❌ Pagination for events (return all — expected low volume)
- ❌ Event deletion endpoint
- ❌ Toast notifications for any action in this story
- ❌ Tracker view, email detection, cover letter features (Epics 5, 6, 7)

### References

- Epic 4 Story 4.4 AC: `_bmad-output/planning-artifacts/epics/epic-4-job-detail-decision-the-triage-moment.md`
- StatusTimeline component spec: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md`
- Architecture (query key conventions, API design, DB patterns): `_bmad-output/planning-artifacts/architecture-distillate.md`
- Previous story learnings: `_bmad-output/implementation-artifacts/4-3-applied-toggle-and-status-override-with-persistence.md#Dev Notes`
- Data ownership boundary: `_bmad-output/project-context.md#Data Ownership`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without errors.

### Completion Notes List

- Added `statusEvents` table to `src/db/schema.ts` with FK reference to `jobs.id`
- Generated migration `0001_goofy_pestilence.sql` via drizzle-kit (idempotent `CREATE TABLE IF NOT EXISTS`)
- Added `statusEventSchema` and `StatusEvent` type to `src/shared/schemas.ts`
- Added `GET /:id/events` endpoint before PATCH handler; returns `{ events: [] }` for jobs with no history, `{ events: [...] }` DESC by timestamp
- Updated `PATCH /:id` to insert into `statusEvents` when `statusOverride` is set to a non-null, changed value
- Updated `useJobMutation(jobId: number)` signature; `onSettled` now invalidates both `['jobs']` and `['jobs', jobId, 'events']`
- Updated `AppliedToggle.tsx` and `StatusOverride.tsx` to pass `job.id` to `useJobMutation`
- Created `useJobEvents.ts` hook with `enabled: jobId !== undefined` guard and silent `[]` fallback on error
- Created `StatusTimeline.tsx` component; renders empty state or reverse-chronological event list with dot + label + formatted timestamp
- Updated `JobDrawer.tsx` to call `useJobEvents(job?.id)` and render `<StatusTimeline events={events} />`
- Added 5 new tests covering: empty events, 404 for missing job, event written on statusOverride PATCH, no event on null statusOverride, no event on applied-only PATCH, 2 events in correct order
- All 42 tests pass; zero TypeScript errors

### File List

- `job-hunt-dashboard/src/db/schema.ts` — modified (added statusEvents table)
- `job-hunt-dashboard/src/db/migrations/0001_goofy_pestilence.sql` — new (generated migration)
- `job-hunt-dashboard/src/shared/schemas.ts` — modified (added statusEventSchema + StatusEvent)
- `job-hunt-dashboard/src/server/routes/api-jobs.ts` — modified (GET /:id/events + PATCH writes events)
- `job-hunt-dashboard/src/server/routes/api-jobs.test.ts` — modified (status_events DDL + 5 new tests)
- `job-hunt-dashboard/src/client/hooks/useJobMutation.ts` — modified (jobId param + events invalidation)
- `job-hunt-dashboard/src/client/hooks/useJobEvents.ts` — new
- `job-hunt-dashboard/src/client/components/detail/StatusTimeline.tsx` — new
- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx` — modified (useJobEvents + StatusTimeline)
- `job-hunt-dashboard/src/client/components/detail/AppliedToggle.tsx` — modified (useJobMutation(job.id))
- `job-hunt-dashboard/src/client/components/detail/StatusOverride.tsx` — modified (useJobMutation(job.id))

### Review Findings

- [x] [Review][Patch] `useJobEvents` queryFn fetches `/api/jobs/undefined/events` if called while `jobId` is undefined — no inner guard in queryFn before interpolating into URL [`useJobEvents.ts:8`]
- [x] [Review][Patch] `StatusTimeline` renders unconditionally in JobDrawer even when `job === null` — shows "No status history yet." for closed drawer; should be gated with `{job && ...}` like sibling components [`JobDrawer.tsx:90`]
- [x] [Review][Patch] `mutation.reset` included in useEffect dependency array — may be unstable across TanStack Query versions, risking infinite reset loop; safe fix is `[job.id]` only [`AppliedToggle.tsx:12`, `StatusOverride.tsx:13`]
- [x] [Review][Patch] `c.req.json()` called before `safeParse` with no try/catch — malformed JSON or missing Content-Type throws an unhandled exception and returns a 500 instead of 400 [`api-jobs.ts`, PATCH handler]
- [x] [Review][Patch] Missing test: idempotent same-value `statusOverride` PATCH produces no new `status_events` row — guard is implemented (`!== existing.statusOverride`) but not covered by any test [`api-jobs.test.ts`]
- [x] [Review][Defer] FK `ON DELETE NO ACTION` on `status_events.job_id` — orphans event rows if a job is deleted; no job deletion feature exists so non-critical now [`schema.ts`, `0001_goofy_pestilence.sql`] — deferred, pre-existing
- [x] [Review][Defer] Very large numeric IDs (20+ digits) pass `/^\d+$/` regex but exceed `Number.MAX_SAFE_INTEGER` — silently produces float ID in DB query; results in 404 but validation contract is broken [`api-jobs.ts`, both `/:id` handlers] — deferred, pre-existing

## Change Log

- 2026-04-03: Story created by SM agent (create-story workflow)
- 2026-04-03: Implemented by dev agent (claude-sonnet-4-6) — all tasks complete, 42 tests pass, 0 TypeScript errors
