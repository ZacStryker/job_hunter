# Story 4.5: Unified Status Dropdown with Applied State

Status: done

## Story

As a user,
I want a single "Status" dropdown in the job drawer that includes "Applied" as an option,
So that managing application state feels unified and "Thank you for applying" emails are automatically detected as status confirmations.

## Acceptance Criteria

1. **Given** a job drawer is open **When** the user views the decision section **Then** a single "Status" dropdown replaces the separate Applied toggle and Status Override select **And** the dropdown label reads "Status" (not "Status Override")

2. **Given** the Status dropdown **When** rendered **Then** options are in this order: No Status, Applied, Phone Screen, Interview, Technical Round, Offer Received, Rejected, Withdrawn, Ghosted

3. **Given** a job where `applied = false` and `statusOverride` is null **When** the dropdown renders **Then** "No Status" is the displayed value

4. **Given** a job where `applied = true` and `statusOverride` is null **When** the dropdown renders **Then** "Applied" is the displayed value (regardless of `job.status`)

5. **Given** a job where `statusOverride` is set **When** the dropdown renders **Then** the `statusOverride` value is displayed (overrides the applied state for display)

6. **Given** the user selects "Applied" from the dropdown **When** the mutation fires **Then** `PATCH /api/jobs/:id` sends `{ applied: true, statusOverride: null }` **And** the job appears in the Tracker view **And** `dateApplied` is auto-set server-side if not already set

7. **Given** the user selects "No Status" from the dropdown **When** the mutation fires **Then** `PATCH /api/jobs/:id` sends `{ applied: false, statusOverride: null }` **And** the job is removed from the Tracker view **And** `dateApplied` is cleared server-side

8. **Given** the user selects any option other than "Applied" or "No Status" **When** the mutation fires **Then** `PATCH /api/jobs/:id` sends `{ applied: true, statusOverride: <value> }` **And** the job appears in the Tracker view

9. **Given** the Tracker view **When** a job has `applied = true` but `statusOverride` is null and `status` is null **Then** the Status column shows "Applied" (not "—")

10. **Given** an email matching "thank you for applying" / "application received" patterns arrives **When** the IMAP poller processes it **Then** `jobs.status` is set to `'Applied'` for the matched job **And** a `status_events` entry is inserted with `source: 'email'` and `status: 'Applied'`

## Tasks / Subtasks

- [x] Task 1: Create `src/client/components/detail/StatusDropdown.tsx` (AC: 1–8)
  - [x] Replace `AppliedToggle` and `StatusOverride` with a single component
  - [x] See Dev Notes for full implementation

- [x] Task 2: Update `JobDrawer.tsx` (AC: 1)
  - [x] Remove imports for `AppliedToggle` and `StatusOverride`
  - [x] Add import for `StatusDropdown`
  - [x] Replace `{job && <AppliedToggle job={job} />}` and `{job && <StatusOverride job={job} />}` with `{job && <StatusDropdown job={job} />}`

- [x] Task 3: Delete old components
  - [x] Delete `src/client/components/detail/AppliedToggle.tsx`
  - [x] Delete `src/client/components/detail/StatusOverride.tsx`
  - [x] Run `bun run --bun tsc --noEmit` to verify no remaining references

- [x] Task 4: Update `TrackerTable.tsx` to show "Applied" when no status override or email status (AC: 9)
  - [x] In `TrackerTable.tsx`, change the Status cell from `job.statusOverride ?? job.status ?? '—'` to `job.statusOverride ?? job.status ?? (job.applied ? 'Applied' : '—')`

- [x] Task 5: Add "Applied" detection pattern to `imap-poller.ts` (AC: 10)
  - [x] Add new entry to `STATUS_PATTERNS` array — see Dev Notes for exact pattern
  - [x] No change to the DB write logic — the existing transaction correctly sets `jobs.status = detectedStatus` and inserts a `status_events` row

- [x] Task 6: Update `imap-poller.test.ts` (AC: 10)
  - [x] Add unit test: `detectStatus` returns `'Applied'` for "Thank you for applying" text
  - [x] Add integration test: "thank you for applying" email matched to a job → `jobs.status = 'Applied'`, status_event inserted with `source: 'email'`

- [x] Task 7: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass + new tests pass
  - [ ] Manual: open drawer → single Status dropdown visible with correct options
  - [ ] Manual: select "Applied" → job appears in Tracker, dateApplied set
  - [ ] Manual: select "No Status" → job removed from Tracker
  - [ ] Manual: select "Interview" → statusOverride set, Tracker shows "interview"

## Dev Notes

### Design Decision: No API Changes Required

