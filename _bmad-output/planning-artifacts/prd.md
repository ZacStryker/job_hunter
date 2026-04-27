---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete', 'step-e-01-discovery', 'step-e-02-review', 'step-e-03-edit']
inputDocuments:
  - '_bmad-output/brainstorming/brainstorming-session-2026-03-26-1400.md'
workflowType: 'prd'
workflow: 'edit'
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: greenfield
briefCount: 0
researchCount: 0
brainstormingCount: 1
projectDocsCount: 0
lastEdited: '2026-04-26'
editHistory:
  - date: '2026-04-26'
    changes: 'Multi-user platform expansion: updated Executive Summary, classification footer, Architecture Overview, Implementation Constraints, Journey 4, Functional Requirements (added FR-A1–FR-A11), Security NFR, and Layout/Accessibility to reflect hosted multi-user deployment on Linode.'
  - date: '2026-04-26'
    changes: 'Validation-driven edits: removed visual aging feature (FR14, FR15, design decision #2, Innovation #1, Success Criterion, MVP scope, Journey 1 narrative); added Journey 6 (Admin User Management) to close FR-A6–FR-A10 orphan FRs; added multi-user onboarding success criterion; updated Journey Requirements Summary table; fixed FR actor violations (FR-A1–FR-A3, FR-A11); fixed FR-A5 IMAP gate inconsistency; rewrote FR7, FR13, FR26; fixed unmeasurable NFRs (performance thresholds, reliability definition); lifted implementation details from Security/Integration NFRs.'
  - date: '2026-04-26'
    changes: 'Pipeline architecture update: replaced all Google Sheets and n8n references with self-contained Discovery and Analysis pipeline (scraper API + Anthropic API direct calls); rewrote Executive Summary, design decisions, Product Scope, Journeys 2/3/5, FR1–FR6 section, FR23, FR29, Success Criteria, NFRs (Reliability, Performance, Integration), Risk Mitigation, and Innovation section.'
---

# Product Requirements Document — Job Hunt Dashboard

**Author:** Stryker
**Date:** 2026-03-26

## Executive Summary

A locally hosted personal web dashboard that serves as a **decision surface for job hunting** — not a data entry tool or tracker. Job records are discovered and analyzed directly within the application: the Discovery service queries a scraper API to find new job listings and stores them; the Analysis service fetches each listing's full description and calls the Anthropic API directly to compute fit scores, requirements met/missed, and a skip/investigate/apply recommendation. The dashboard surfaces that intelligence so the user can make fast, informed triage decisions. Secondary data streams include IMAP email polling for application status detection. Built for a small group of invited users; deployed on Linode. Each user manages their own jobs, IMAP connection, and Anthropic API key independently.

**Target User:** Individual job seeker who wants AI-powered job scoring and triage without external pipeline dependencies. The dashboard discovers, analyzes, and presents job listings end-to-end.

**Problem Solved:** Job hunting creates sustained decision fatigue. Existing trackers require manual data entry and offer no analytical signal — they record what happened, not what to do. This product inverts the model: AI analysis runs automatically as part of the app, the dashboard displays the conclusion, and the user decides.

### What Makes This Special

Two design decisions set this apart from generic job trackers:

1. **Two-phase pipeline model** — Discovery and Analysis run as separate, explicit steps. The user triggers Discovery (scraper API → DB with `analysisStatus = pending`) and then Analysis (scraper full description + Anthropic API → fit score, gap analysis, recommendation written to DB). The dashboard is a decision surface after both phases complete.

2. **Strict data ownership boundary** — The scraper API owns scraped columns (`sourceUrl`, `dateScraped`, `source`, `location`); the Analysis pipeline owns scored columns (`fitScore`, `recommendation`, `requirementsMet`, etc.); SQLite user-state columns (`applied`, `status`, `status_override`, `cover_letter_sent_at`) are never overwritten by Discovery or Analysis runs.

**Classification:** Web Application · SPA (React + Vite) · Linode-hosted · multi-user · Greenfield · Low complexity

## Success Criteria

### User Success

- User makes a triage decision (skip/investigate/apply) on any job record within 10 seconds of opening the dashboard, without touching any other tool
- Applied status and manual status overrides persist correctly across app restarts and re-syncs
- Discovery and Analysis runs complete without overwriting any user-set fields (`applied`, `status`, `status_override`)
- Detail drawer displays complete job record — fit score breakdown, reqs met/missed, Claude's explanation, source URL, status timeline — with no missing data
- A new invited user activates their account and reaches a functional dashboard in under 5 minutes

