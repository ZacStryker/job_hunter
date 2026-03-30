# Epic 5: Tracker View — Monitoring Applied Applications

User can switch to the Tracker view and see applied jobs with visual row aging that communicates staleness without an explicit "ghosted" label.

## Story 5.1: Tracker Table with Applied Jobs

As a user,
I want a dedicated view showing only my applied jobs with their status and application date,
So that I can monitor the state of my active application pipeline at a glance.

**Acceptance Criteria:**

**Given** the user clicks the Tracker tab in the header
**When** the `/tracker` route renders
**Then** a table appears showing only jobs where `applied === true`, filtered from the existing `['jobs']` TanStack Query cache — no additional API call needed

**Given** applied jobs exist
**When** the Tracker table renders
**Then** the table shows columns: company, job title, status (or `statusOverride` if set), and date applied (formatted as "Mar 27, 2026")
**And** rows use the same `py-1.5 px-3` density and `text-sm` typography as the Pipeline table

**Given** no jobs have been marked applied
**When** the Tracker table renders
**Then** an empty state is shown: "No applied jobs yet. Mark jobs as applied in the Pipeline view."

**Given** the user clicks a row in the Tracker table
**When** the click is registered
**Then** the `JobDrawer` opens for that job — same drawer from Epic 4, reused here

## Story 5.2: Visual Row Aging (`AgingRow`)

As a user,
I want applied rows to visually fade over time based on how long ago I applied,
So that I can feel the passage of time and naturally deprioritize stale applications without needing an explicit "ghosted" label.

**Acceptance Criteria:**

**Given** a job with `date_applied` set 0–7 days ago
**When** its row renders in the Tracker table
**Then** the row renders at full opacity (`opacity: 1.0`)

**Given** a job with `date_applied` set 8–14 days ago
**When** its row renders
**Then** the row renders at `opacity: 0.75`

**Given** a job with `date_applied` set 15–21 days ago
**When** its row renders
**Then** the row renders at `opacity: 0.55`

**Given** a job with `date_applied` set 22+ days ago
**When** its row renders
**Then** the row renders at `opacity: 0.35`

**Given** any row in the Tracker table
**When** the user hovers over it
**Then** a shadcn `Tooltip` appears showing "Applied N days ago" regardless of the row's current opacity level

**Given** a job where `date_applied` is `null`
**When** its row renders
**Then** `AgingRow` renders at full opacity — no decay applied

**Given** a user with `prefers-reduced-motion` enabled
**When** `AgingRow` applies opacity
**Then** only CSS `opacity` is used (not animation or transition) — the preference is respected automatically

---