The unified dropdown maps to existing PATCH fields. The server never needs to know about the "unified" concept:
- "No Status" → `PATCH { applied: false, statusOverride: null }`
- "Applied" → `PATCH { applied: true, statusOverride: null }`
- Any other value → `PATCH { applied: true, statusOverride: value }`

The current `jobPatchSchema` in `api-jobs.ts` already accepts both `applied` and `statusOverride` in one request — no API changes needed.

### `StatusDropdown.tsx` — Full Implementation

```tsx
import { useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import type { Job } from '@shared/schemas'
import { useJobMutation } from '../../hooks/useJobMutation'

const NO_STATUS = '__none__'
const APPLIED = 'Applied'

const STATUS_OPTIONS = [
  { value: NO_STATUS, label: 'No Status' },
  { value: APPLIED, label: 'Applied' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'technical', label: 'Technical Round' },
  { value: 'offer', label: 'Offer Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'ghosted', label: 'Ghosted' },
]

interface StatusDropdownProps {
  job: Job
}

export function StatusDropdown({ job }: StatusDropdownProps) {
  const mutation = useJobMutation(job.id)

  useEffect(() => {
    mutation.reset()
  }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // statusOverride takes priority; fall back to applied state
  const displayValue = job.statusOverride ?? (job.applied ? APPLIED : NO_STATUS)

  function handleChange(value: string) {
    if (value === NO_STATUS) {
      mutation.mutate({ id: job.id, patch: { applied: false, statusOverride: null } })
    } else if (value === APPLIED) {
      mutation.mutate({ id: job.id, patch: { applied: true, statusOverride: null } })
    } else {
      mutation.mutate({ id: job.id, patch: { applied: true, statusOverride: value } })
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Status</p>
      <Select
        value={displayValue}
        disabled={mutation.isPending}
        onValueChange={handleChange}
      >
        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-200">
          <SelectValue placeholder="No Status" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border-zinc-700">
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-zinc-200">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.isError && (
        <p className="text-xs text-red-400">{mutation.error?.message ?? 'Update failed'}</p>
      )}
    </div>
  )
}
```