### Business Success

*(Personal tool — success measured by personal utility, not commercial metrics)*

- Replaces manual job board browsing and spreadsheet tracking entirely; zero need to open external tools for daily job triage
- Becomes the primary interface for every job application decision from day one

### Technical Success

- App starts reliably with `bun start` on every launch — no manual setup after initial install
- SQLite migrations run on boot without intervention
- Discovery runs are idempotent — repeated runs produce no duplicate records (`externalJobId` deduplication)
- Discovery and Analysis failures produce a clear error message and leave all existing data unmodified
- All user-state fields survive a full Discover + Analyze cycle

### Measurable Outcomes

- **Phase 1–2 done:** `bun start` launches app; Discovery service inserts jobs into SQLite; Analysis service scores them via Anthropic API; Discover and Analyze buttons work
- **Phase 3 done:** Pipeline table renders with color-coded score badges and action chips; column visibility toggle persists to localStorage
- **Phase 4 done:** Drawer opens on row click with full record; applied toggle and status override write to SQLite; status timeline visible
- **MVP done:** All phases working reliably in a single `bun start` process — no crashes, no data loss on re-discover

## Product Scope

### MVP — Minimum Viable Product

1. Bun + Hono + SQLite + Drizzle scaffold with boot migrations
2. Discovery service — Discover button triggers 6 parallel scraper API queries (LinkedIn + Indeed), deduplicates by `externalJobId`, inserts new records with `analysisStatus = pending`; result feedback shows added count
3. Analysis service — Analyze button processes all `pending` records: fetches full job description from scraper API, calls Anthropic API directly for fit score, requirements met/missed, recommendation; writes results to DB
4. Pipeline table (TanStack Table + shadcn/ui) — fit score badge (red/yellow/green), action chip (skip/investigate/apply), column visibility toggle
5. Tracker view — Status column, Applied Date, days since application
6. Detail drawer (`<Sheet>`) — score breakdown, reqs met/missed, Claude's explanation, job description, source URL, applied toggle, status override, status timeline

### Growth Features (Post-MVP)

- IMAP email polling → title + date matching → automatic status updates
- Cover letter generation — Anthropic API direct call → `.docx` download from job detail drawer
- Cover letter persistence in SQLite with regenerate capability

### Vision (Future)

- IMAP IDLE for push-like email detection
- SSE streaming for cover letter generation (token-by-token in drawer)
- Cover letter version history
- pm2 for always-on background operation

## User Journeys

### Journey 1: Daily Triage (Primary — Success Path)

*Stryker, 8:47am. Coffee in hand. Opens hitlobster.com.*

The Pipeline view loads. Yesterday evening, he ran Discovery and Analysis — 9 new records scored overnight. He scans the fit score column before reading a single company name. Three green badges. Two yellow. Four red. The reds don't need reading. He starts with the greens.

First green: score 84, action chip says **apply**. He clicks the row. Drawer slides open — fit breakdown shows 6 of 7 requirements met, one gap flagged ("5+ years distributed systems"). Claude's explanation: "Strong match. Gap in distributed systems experience is minor given strong Kubernetes background." He toggles Applied, closes the drawer.

Second green: score 79, action chip says **investigate**. He opens the drawer — the job description mentions a tech he hasn't used. He marks it **skip** via the status override. Four minutes in, he's made 5 decisions, marked 2 applied, skipped 4, two yellows left.

He switches to **Tracker view**. The Applied Date and days-since-application columns tell the story — one entry from 21 days ago with no status update. He mentally writes it off. He closes the tab.

*Total time: 9 minutes. No external tools opened.*

**Capabilities revealed:** Pipeline table with fit score/action columns, color-coded badges, Tracker view with applied date and days elapsed, detail drawer with full record, applied toggle, status override.

---

### Journey 2: Discovery & Analysis Run (Primary — Data In Path)

*Stryker opens the dashboard. He hasn't checked new listings in two days.*

He hits **Discover**. A spinner. The service fires 6 parallel queries to the scraper API — LinkedIn and Indeed searches for his configured roles and locations. Eight seconds later: "23 new jobs found." They appear in the Pipeline view with grey score badges — `pending` status, no fit score yet.

