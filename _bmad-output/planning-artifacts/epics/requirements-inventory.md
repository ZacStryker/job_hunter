# Requirements Inventory

## Functional Requirements

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

## NonFunctional Requirements

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

## Additional Requirements

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

## UX Design Requirements

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

## FR Coverage Map

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
