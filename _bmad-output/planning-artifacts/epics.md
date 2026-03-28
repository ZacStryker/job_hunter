---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: complete
completedAt: '2026-03-27'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
---

# Job Hunt Dashboard - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Job Hunt Dashboard, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Data Ingestion & Sync**
- FR1: User can trigger a manual sync that fetches all job records from Google Sheets via OAuth
- FR2: System ingests job records via a POST endpoint accepting structured job data arrays
- FR3: System upserts job records on sync without overwriting user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`)
- FR4: System matches existing records by compound key (company + job title) to determine insert vs. update
- FR5: User receives feedback on sync completion showing records added and records updated
- FR6: System reports sync failures with a clear error message without modifying any existing data

**Job Pipeline View**
- FR7: User can view all job records in a dense tabular pipeline view
- FR8: User can see each job's fit score as a color-coded visual indicator
- FR9: User can see each job's AI-recommended action (skip/investigate/apply) as a visual chip
- FR10: User can switch between Pipeline view and Tracker view
- FR11: User can toggle visibility of optional columns (reqs met count, reqs missed count, notes)
- FR12: System persists column visibility preferences across browser sessions

**Job Tracker View**
- FR13: User can view applied jobs with their application status and date applied
- FR14: User can perceive time elapsed since application through ambient row visual decay
- FR15: User can distinguish recent applications from stale ones without an explicit ghosted status label

**Job Detail & Decision**
- FR16: User can open a detailed record view for any job by selecting it from the table
- FR17: User can view the complete AI analysis for a job (fit score breakdown, requirements met, requirements missed, Claude's explanation)
- FR18: User can view the original job description and source URL for any job
- FR19: User can mark a job as applied, with that state persisting across re-syncs
- FR20: User can manually set or override the application status for any job
- FR21: User can view a chronological timeline of status events for a job record

**Application Setup & Configuration**
- FR22: System automatically runs database migrations on startup without manual intervention
- FR23: System reads all configuration (OAuth credentials, Sheets ID, webhook URLs) from environment variables
- FR24: User can start the full application (API + UI) with a single command

**Post-MVP: Email Status Integration**
- FR25: System polls an IMAP email inbox for job-related messages
- FR26: System matches incoming emails to job records using fuzzy title comparison anchored to applied date proximity
- FR27: System automatically updates a job's status based on matched email detection
- FR32: User can view matched email events linked to a job record in the detail drawer

**Post-MVP: Cover Letter Generation**
- FR28: User can trigger cover letter generation for a specific job record
- FR29: System delivers the generated cover letter to the user via email
- FR30: System updates a job record to reflect cover letter generation and delivery status
- FR31: User can view the generated cover letter in the job detail view
- FR33: User can see a visual cover letter status indicator on a job's table row

### NonFunctional Requirements

**Reliability**
- NFR1: App starts successfully with `bun start` on every launch with no manual intervention
- NFR2: Database migrations complete without error on a clean install and are idempotent on subsequent starts
- NFR3: Sheets sync is atomic with respect to user-owned fields — a failed or interrupted sync must not partially overwrite `applied`, `status`, `status_override`, or `cover_letter_sent_at`
- NFR4: No crashes or instability during standard daily-use sessions

**Performance**
- NFR5: Pipeline and Tracker table views render up to 500 job records without perceptible lag
- NFR6: Detail drawer opens without noticeable delay (data already in client state)
- NFR7: Sheets sync for up to 200 rows completes within 10 seconds under normal network conditions

**Security**
- NFR8: OAuth tokens and IMAP credentials stored only in `.env` on the local filesystem — never committed, logged, or exposed via API response
- NFR9: Hono API server binds to `127.0.0.1` only — not network-accessible
- NFR10: `.env.example` documents all required variables without real credential values

**Integration**
- NFR11: The `/ingest` endpoint accepts a documented JSON schema; Sheets column mapping changes are reflected in a single mapping layer only
- NFR12: Sheets API OAuth 2.0 calls include token refresh handling — expired tokens produce a clear error, not silent failure
- NFR13 (Post-MVP): n8n webhook callbacks to Hono include a shared secret for basic request authentication
- NFR14 (Post-MVP): Compound key email matching uses normalized, lowercase title comparison + ±3 day window against `date_applied`

### Additional Requirements

From Architecture — critical implementation constraints:

- **Starter template (Epic 1 Story 1):** Project initialized via `bun create hono@latest job-hunt-dashboard --template bun` followed by adding React, Vite, Drizzle, TanStack stack, and shadcn/ui init
- **Zod shared schema:** `src/shared/schemas.ts` must be defined before any server handler or client component — single source of truth for all job types across all layers
- **Compound unique index:** `db/schema.ts` must define `uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle)` — required for ON CONFLICT upsert
- **Drizzle camelCase config:** `drizzle.config.ts` must include `casing: 'camelCase'` so all query results auto-map snake_case → camelCase
- **SQLite transaction wrapping:** All upsert rows in a sync batch wrapped in a single transaction — full rollback if any row fails validation or write
- **TanStack Query key shapes (frozen):** `['jobs']` for list, `['jobs', id]` for single — no variations permitted
- **localStorage key (frozen):** Column visibility stored under `"job-hunt-column-visibility"` — changing post-ship loses user preferences
- **Server binding:** Hono must bind to `127.0.0.1` — never `0.0.0.0`
- **Error response shape (frozen):** All error responses must return `{ error: string }` — never `{ message }` or nested shapes
- **Date format:** ISO 8601 strings throughout — never Unix timestamps or Date objects in API responses
- **Visual aging thresholds (frozen):** 0–7d = 1.0, 8–14d = 0.75, 15–21d = 0.55, 22+ = 0.35 opacity
- **Cache update strategy:** PATCH mutations use optimistic update on `['jobs']`; POST /api/sync invalidates `['jobs']` for full re-fetch
- **No direct fetch in components:** All data access via hooks in `src/client/hooks/` — never raw `fetch()` in a component

### UX Design Requirements

- UX-DR1: Dark mode base palette — zinc-950 background, zinc-900 surface (cards, drawer), zinc-800 elevated surface, zinc-700 borders, zinc-100 text primary, zinc-400 text muted
- UX-DR2: Semantic color tokens in `globals.css` — `--score-high` (emerald-500 #10b981), `--score-mid` (amber-400 #fbbf24), `--score-low` (red-500 #ef4444); action chip tokens for apply (blue-500), investigate (amber-500), skip (zinc-500)
- UX-DR3: `ScoreBadge` component — outlined badge (border + text in tier color, transparent bg); thresholds: ≥75 emerald, 50–74 amber, 0–49 red; `score: number` prop, color derived internally
- UX-DR4: `ActionChip` component — subtle background tint, no border; apply = `bg-blue-950 text-blue-300`, investigate = `bg-amber-950 text-amber-300`, skip = `bg-zinc-800 text-zinc-400`; `recommendation: 'apply' | 'investigate' | 'skip'` prop
- UX-DR5: `AgingRow` component — opacity wrapper around TableRow; thresholds: 0–7d=1.0, 8–14d=0.75, 15–21d=0.55, 22+=0.35; Tooltip on hover "Applied N days ago"; renders full opacity if `appliedAt` is null
- UX-DR6: `AssessmentSection` component — uppercase label (`text-xs text-zinc-500 uppercase tracking-wide`) above prose paragraph (`text-sm text-zinc-200 leading-relaxed`); renders nothing if content is null; used four times in drawer order: `role_fit` → `requirements_met` → `requirements_missed` → `red_flags`
- UX-DR7: `SyncButton` component — states: idle ("Sync"), loading (spinner + "Syncing…" + disabled), success (green tint + "X added, Y updated", auto-dismisses 3s), error (red tint + truncated message, persists until next click); wraps `useSyncMutation`
- UX-DR8: Pipeline table card container — `rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden`; sticky header with `backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800`
- UX-DR9: Table density — row padding `py-1.5 px-3`, cell font `text-sm`; header `py-2 px-3 text-xs font-medium uppercase`; Inter variable font with fallback `system-ui, -apple-system, sans-serif`; drawer width `w-[480px]` fixed, internal padding `p-6`, section spacing `space-y-4`
- UX-DR10: `JobDrawer` (shadcn `<Sheet side="right">`, 480px) content order: (1) sticky header — company, job title, ScoreBadge, ActionChip; (2) AssessmentSection ×4; (3) Separator; (4) Job description (collapsible, show 300 chars + "Show more"); (5) Source URL with external link icon; (6) Separator; (7) Applied toggle (Switch + date if applied); (8) Status override (Select); (9) StatusTimeline
- UX-DR11: Column visibility `DropdownMenu` in header toolbar — checkboxes for optional columns (`reqs_met`, `reqs_missed`, `notes`); persists to localStorage under `"job-dashboard:column-visibility"`; all columns shown on first load
- UX-DR12: Active row highlight `bg-zinc-800` while drawer is open; clicking a different row replaces drawer content without close/reopen animation
- UX-DR13: No floating toasts — all feedback inline; sync result as shadcn `Alert` below header bar (success auto-dismisses 4s, error persists until next sync); applied toggle and status override changes are their own feedback (no toast)
- UX-DR14: Initial table load shows Skeleton rows (5–8 rows of shimmer); empty state centered inside card: "No jobs yet. Hit Sync to pull from Google Sheets." with Sync shortcut Button
- UX-DR15: View switching (Pipeline/Tracker) via header tabs — local React `useState`, not URL routing; always opens Pipeline view on load; header layout: App name (left) → View tabs (center) → SyncButton + column visibility toggle (right)
- UX-DR16: Fit score column sorts descending by default; click column header toggles ascending/descending; no multi-column sort; no row selection checkboxes

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 2 | Manual Sheets sync trigger |
| FR2 | Epic 2 | POST /api/ingest endpoint |
| FR3 | Epic 2 | Mutable field protection on upsert |
| FR4 | Epic 2 | Compound key matching |
| FR5 | Epic 2 | Sync result feedback |
| FR6 | Epic 2 | Sync failure handling |
| FR7 | Epic 3 | Pipeline table render |
| FR8 | Epic 3 | Fit score color badge |
| FR9 | Epic 3 | Action chip (skip/investigate/apply) |
| FR10 | Epic 3 | Pipeline ↔ Tracker view switching |
| FR11 | Epic 3 | Column visibility toggle |
| FR12 | Epic 3 | localStorage column persistence |
| FR13 | Epic 5 | Tracker view with applied jobs |
| FR14 | Epic 5 | Visual row opacity decay |
| FR15 | Epic 5 | Ambient staleness without "ghosted" label |
| FR16 | Epic 4 | Detail drawer on row click |
| FR17 | Epic 4 | Full AI analysis display |
| FR18 | Epic 4 | Job description + source URL |
| FR19 | Epic 4 | Applied toggle + persistence |
| FR20 | Epic 4 | Status override |
| FR21 | Epic 4 | Status timeline |
| FR22 | Epic 1 | Boot migrations |
| FR23 | Epic 1 | .env configuration |
| FR24 | Epic 1 | Single `bun start` command |
| FR25 | Epic 6 | IMAP inbox polling |
| FR26 | Epic 6 | Fuzzy email-to-job matching |
| FR27 | Epic 6 | Auto status update from email |
| FR28 | Epic 7 | Cover letter generation trigger |
| FR29 | Epic 7 | Cover letter email delivery |
| FR30 | Epic 7 | Job record CL status tracking |
| FR31 | Epic 7 | Cover letter in drawer |
| FR32 | Epic 6 | Email events in drawer |
| FR33 | Epic 7 | CL status indicator on table row |

## Epic List

### Epic 1: Working Application Foundation
User can clone the repo, run `bun start`, and see a live (empty) dashboard with migrations applied — the full stack is wired and running.
**FRs covered:** FR22, FR23, FR24
**NFRs addressed:** NFR1, NFR2, NFR9
**Architecture:** Project scaffold via `bun create hono@latest`, Drizzle schema + Zod shared types, TanStack stack wired, shadcn initialized, dev/prod scripts working

### Epic 2: Data Ingestion & Sheets Sync
User can sync job records from Google Sheets into the dashboard — jobs land in SQLite, user-owned fields are protected, and feedback is clear on success or failure.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6
**NFRs addressed:** NFR3, NFR7, NFR8, NFR10, NFR11, NFR12

### Epic 3: Pipeline View — Job Triage at a Glance
User can scan all jobs in a dense, color-coded pipeline table with fit score badges and action chips — including column visibility toggling and view switching to Tracker tab.
**FRs covered:** FR7, FR8, FR9, FR10, FR11, FR12
**UX-DRs:** UX-DR1–4, UX-DR8–9, UX-DR11, UX-DR13–16
**NFRs addressed:** NFR5, NFR6

### Epic 4: Job Detail & Decision — The Triage Moment
User can click any job row to open the full detail drawer — reading AI analysis, marking applied, overriding status — with all changes persisting across re-syncs.
**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21
**UX-DRs:** UX-DR6, UX-DR10, UX-DR12

### Epic 5: Tracker View — Monitoring Applied Applications
User can switch to the Tracker view and see applied jobs with visual row aging that communicates staleness without an explicit "ghosted" label.
**FRs covered:** FR13, FR14, FR15
**UX-DRs:** UX-DR5

### Epic 6 (Post-MVP): Email Status Detection
System polls IMAP inbox, matches emails to job records, and auto-updates application status — visible in the job detail drawer.
**FRs covered:** FR25, FR26, FR27, FR32
**NFRs addressed:** NFR13, NFR14

### Epic 7 (Post-MVP): Cover Letter Generation Pipeline
User can trigger cover letter generation for any job — delivered via email, tracked in the drawer, with status indicator visible in the table row.
**FRs covered:** FR28, FR29, FR30, FR31, FR33

---

## Epic 1: Working Application Foundation

User can clone the repo, run `bun start`, and see a live (empty) dashboard with migrations applied — the full stack is wired and running.

### Story 1.1: Project Scaffold & Dev/Prod Scripts

As a developer,
I want a correctly scaffolded project with all dependencies installed and dev/prod scripts working,
So that I have a solid foundation to build the full application on.

**Acceptance Criteria:**

**Given** a developer clones the repo and runs `bun install`
**When** they run `bun run dev`
**Then** Vite dev server starts on `:5173` and Hono API starts on `:3001` concurrently
**And** changes to server files hot-reload Hono; changes to client files hot-reload Vite

**Given** the project is scaffolded
**When** `bun run build` is executed
**Then** Vite outputs a production bundle to `dist/` without errors

**Given** a production build exists
**When** `bun start` is executed
**Then** a single Hono process starts on `:3000` serving both `dist/` and `/api/*` routes
**And** the server binds to `127.0.0.1` only — not `0.0.0.0`

**Given** the project structure
**When** a developer inspects the codebase
**Then** the directory structure matches: `src/client/`, `src/server/`, `src/shared/`, `src/db/` with TypeScript strict mode enabled, path aliases for `src/shared/` configured in `tsconfig.json`, and `components.json` (shadcn) committed

### Story 1.2: Database Schema, Shared Types & Boot Migrations

As a developer,
I want the SQLite schema defined, Zod shared types established, and migrations running on boot,
So that every subsequent story has a stable, typed data contract to build against.

**Acceptance Criteria:**

**Given** `src/db/schema.ts` is defined
**When** a developer inspects it
**Then** the `jobs` table contains all Sheets-owned columns (`company`, `job_title`, `fit_score`, `recommendation`, `role_fit`, `requirements_met`, `requirements_missed`, `red_flags`, `job_description`, `source_url`, `date_scraped`) and all user-owned columns (`applied`, `status`, `status_override`, `cover_letter_sent_at`, `date_applied`) plus `id` (integer autoincrement)
**And** a unique index `company_job_title_idx` on `(company, job_title)` is defined
**And** column names use `snake_case`; `drizzle.config.ts` sets `casing: 'camelCase'` for automatic snake_case → camelCase mapping on all query results

**Given** `src/shared/schemas.ts` is defined
**When** a developer imports from it
**Then** `jobSchema`, `ingestPayloadSchema`, `syncResultSchema` (Zod) and their inferred TypeScript types (`Job`, `IngestPayload`, `SyncResult`) are all exported and usable in both `src/server/` and `src/client/`

**Given** `src/db/migrate.ts` exists and is called from `src/index.ts`
**When** `bun start` is run on a clean install
**Then** terminal prints migration success and `data/jobs.db` is created at the path specified by `DB_PATH`
**And** running `bun start` again on an existing DB completes without error (idempotent)

### Story 1.3: App Shell, Environment Config & React Entry

As a user,
I want the app to start cleanly with a basic shell visible at `localhost:3000` and to fail fast with a clear message if my `.env` is misconfigured,
So that setup errors are immediately obvious and the interface is ready for daily use.

**Acceptance Criteria:**

**Given** `.env.example` is committed to the repo
**When** a developer inspects it
**Then** all required environment variables are documented: `PORT`, `DB_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID`
**And** post-MVP variables (`N8N_WEBHOOK_SECRET`, `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`) are present but commented out with setup instructions

**Given** a required env var is missing from `.env`
**When** `bun start` is run
**Then** the app exits immediately with `console.error` listing all missing keys — no silent defaults, no partial startup

**Given** all env vars are present and `bun start` succeeds
**When** the user opens `localhost:3000`
**Then** the React SPA renders with a header bar (`h-14`) containing the app name (left), two view tabs — Pipeline and Tracker (center), and a Sync button placeholder (right)
**And** TanStack Router is configured with routes `/` (Pipeline) and `/tracker`; TanStack `QueryClientProvider` wraps the router at the app root
**And** the Pipeline route (`/`) renders an empty table card with the message "No jobs yet. Hit Sync to pull from Google Sheets."

**Given** the app is running in dev mode (`bun run dev`)
**When** `localhost:5173` is opened
**Then** the same React SPA renders correctly with hot reload active

---

## Epic 2: Data Ingestion & Sheets Sync

User can sync job records from Google Sheets into the dashboard — jobs land in SQLite, user-owned fields are protected, and feedback is clear on success or failure.

### Story 2.1: `/api/ingest` Endpoint with Transactional Upsert

As a developer,
I want a POST endpoint that safely upserts job records while protecting user-owned fields,
So that all data sync operations have a reliable, atomic write layer to target.

**Acceptance Criteria:**

**Given** a POST request to `/api/ingest` with a valid `IngestPayload` (array of job objects)
**When** the endpoint processes the request
**Then** all rows are validated against `ingestPayloadSchema` (Zod) before any DB write begins
**And** all rows are written inside a single SQLite transaction — if any row fails, the entire batch rolls back and no rows are written

**Given** a job record already exists (matched by `company` + `job_title`)
**When** `/api/ingest` receives an updated version of that record
**Then** only Sheets-owned fields are updated (`fit_score`, `recommendation`, `role_fit`, `requirements_met`, `requirements_missed`, `red_flags`, `job_description`, `source_url`, `date_scraped`)
**And** user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`, `date_applied`) are NOT overwritten

**Given** a successful ingest
**When** the response is returned
**Then** the response body is `{ added: number, updated: number }` with HTTP 200
**And** no stack traces or credential values appear in any response body

**Given** an invalid payload (missing required fields or wrong types)
**When** `/api/ingest` receives the request
**Then** it returns HTTP 400 with `{ error: string }` describing the validation failure
**And** no DB writes occur

### Story 2.2: Google Sheets OAuth Client & Column Mapping

As a user,
I want the app to fetch my job records from Google Sheets using OAuth credentials from my `.env`,
So that my upstream pipeline data flows into the dashboard without manual export steps.

**Acceptance Criteria:**

**Given** valid OAuth credentials in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`)
**When** `sheets-sync.ts` is called
**Then** `oauth-client.ts` uses the refresh token to obtain a valid access token before making any Sheets API call
**And** if the token is expired or invalid, `oauth-client.ts` throws an error with the message "OAuth token expired or invalid" — no silent failure

**Given** a successful OAuth token
**When** `sheets-sync.ts` fetches from the Sheets API v4
**Then** all rows from the spreadsheet (`GOOGLE_SPREADSHEET_ID`) are retrieved
**And** the raw Sheets column values are mapped to the `IngestPayload` schema in `sheets-sync.ts` — this is the only file that knows Sheets column names
**And** the output is a valid `Job[]` that can be passed directly to the ingest logic

**Given** a Sheets API network failure or quota error
**When** `sheets-sync.ts` is called
**Then** it throws an error with a descriptive message — no partial results returned, no silent swallowing

### Story 2.3: `/api/sync` Endpoint & Sync Button UI

As a user,
I want to click a Sync button and get clear feedback on whether my Google Sheets data synced successfully,
So that I know my dashboard is up to date and trust that existing data was not corrupted.

**Acceptance Criteria:**

**Given** the user clicks the Sync button
**When** the sync is in progress
**Then** the button shows a spinner and "Syncing…" label and is disabled for the duration

**Given** a successful sync
**When** the operation completes
**Then** an inline `Alert` appears below the header bar showing "X records added, Y updated"
**And** the TanStack Query `['jobs']` cache is invalidated, triggering a re-fetch of the jobs list
**And** the alert auto-dismisses after 4 seconds; the button returns to idle

**Given** a sync failure (OAuth error, Sheets API error, or write error)
**When** the operation fails
**Then** an inline `Alert` (destructive variant) appears showing the specific error message and "No data was modified."
**And** the alert persists until the next sync attempt
**And** the existing jobs data in the table is unchanged

**Given** the user runs Sync a second time immediately after a successful sync
**When** the second sync completes
**Then** the result shows "0 records added, X updated" — idempotent behavior with no data corruption

**Given** the `/api/sync` endpoint
**When** it is called
**Then** it calls `sheets-sync.ts` → maps columns → calls the ingest logic from Story 2.1
**And** it returns `{ added: number, updated: number }` on success or `{ error: string }` with appropriate HTTP status on failure

---

## Epic 3: Pipeline View — Job Triage at a Glance

User can scan all jobs in a dense, color-coded pipeline table with fit score badges and action chips — including column visibility toggling and view switching to Tracker tab.

### Story 3.1: Jobs API & TanStack Query Hook

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

### Story 3.2: Pipeline Table with Fit Score Badge & Action Chip

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

### Story 3.3: Column Visibility Toggle & localStorage Persistence

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

### Story 3.4: View Switching, Loading & Empty States

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

## Epic 4: Job Detail & Decision — The Triage Moment

User can click any job row to open the full detail drawer — reading AI analysis, marking applied, overriding status — with all changes persisting across re-syncs.

### Story 4.1: Job Detail Drawer Shell & Row Click

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

### Story 4.2: AI Analysis Display in Drawer

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

### Story 4.3: Applied Toggle & Status Override with Persistence

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

### Story 4.4: Status Timeline

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

## Epic 5: Tracker View — Monitoring Applied Applications

User can switch to the Tracker view and see applied jobs with visual row aging that communicates staleness without an explicit "ghosted" label.

### Story 5.1: Tracker Table with Applied Jobs

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

### Story 5.2: Visual Row Aging (`AgingRow`)

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

## Epic 6 (Post-MVP): Email Status Detection

System polls IMAP inbox, matches emails to job records via fuzzy matching, and auto-updates application status — email events visible in the drawer.

### Story 6.1: IMAP Polling Service

As a user,
I want the dashboard to automatically poll my email inbox for job-related messages,
So that application status updates arrive without me having to manually check email.

**Acceptance Criteria:**

**Given** `IMAP_HOST`, `IMAP_USER`, and `IMAP_PASS` are set in `.env`
**When** `bun start` runs
**Then** the IMAP polling service starts alongside the Hono server and polls on a configured interval
**And** IMAP credentials are never logged or included in any API response

**Given** IMAP credentials are missing from `.env`
**When** `bun start` runs
**Then** the IMAP service does not start; the rest of the app functions normally; a warning is logged to `console.warn`

**Given** the IMAP connection fails (wrong credentials, unreachable host)
**When** a poll cycle runs
**Then** the error is logged with `console.error`; the polling service retries on the next interval — no crash, no process exit

### Story 6.2: Fuzzy Email-to-Job Matching & Status Update

As a user,
I want the system to automatically match incoming emails to job records and update their status,
So that I get passive application tracking without any manual data entry.

**Acceptance Criteria:**

**Given** a new email arrives in the polled inbox
**When** the matching logic runs
**Then** the email's subject/body is normalized to lowercase and compared against job titles using fuzzy comparison (abbreviation-expanded)
**And** the match is only confirmed if the email's received timestamp is within ±3 days of the job's `date_applied` — date anchoring is the primary false-positive reducer

**Given** a confident match is found
**When** the status update runs
**Then** the matched job's `status` is updated in SQLite with the detected status (e.g., "Interview", "Rejected")
**And** a `status_events` entry is appended with `source: 'email'` and the email's received timestamp

**Given** no confident match is found for an email
**When** the matching logic completes
**Then** no DB writes occur — unmatched emails are silently skipped

### Story 6.3: Email Events Visible in Drawer

As a user,
I want to see email-detected status events in a job's timeline in the detail drawer,
So that I have a complete audit trail of how the application progressed.

**Acceptance Criteria:**

**Given** a job has email-matched status events in `status_events`
**When** the `StatusTimeline` renders in the drawer
**Then** each email-sourced event shows a distinct indicator (e.g., envelope icon or "via email" label) alongside the status and timestamp

**Given** a job has both manually set status events and email-detected events
**When** the `StatusTimeline` renders
**Then** all events are displayed in reverse chronological order regardless of source

---

## Epic 7 (Post-MVP): Cover Letter Generation Pipeline

User can trigger cover letter generation for any job — delivered via email, tracked in the drawer, with status indicator visible in the table row.

### Story 7.1: Cover Letter Generation Trigger

As a user,
I want to trigger cover letter generation for a specific job directly from the drawer,
So that I can initiate the generation pipeline without leaving the dashboard.

**Acceptance Criteria:**

**Given** the user opens the job drawer and clicks "Generate Cover Letter"
**When** the button is clicked
**Then** a POST is sent to the n8n webhook URL (from env) including the job record payload
**And** the request includes the shared secret from `N8N_WEBHOOK_SECRET` as an Authorization header

**Given** the webhook fires successfully
**When** the response is received
**Then** `cover_letter_sent_at` is set to the current ISO timestamp in SQLite for that job
**And** the button state updates to "Generating…" (disabled) to indicate in-progress

**Given** the webhook request fails
**When** the error is caught
**Then** an inline error message appears in the drawer; `cover_letter_sent_at` is not set

### Story 7.2: n8n Webhook Callback & Cover Letter Storage

As a user,
I want the generated cover letter to be automatically stored in the dashboard after n8n delivers it,
So that I can view it any time without relying on email as the only record.

**Acceptance Criteria:**

**Given** n8n completes cover letter generation and POSTs to `/api/cover-letter/callback`
**When** the callback is received
**Then** the `N8N_WEBHOOK_SECRET` in the Authorization header is validated — invalid secret returns HTTP 401

**Given** a valid callback payload
**When** it is processed
**Then** the cover letter text is stored in a `cover_letters` table (`id`, `job_id` FK, `content`, `created_at`)
**And** the job record's status is updated to reflect cover letter delivery

**Given** storage succeeds
**When** the callback response is sent
**Then** HTTP 200 is returned to n8n; no stack traces in response

### Story 7.3: Cover Letter Display & Table Row Indicator

As a user,
I want to read my generated cover letter in the job drawer and see its status at a glance in the pipeline table,
So that I can track which applications have cover letters without opening each drawer.

**Acceptance Criteria:**

**Given** a job has a generated cover letter in the `cover_letters` table
**When** the drawer is open for that job
**Then** the cover letter content is rendered in a dedicated section below the status timeline

**Given** a job with `cover_letter_sent_at` set
**When** its row renders in the Pipeline table
**Then** a cover letter status chip is visible on the row (e.g., "CL Sent" in a muted style)

**Given** a job with no cover letter
**When** its row renders
**Then** no chip is shown — absence is the default, not a "No CL" label