He hits **Analyze**. The analysis service works through the 23 pending records — fetching each full description from the scraper, calling the Anthropic API to score it. A progress indicator updates: "Analyzing 23 jobs… 8/23." Forty seconds later: "23 jobs analyzed." The grey badges resolve to red, yellow, and green. Four greens. He switches to triage mode.

He spot-checks a job he applied to yesterday: `applied: true`, `status: "Applied"` — intact. Neither Discover nor Analyze touched it.

He runs Discover again. "0 new jobs found." Same listings, same `externalJobId` values — deduplication held.

**Capabilities revealed:** Discover button, Analyze button, scraper API integration, `externalJobId` deduplication, Anthropic API scoring, mutable field protection, idempotent behavior.

---

### Journey 3: Edge Case — Scraper Service Unavailable

*Stryker hits Discover. The scraper API is unreachable.*

The dashboard shows: "Discovery failed — scraper service unavailable. No data was modified." His existing records are untouched. He retries after a minute. Discovery completes cleanly.

**Capabilities revealed:** Graceful discovery error handling, atomic-or-nothing write behavior, clear error messaging, scraper API failure detection.

---

### Journey 4: First-Time User Setup (Operations / Configuration)

*Alex receives an invite key from the admin.*

He opens the app URL. The landing page has a single call to action: **Register with Invite Key**. He enters the key, his email, and a password. The form submits. A message appears: "Check your email — an activation link has been sent."

He opens his inbox. The activation email arrives within a minute. He clicks the link. His account is activated and he's redirected to onboarding.

**Step 1 of 4 — Welcome.** A brief explanation of what the app does. He clicks Next.

**Step 2 of 4 — Anthropic API Key.** He pastes his API key. A test call runs: "Connection verified." He clicks Next.

**Step 3 of 4 — IMAP Setup.** He enters his IMAP credentials. A test connection runs: "Connected." He clicks Next. *(He could skip this and configure it later.)*

**Step 4 of 4 — Done.** "You're set up. Your dashboard is ready." He clicks Go to Dashboard.

The pipeline table loads — empty until he syncs jobs.

*Time from invite key to live dashboard: under 5 minutes.*

**Capabilities revealed:** Public landing page, invite-key registration, email activation, onboarding flow (API key + IMAP), per-user dashboard isolation.

---

### Journey 5: Data Flow — Scraper-to-Dashboard (Integration Path)

*Stryker hits Discover. The Discovery service fires 6 parallel queries to the scraper API.*

Each query returns a list of job listings with `externalJobId`, `title`, `company`, `source`, `location`, `sourceUrl`, and `dateScraped`. The service deduplicates the combined results by `externalJobId` — any listing already in the DB is skipped. New listings are inserted with `analysisStatus = pending`.

He hits Analyze. For each pending record, the Analysis service calls the scraper API again to fetch the full job description, then calls the Anthropic API directly (no SDK, via fetch) with the job description and his profile. The response includes `fitScore`, `requirementsMet`, `requirementsMissed`, `recommendation`, and `explanation`. These are written to the job record; `analysisStatus` is set to `done`. User-owned fields (`applied`, `status`, `status_override`) are never touched.

**Capabilities revealed:** Scraper API query contract, `externalJobId` deduplication, three-tier field ownership, Anthropic API scoring call, `analysisStatus` lifecycle.

---

### Journey 6: Admin User Management (Operations)

*The admin receives a support request: a user says they can't log in.*

She opens the dashboard and navigates to the **Admin** panel. A list of all registered users appears — name, email, account type, active status, registration date. She finds the user: account shows "inactive." She toggles **Active** to enabled. The user can now log in.

A second user emails: forgotten password. The admin clicks **Reset Password** — the user receives a reset email; their current session is invalidated.

She notices a third user's email is outdated — registered with a personal address, now on a work email. She clicks **Edit** and updates it.

A fourth user reports their pipeline isn't loading correctly. The admin clicks **Impersonate** next to their row. She's now browsing as that user — she can see their pipeline and settings, identifies a misconfigured IMAP credential, and returns to her own session.

**Capabilities revealed:** User management list, active status toggle, password reset with email notification and session invalidation, user profile editing, admin impersonation with return-to-admin.

---

### Journey Requirements Summary

