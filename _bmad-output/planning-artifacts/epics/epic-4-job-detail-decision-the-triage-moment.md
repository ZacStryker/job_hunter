# Epic 4: Job Detail & Decision — The Triage Moment

User can click any job row to open the full detail drawer — reading AI analysis, marking applied, overriding status — with all changes persisting across re-syncs.

## Story 4.1: Job Detail Drawer Shell & Row Click

As a user,
I want to click any job row and see a detail panel slide in from the right with the job's key signals at a glance,
So that I can evaluate a job without losing my place in the table.

**Acceptance Criteria:**

**Given** the user clicks anywhere on a job row in the Pipeline table
**When** the click is registered
**Then** a shadcn `<Sheet side="right">` slides in at ~300ms with a fixed width of `480px`
**And** data renders immediately — no loading state, no spinner (data is already in TanStack Query cache)

**Given** the drawer is open
**When** the header section renders
**Then** it shows (sticky within drawer): company name, job title as `text-lg font-semibold`, the job's `ScoreBadge`, and its `ActionChip`

**Given** the user clicks a different row while the drawer is open
**When** the new row is clicked
**Then** the drawer content updates to the new job without closing and reopening — no animation replay

**Given** the drawer is open
**When** the user presses Escape, clicks outside the drawer, or clicks the `×` close button
**Then** the drawer closes and focus returns to the triggering row

**Given** a row whose drawer is open
**When** viewed in the table
**Then** the row has `bg-zinc-800` highlight applied; it clears when the drawer closes

## Story 4.2: AI Analysis Display in Drawer

As a user,
I want to read the AI's full assessment of a job — fit analysis, requirements, and red flags — plus the original job description and source link,
So that I have everything needed to make a triage decision without opening any other tool.

**Acceptance Criteria:**

**Given** the drawer is open for a job
**When** the assessment section renders
**Then** four `AssessmentSection` blocks appear in this order: `role_fit` → `requirements_met` → `requirements_missed` → `red_flags`
**And** each block shows an uppercase label (`text-xs text-zinc-500 uppercase tracking-wide`) above a prose paragraph (`text-sm text-zinc-200 leading-relaxed`)
**And** if a field is `null` or empty, that `AssessmentSection` renders nothing — no "N/A" placeholder

**Given** the job has a `job_description`
**When** the description section renders
**Then** only the first 300 characters are shown by default with a "Show more" toggle
**And** clicking "Show more" expands to the full description; clicking "Show less" collapses it

**Given** the job has a `source_url`
**When** the source link renders
**Then** it displays as a clickable link with an external link icon that opens in a new tab

**Given** the full drawer content
**When** viewed top to bottom
**Then** the content order matches: sticky header (company/title/ScoreBadge/ActionChip) → AssessmentSection ×4 → Separator → job description (collapsible) → source URL → Separator → applied toggle → status override → status timeline
**And** the drawer content scrolls independently; the header remains sticky within the drawer

## Story 4.3: Applied Toggle & Status Override with Persistence

As a user,
I want to mark a job as applied and override its status directly in the drawer, with those decisions surviving any future sync,
So that my application records are accurate and protected no matter how many times data syncs from Sheets.

**Acceptance Criteria:**

**Given** the `PATCH /api/jobs/:id` endpoint
**When** called with `{ applied: boolean }`, `{ status: string }`, or `{ statusOverride: string }`
**Then** only user-owned fields are updated in SQLite; Sheets-owned fields are unchanged
**And** the response is `{ job: Job }` with HTTP 200, or `{ error: string }` with HTTP 400/404

**Given** the user clicks the Applied toggle (`Switch`) in the drawer
**When** the click is registered
**Then** the switch flips immediately (optimistic update on `['jobs']` cache via `useJobMutation`)
**And** `PATCH /api/jobs/:id` fires in the background; on success, cache is confirmed; on error, the switch reverts and an inline error message appears in the drawer

**Given** a job that has been marked applied
**When** a sync runs
**Then** the `applied` field remains `true` — the upsert from Epic 2 never overwrites user-owned fields

**Given** the Applied toggle is on and `date_applied` is set
**When** the drawer renders the toggle
**Then** the date is displayed alongside the switch label (e.g., "Applied · Mar 27, 2026")

**Given** the user selects a value from the Status Override `Select`
**When** the selection is made
**Then** `PATCH /api/jobs/:id` fires with the new `statusOverride`; the select reflects the new value immediately (optimistic)
**And** on error, the select reverts to the previous value

## Story 4.4: Status Timeline

As a user,
I want to see a chronological record of status changes for a job in the drawer,
So that I have a clear picture of how a given application has evolved over time.

**Acceptance Criteria:**

**Given** a `status_events` table exists in the schema (`id`, `job_id` FK, `status`, `timestamp` ISO string)
**When** the schema migration runs on boot
**Then** the table is created without error; the migration is idempotent

**Given** a job with no status events
**When** the `StatusTimeline` renders in the drawer
**Then** it shows "No status history yet." as an empty state

**Given** a job with one or more status events
**When** the `StatusTimeline` renders
**Then** events are listed in reverse chronological order (most recent first)
**And** each entry shows a dot indicator, the status label, and the formatted timestamp

**Given** the `PATCH /api/jobs/:id` endpoint updates a job's `status`
**When** the update is written to SQLite
**Then** a corresponding entry is appended to `status_events` for that job

---