**Key decisions:**
- `NO_STATUS = '__none__'` sentinel avoids conflict with any real status value (empty string `''` causes shadcn Select display issues)
- `APPLIED = 'Applied'` matches the value the IMAP poller writes to `jobs.status` — important for display consistency in the Tracker (AC 9)
- `statusOverride` takes display priority over `applied` state — a user who selected "Interview" after applying sees "Interview", not "Applied"
- When "Applied" or any other option is selected, `applied: true` is included so the job appears in the Tracker view immediately (optimistic update covers this via `useJobMutation`'s `onMutate`)

### `JobDrawer.tsx` — Required Changes

```tsx
// REMOVE these imports:
import { AppliedToggle } from './AppliedToggle'
import { StatusOverride } from './StatusOverride'

// ADD this import:
import { StatusDropdown } from './StatusDropdown'

// In JSX, REPLACE:
{job && <AppliedToggle job={job} />}
{job && <StatusOverride job={job} />}

// WITH:
{job && <StatusDropdown job={job} />}
```

### `TrackerTable.tsx` — Status Cell Update (AC: 9)

```tsx
// BEFORE:
{job.statusOverride ?? job.status ?? '—'}

// AFTER:
{job.statusOverride ?? job.status ?? (job.applied ? 'Applied' : '—')}
```

This ensures applied jobs with no statusOverride or email-detected status show "Applied" instead of a blank "—".

### `imap-poller.ts` — New STATUS_PATTERN Entry (AC: 10)

Add at the START of the `STATUS_PATTERNS` array (before Interview — order matters; first match wins):

```ts
const STATUS_PATTERNS: Array<{ pattern: RegExp; status: string }> = [
  {
    pattern: /thank you for applying|application received|we have received your application|thank you for your application|we received your application/i,
    status: 'Applied',
  },
  { pattern: /interview|phone\s+screen|screening/i, status: 'Interview' },
  {
    pattern: /rejected|regret|unfortunately|not moving forward|no longer|decided not|position has been filled/i,
    status: 'Rejected',
  },
  { pattern: /offer|congratulations|pleased to offer/i, status: 'Offer' },
]
```

**Why first in the array:** If an email contains both "thank you for applying" and a congratulations message (unusual but possible), "Applied" would otherwise never match because "Offer" or "Interview" would fire first. Since acknowledgment emails are clearly non-interview/offer, placing "Applied" first is safe — its keywords ("thank you for applying", "application received") don't appear in interview/offer/rejection emails.

**No change to the DB write logic.** The existing transaction already handles:
```ts
db.transaction((tx) => {
  tx.update(jobs).set({ status: detectedStatus }).where(eq(jobs.id, matchedJob.id)).run()
  tx.insert(statusEvents).values({
    jobId: matchedJob.id,
    status: detectedStatus,
    timestamp: receivedDate.toISOString(),
    source: 'email',
  }).run()
})
```
When `detectedStatus = 'Applied'`, this correctly sets `jobs.status = 'Applied'` and inserts a status event. The `jobs.applied` boolean doesn't need to be touched here — the user must have already set `applied = true` manually (the poller only scans `applied = true` jobs).

### `imap-poller.test.ts` — New Tests

Add to `describe('detectStatus', ...)`:
```ts
test('returns Applied for thank-you-for-applying keywords', () => {
  expect(detectStatus('Thank you for applying to Acme Corp')).toBe('Applied')
})
test('returns Applied for application received keywords', () => {
  expect(detectStatus('We have received your application')).toBe('Applied')
})
```

Add to `describe('pollOnce (integration)', ...)`:
```ts
test('sets status to Applied on thank-you email match', async () => {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('TY Corp', 'Engineer', 1, '2026-04-05')`
  )
  const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('TY Corp') as { id: number }

  mockUids.push(1)
  mockMessages.push({ source: Buffer.alloc(0) })
  mockSimpleParser.mockImplementation(async () => ({
    subject: 'Thank you for applying to TY Corp',
    date: new Date('2026-04-05T14:00:00Z'),
    text: 'We have received your application for the Engineer position.',
  }))

  await pollOnce(credentials)

  const job = prodSqlite.query('SELECT status FROM jobs WHERE id = ?').get(row.id) as { status: string }
  expect(job.status).toBe('Applied')

  const event = prodSqlite.query('SELECT status, source FROM status_events WHERE job_id = ?').get(row.id) as {
    status: string; source: string
  }
  expect(event.status).toBe('Applied')
  expect(event.source).toBe('email')
})
```

### No Migration Required

No DB schema changes in this story. All fields (`applied`, `statusOverride`, `status`) already exist.

### `useJobMutation.ts` — No Changes Required

The current implementation already:
- Accepts `{ applied?: boolean; statusOverride?: string | null }` in `JobPatch`
- Handles optimistic `dateApplied` set/clear when `applied` is included in the patch
- Invalidates both `['jobs']` and `['jobs', jobId, 'events']` on settled

Sending `{ applied: false, statusOverride: null }` together is fully supported — both fields are optional and the `hasFields` check in the server handler passes since at least one is present.

### Flow Clarification: Email "Applied" Detection

The IMAP poller only scans jobs where `applied = true AND dateApplied IS NOT NULL`. This means:

1. User opens a job in the drawer → selects "Applied" from the new unified dropdown
2. `PATCH { applied: true, statusOverride: null }` → `applied = true`, `dateApplied = today`
3. Next IMAP poll finds the job → matches "Thank you for applying" email → sets `jobs.status = 'Applied'`
4. Status timeline shows the email-confirmed "Applied" event (Story 6-3 will add the email indicator)

The email detection is a **confirmation** of the manual action, not a replacement for it.

### Existing StatusOverride Enum in `api-jobs.ts`

The server has `STATUS_OVERRIDE_VALUES` as a Zod enum. `'Applied'` is NOT in this enum. The `StatusDropdown` never sends `{ statusOverride: 'Applied' }` — it sends `{ applied: true, statusOverride: null }` for "Applied". So there is no conflict with the server-side enum.

### Files After This Story

```
src/
  client/
    components/
      detail/
        AppliedToggle.tsx         ← DELETED
        StatusOverride.tsx        ← DELETED
        StatusDropdown.tsx        ← NEW
        JobDrawer.tsx             ← MODIFIED (StatusDropdown replaces two components)
      tracker/
        TrackerTable.tsx          ← MODIFIED (status cell adds 'Applied' fallback)
  server/
    services/
      imap-poller.ts              ← MODIFIED (Applied pattern added)
      imap-poller.test.ts         ← MODIFIED (new detectStatus + pollOnce tests)