| Capability Area | Revealed By |
|---|---|
| Pipeline table + fit score/action badge | Journey 1 |
| Tracker view + applied date + days elapsed | Journey 1 |
| Detail drawer + applied toggle + status override | Journey 1 |
| Discover button + Analyze button + result feedback | Journey 2 |
| Idempotent upsert with mutable field protection (`externalJobId` deduplication) | Journey 2, 5 |
| Graceful discovery error handling + scraper service failure detection | Journey 3 |
| Public landing page + invite-key registration + email activation + onboarding | Journey 4 |
| Per-user dashboard isolation | Journey 4 |
| Boot migrations + `.env` config | Journey 4 |
| Scraper API query contract + `externalJobId` deduplication + `analysisStatus` lifecycle | Journey 5 |
| User management list + active status toggle | Journey 6 |
| Password reset with session invalidation + user profile editing | Journey 6 |
| Admin impersonation | Journey 6 |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Two-Phase Pipeline Model (In-App AI)**
Discovery and Analysis run as explicit, separate steps within the app. Discovery queries the scraper API and stores raw listings; Analysis calls the Anthropic API directly (no SDK) to compute fit scores. The dashboard is a pure decision surface after both phases — no real-time AI inference on the UI path.

### Validation Approach

- **Two-phase pipeline:** Validated at first Discover + Analyze run — scraper API must return `externalJobId`-keyed records; Anthropic API must return parseable fit score JSON.

### Risk Mitigation

- Scraper API schema changes: field mapping in the Discovery service is the single point of change — not the UI's concern.

## Web Application Requirements

### Architecture Overview

Single-page application served by Hono from a single process (`bun start`). All UI state in React; all persistence in SQLite via Hono API routes. Deployed on Linode behind Nginx with TLS. Session-based authentication with invite-key registration. Multi-user with Admin and Standard account types.

- **SPA:** React + Vite handles all routing client-side. Hono serves the built bundle as static assets and exposes the API under `/api/*`.
- **Single process:** Hono serves both bundle and API on one port. No reverse proxy, no separate static server.
- **Dev mode:** `bun run dev` runs Vite dev server + Hono API as split processes with hot reload on both sides.

### Browser Support

| Browser | Support |
|---|---|
| Firefox (latest) | Primary — only target |
| Other browsers | Not required |

No cross-browser polyfills or compatibility shims. Modern CSS and JS features may be used freely.

### Layout & Accessibility

Desktop-only. Dense table UI is intentional — no responsive adaptation needed. Accessibility beyond shadcn/ui defaults is not required.

### Implementation Constraints

- Column visibility state persisted to `localStorage`
- No service worker, offline mode, or PWA features
- All config via `.env` — no runtime config UI

## Risk Mitigation

### Technical Risks

- *Scraper service availability* — Discovery and Analysis depend on the scraper API being reachable. Mitigate: clear error messages on unreachable or error responses; operations are idempotent and can be retried.
- *Anthropic API rate limits* — Analysis calls the Anthropic API once per job record. Mitigate: failed records are set to `analysisStatus = failed` and can be re-queued; rate limit errors produce descriptive messages.

### Data Risks

- *Email-to-job matching (post-MVP)* — job title strings may differ between the database record and the email body (e.g., "Senior Engineer" vs "Sr. Engineer"). Matching strategy: fuzzy title comparison (normalized, lowercase, abbreviation-expanded) **plus** email received datetime within ±3 days of `date_applied` from the database. Date anchoring is the primary false-positive reducer.

## Functional Requirements

### Data Discovery & Analysis

