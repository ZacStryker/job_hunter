# Epic 3: Pipeline View — Job Triage at a Glance

User can scan all jobs in a dense, color-coded pipeline table with fit score badges and action chips — including column visibility toggling and view switching to Tracker tab.

## Story 3.1: Jobs API & TanStack Query Hook

As a user,
I want my job records loaded from the database and available in the client on app startup,
So that the pipeline table renders immediately without user-initiated actions.

**Acceptance Criteria:**

**Given** jobs exist in the SQLite database
**When** `GET /api/jobs` is called
**Then** it returns `{ jobs: Job[] }` with HTTP 200, with all fields in camelCase
**And** dates are ISO 8601 strings; booleans are `true`/`false`; missing optional fields are explicit `null`

**Given** the app loads at `localhost:3000`
**When** TanStack Router's route loader runs for the `/` route
**Then** `queryClient.ensureQueryData` is called with key `['jobs']`, pre-populating the cache before the component renders

**Given** `useJobsQuery` is called in a component
**When** the cache is populated
**Then** it returns `{ data: Job[], isPending, isError }` — components use these directly with no custom loading wrappers

**Given** the jobs API call fails
**When** `isError` is true
**Then** the error is surfaced via TanStack Query's error state — no raw `fetch()` calls in components

## Story 3.2: Pipeline Table with Fit Score Badge & Action Chip

As a user,
I want to scan all job records in a dense table with color-coded fit scores and action chips,
So that I can identify the most promising jobs before reading a single label.

**Acceptance Criteria:**

**Given** jobs are loaded in the TanStack Query cache
**When** the Pipeline view renders
**Then** all jobs appear in a TanStack Table inside a card container (`rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden`) with a sticky backdrop-blur header (`sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800`)
**And** table rows use `py-1.5 px-3` padding; all cell text is `text-sm`; column headers are `text-xs font-medium uppercase`

**Given** a job with `fitScore >= 75`
**When** its `ScoreBadge` renders
**Then** it displays the score number with `border-emerald-600 text-emerald-400` outlined styling and transparent background

**Given** a job with `fitScore` between 50–74
**When** its `ScoreBadge` renders
**Then** it displays with `border-amber-500 text-amber-400` outlined styling

**Given** a job with `fitScore < 50`
**When** its `ScoreBadge` renders
**Then** it displays with `border-red-700 text-red-500` outlined styling

**Given** a job with `recommendation: 'apply'`
**When** its `ActionChip` renders
**Then** it displays with `bg-blue-950 text-blue-300` styling

**Given** a job with `recommendation: 'investigate'`
**When** its `ActionChip` renders
**Then** it displays with `bg-amber-950 text-amber-300` styling

**Given** a job with `recommendation: 'skip'`
**When** its `ActionChip` renders
**Then** it displays with `bg-zinc-800 text-zinc-400` styling

**Given** 500 job records in the database
**When** the Pipeline table renders
**Then** it renders without perceptible lag — no virtualization required at this scale

## Story 3.3: Column Visibility Toggle & localStorage Persistence

As a user,
I want to show or hide optional table columns and have my preference remembered across sessions,
So that my table layout stays exactly how I left it every time I open the dashboard.

**Acceptance Criteria:**

**Given** the Pipeline table is visible
**When** the user clicks the column visibility toggle in the header
**Then** a `DropdownMenu` opens showing checkboxes for optional columns: `reqs_met`, `reqs_missed`, `notes`
**And** all optional columns are shown by default on first load

**Given** the user unchecks a column
**When** the dropdown closes
**Then** that column is immediately hidden in the table without a page reload

**Given** the user has hidden one or more columns and refreshes the page
**When** the app loads
**Then** the same columns are hidden, restored from localStorage under the frozen key `"job-hunt-column-visibility"`

**Given** a column header is clicked
**When** it is clicked once
**Then** the table sorts by that column ascending; clicking again sorts descending
**And** the fit score column sorts descending by default on initial load; no multi-column sort is supported

## Story 3.4: View Switching, Loading & Empty States

As a user,
I want smooth transitions between Pipeline and Tracker views, a skeleton during initial load, and a clear prompt when no jobs exist,
So that the interface feels polished and purposeful in every state.

**Acceptance Criteria:**

**Given** the app loads
**When** the Pipeline view is the default
**Then** the Pipeline tab in the header is active (`text-zinc-100` + bottom border); Tracker tab is muted (`text-zinc-500`)

**Given** the user clicks the Tracker tab
**When** the view switches
**Then** TanStack Router navigates to `/tracker`; the Tracker tab becomes active; the Pipeline table unmounts
**And** the Tracker route renders a placeholder — no crash, no blank screen

**Given** the app is performing the initial jobs fetch (`isPending` is true)
**When** the Pipeline table area renders
**Then** 5–8 Skeleton rows appear in place of the table, preserving the column structure so no layout shift occurs when data arrives

**Given** the database contains zero job records
**When** the Pipeline table renders with empty data
**Then** a centered empty state is shown inside the card: "No jobs yet. Hit Sync to pull from Google Sheets." with a Button that triggers sync

---