```

### Previous Story Learnings

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **shadcn Select sentinel value** — `''` (empty string) causes SelectValue to render blank even when a placeholder is set; use a non-empty sentinel like `'__none__'` for the "no value" option (established in `StatusOverride.tsx`)
- **`mutation.reset()` in `useEffect` on `job.id` change** — prevents stale `isError` state when switching between jobs in the drawer (established in `AppliedToggle.tsx` and `StatusOverride.tsx`)
- **`useJobMutation(job.id)` signature** — takes `jobId: number` as an argument (post-4-3 review refactor); instantiate inside the component, not passed via props
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; remove unused imports from `JobDrawer.tsx` immediately after deleting `AppliedToggle` and `StatusOverride`
- **imap-poller tests** — `mock.module('mailparser', ...)` and `mock.module('imapflow', ...)` must appear before `await import('./imap-poller')` (established in 6-2 story); `mockSimpleParser.mockImplementation(...)` per test (mutable override pattern from 6-2)

### Cross-Story Dependencies

- **Story 6-3** (email events visible in drawer) also modifies `JobDrawer.tsx` — it adds email indicators to `StatusTimeline`. These changes are in different sections of the JSX and should not conflict. Implement either order.
- **`jobs.status = 'Applied'`** set by the IMAP poller in this story will be surfaced by Story 6-3's email event indicator in the timeline — the `source: 'email'` on the status_event row is what 6-3 uses.

### References

- Story 4-3 implementation: `_bmad-output/implementation-artifacts/4-3-applied-toggle-and-status-override-with-persistence.md`
- Story 6-2 implementation (imap-poller with mailparser): `_bmad-output/implementation-artifacts/6-2-fuzzy-email-to-job-matching-and-status-update.md`
- Current `api-jobs.ts` PATCH handler and `STATUS_OVERRIDE_VALUES` enum
- Current `useJobMutation.ts` (no changes needed — already accepts `{ applied, statusOverride }` together)
- Project rules: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Created `StatusDropdown.tsx` combining applied state + statusOverride into a single Select. `NO_STATUS='__none__'` sentinel avoids shadcn SelectValue blank render issue with empty string. `APPLIED='Applied'` matches value written by IMAP poller to `jobs.status`.
- Updated `JobDrawer.tsx`: removed `AppliedToggle` and `StatusOverride` imports/usages, replaced with single `<StatusDropdown job={job} />`.
- Deleted `AppliedToggle.tsx` and `StatusOverride.tsx`; `tsc --noEmit` confirmed zero remaining references.
- Updated `TrackerTable.tsx` status cell: added `(job.applied ? 'Applied' : '—')` fallback so applied jobs with no override/email status show "Applied".
- Added `Applied` pattern at start of `STATUS_PATTERNS` in `imap-poller.ts` (first-match-wins; "thank you for applying" keywords don't appear in interview/offer/rejection emails).
- Added 2 unit tests to `detectStatus` describe block and 1 integration test (`sets status to Applied on thank-you email match`) to `pollOnce` describe block.
- All 73 tests pass, 0 failures. Zero TypeScript errors.

### File List

- `job-hunt-dashboard/src/client/components/detail/StatusDropdown.tsx` — NEW
- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx` — MODIFIED
- `job-hunt-dashboard/src/client/components/detail/AppliedToggle.tsx` — DELETED
- `job-hunt-dashboard/src/client/components/detail/StatusOverride.tsx` — DELETED
- `job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx` — MODIFIED
- `job-hunt-dashboard/src/server/services/imap-poller.ts` — MODIFIED
- `job-hunt-dashboard/src/server/services/imap-poller.test.ts` — MODIFIED

### Review Findings

- [x] [Review][Patch] 'Applied' string literal duplicated across two new files [`StatusDropdown.tsx:13`, `TrackerTable.tsx:64`] — exported `APPLIED` from `StatusDropdown.tsx`, imported in `TrackerTable.tsx` (Nit)
- [x] [Review][Defer] Port 993 hardcoded in `pollOnce` — no `IMAP_PORT` env var override for non-standard/test IMAP servers [`imap-poller.ts:118`] — deferred, pre-existing from story 6-1
- [x] [Review][Defer] `uidsResult === false` guard is dead code — `imapflow`'s `search()` returns `number[]`, not `false`; condition is never true [`imap-poller.ts:134`] — deferred, pre-existing from story 6-1
- [x] [Review][Defer] UTC midnight anchor for `dateApplied` may misalign with email timestamps near timezone boundaries [`imap-poller.ts:66`] — deferred, pre-existing from story 6-2
- [x] [Review][Defer] `normalizeText` expands abbreviations across full email body text, not just job title tokens — boilerplate phrases containing "senior" or "engineer" inflate false-positive title matches [`imap-poller.ts:30`] — deferred, pre-existing from story 6-2

## Change Log

- 2026-04-05: Story created by SM agent (create-story workflow)
- 2026-04-05: Story implemented by dev agent (claude-sonnet-4-6) — StatusDropdown replaces AppliedToggle+StatusOverride, TrackerTable status fallback added, IMAP Applied pattern added, 3 new tests
- 2026-04-05: Code review by claude-sonnet-4-6 — 1 patch finding, 4 deferred (pre-existing), 12 dismissed