- **FR1:** User can trigger Discovery to query the scraper API with 6 parallel searches (LinkedIn + Indeed) and store new job listings in the database
- **FR2:** System deduplicates discovered jobs by `externalJobId` — records already in the database are skipped
- **FR3:** System inserts discovered jobs with `analysisStatus = pending` and never overwrites user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`) on any ingestion path
- **FR4:** User can trigger Analysis to process all `pending` records — fetching full job descriptions from the scraper and calling the Anthropic API to compute fit score, requirements met/missed, and recommendation
- **FR5:** User receives feedback on Discovery and Analysis completion showing counts of records added and records analyzed
- **FR6:** System reports Discovery and Analysis failures with a clear error message without modifying any existing data

### Job Pipeline View

- **FR7:** User can view all job records in a tabular pipeline view displaying up to 500 records
- **FR8:** User can see each job's fit score as a color-coded visual indicator
- **FR9:** User can see each job's AI-recommended action (skip/investigate/apply) as a visual chip
- **FR10:** User can switch between Pipeline view and Tracker view
- **FR11:** User can toggle visibility of optional columns (reqs met count, reqs missed count, notes)
- **FR12:** System persists column visibility preferences across browser sessions

### Job Tracker View

- **FR13:** User can view applied jobs with their application status, date applied, and days elapsed since application

### Job Detail & Decision

- **FR16:** User can open a detailed record view for any job by selecting it from the table
- **FR17:** User can view the complete AI analysis for a job (fit score breakdown, requirements met, requirements missed, Claude's explanation)
- **FR18:** User can view the original job description and source URL for any job
- **FR19:** User can mark a job as applied, with that state persisting across re-syncs
- **FR20:** User can manually set or override the application status for any job
- **FR21:** User can view a chronological timeline of status events for a job record

### Application Setup & Configuration

- **FR22:** System automatically runs database migrations on startup without manual intervention
- **FR23:** System reads all configuration (`SCRAPER_URL`, `SCRAPER_TOKEN`, `ANTHROPIC_API_KEY`, and other service credentials) from environment variables
- **FR24:** User can start the full application (API + UI) with a single command

### User Accounts & Access Control

- **FR-A1:** Any visitor can access the public landing page without authentication
- **FR-A2:** Users can register with a valid invite key and email address
- **FR-A3:** System sends an activation email on registration; accounts remain inactive until the activation link is clicked
- **FR-A4:** Users log in with email + password; sessions persist across browser sessions
- **FR-A5:** Users complete onboarding (Anthropic API key required; IMAP configuration optional) before accessing the app
- **FR-A6:** Admins can view all user accounts in a list
- **FR-A7:** Admins can toggle a user's active status
- **FR-A8:** Admins can reset a user's password (sends email, invalidates current session)
- **FR-A9:** Admins can edit a user's name, email, and account type
- **FR-A10:** Admins can impersonate any user for debugging and support
- **FR-A11:** System ensures all job data, email events, cover letters, and settings are scoped to the owning user
- **FR-A12:** Admins can generate, view, and revoke invite keys for controlling new user registration

### Post-MVP: Email Status Integration

- **FR25:** System polls an IMAP email inbox for job-related messages
- **FR26:** System matches incoming emails to job records based on title similarity and application date proximity
- **FR27:** System automatically updates a job's status based on matched email detection
- **FR32:** User can view matched email events linked to a job record in the detail drawer

### Post-MVP: Cover Letter Generation

- **FR28:** User can trigger cover letter generation for a specific job record
- **FR29:** System provides the generated cover letter as a downloadable `.docx` file
- **FR30:** System updates a job record to reflect cover letter generation and delivery status
- **FR31:** User can view the generated cover letter in the job detail view
- **FR33:** User can see a visual cover letter status indicator on a job's table row

## Non-Functional Requirements

### Reliability

- App starts successfully with `bun start` on every launch with no manual intervention
- Database migrations complete without error on a clean install and are idempotent on subsequent starts
- Discovery and Analysis are safe with respect to user-owned fields — a failed or interrupted run must not partially overwrite `applied`, `status`, `status_override`, or `cover_letter_sent_at`
- App handles continuous use of up to 4 hours without crashes or unhandled errors

### Performance

- Pipeline and Tracker table views render up to 500 job records within 500ms
- Detail drawer opens within 100ms (data already in client state)
- Analysis of up to 20 pending records completes within 60 seconds under normal network and Anthropic API conditions

### Security

- Per-user IMAP credentials and Anthropic API keys stored with strong symmetric encryption at rest; encryption key from environment; never returned to client
- Sessions protected against client-side script access; server-side session state only
- All routes require authentication; admin routes require admin role
- Application served over HTTPS; API server not exposed directly to the public internet
- Invite keys required for registration; accounts inactive until email verification link is clicked
- `.env.example` documents all required variables without real credential values

### Integration

- The scraper API query contract is encapsulated in the Discovery service; schema changes are reflected in a single mapping layer only
- Anthropic API calls include error handling for rate limits and model errors — failures produce a descriptive error and set `analysisStatus = failed`, not silent corruption
- *(Post-MVP)* Email-to-job matching is tolerant of minor title variations and anchored to application date
