---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - '_bmad-output/brainstorming/brainstorming-session-2026-03-26-1400.md'
workflowType: 'prd'
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: greenfield
briefCount: 0
researchCount: 0
brainstormingCount: 1
projectDocsCount: 0
---

# Product Requirements Document — Job Hunt Dashboard

**Author:** Stryker
**Date:** 2026-03-26

## Executive Summary

A locally hosted personal web dashboard that serves as a **decision surface for job hunting** — not a data entry tool or tracker. Job records arrive pre-analyzed from Google Sheets (Claude fit scores, requirements met/missed, skip/investigate/apply recommendation already computed). The dashboard surfaces that intelligence efficiently so the user can make fast, informed triage decisions. Secondary data streams include IMAP email polling for application status detection and an n8n-powered cover letter generation pipeline. Built for single-user personal use; runs entirely on localhost with `bun start`.

**Target User:** Individual job seeker with an established Google Sheets pipeline for scraping and scoring job listings with Claude. The dashboard is the consumption layer for that intelligence.

**Problem Solved:** Job hunting creates sustained decision fatigue. Existing trackers require manual data entry and offer no analytical signal — they record what happened, not what to do. This product inverts the model: AI analysis runs upstream (in Sheets), the dashboard displays the conclusion, and the user decides.

### What Makes This Special

Three design decisions set this apart from generic job trackers:

1. **Pre-scored dossier model** — Every record enters the UI with a fit score, gap analysis, and an explicit AI recommendation. The dashboard is a decision surface, not a decision maker. No in-app analysis features needed.

2. **Passive state communication** — No explicit "ghosted" status field. Row visual aging (opacity/color degrading over time since application) communicates abandonment entropy naturally. Fit score color-coding (red/yellow/green) is absorbed before the user reads a word.

3. **Strict data ownership boundary** — Google Sheets owns scraped and scored columns; SQLite owns user-state columns (`applied`, `status`, `status_override`, `cover_letter_sent_at`). Sync never clobbers dashboard state, making re-sync safe at any time.

**Classification:** Web Application · SPA (React + Vite) · localhost-only · Greenfield · Low complexity

## Success Criteria

### User Success

- User makes a triage decision (skip/investigate/apply) on any job record within 10 seconds of opening the dashboard, without touching any other tool
- Applied status and manual status overrides persist correctly across app restarts and re-syncs
- Sheets sync completes without overwriting any user-set fields (`applied`, `status`, `status_override`)
- Detail drawer displays complete job record — fit score breakdown, reqs met/missed, Claude's explanation, source URL, status timeline — with no missing data
- Visual aging in Tracker view communicates time-since-application without requiring an explicit "ghosted" label

### Business Success

*(Personal tool — success measured by personal utility, not commercial metrics)*

- Replaces manual Sheets + email workflow entirely; zero need to open Sheets for daily job triage
- Becomes the primary interface for every job application decision from day one

### Technical Success

- App starts reliably with `bun start` on every launch — no manual setup after initial install
- SQLite migrations run on boot without intervention
- Sheets sync is idempotent — repeated runs produce identical results with no data corruption
- Sync failures produce a clear error message and leave all existing data unmodified
- All user-state fields survive a full re-sync from Sheets

### Measurable Outcomes

- **Phase 1–2 done:** `bun start` launches app; `/ingest` accepts Sheets data; jobs appear in SQLite; Sync button works
- **Phase 3 done:** Pipeline table renders with color-coded score badges and action chips; column visibility toggle persists to localStorage
- **Phase 4 done:** Drawer opens on row click with full record; applied toggle and status override write to SQLite; status timeline visible
- **MVP done:** All phases working reliably in a single `bun start` process — no crashes, no data loss on re-sync

## Product Scope

### MVP — Minimum Viable Product

1. Bun + Hono + SQLite + Drizzle scaffold with boot migrations
2. `/ingest` endpoint — accepts job JSON array, upserts with mutable field protection
3. Google Sheets OAuth integration — fetches all rows via Sheets API v4, maps to job schema, POSTs to `/ingest`; manual Sync button with result feedback
4. Pipeline table (TanStack Table + shadcn/ui) — fit score badge (red/yellow/green), action chip (skip/investigate/apply), column visibility toggle
5. Tracker view — Status column, Applied Date, visual row aging (opacity/color decay by days since application)
6. Detail drawer (`<Sheet>`) — score breakdown, reqs met/missed, Claude's explanation, job description, source URL, applied toggle, status override, status timeline

### Growth Features (Post-MVP)

- n8n IMAP email polling → compound key matching → automatic status updates
- Google Sheets Apps Script change trigger for near-real-time sync
- Cover letter generation pipeline (n8n webhook → Claude → email → Hono callback → drawer + row status)
- Cover letter persistence in SQLite with regenerate capability

### Vision (Future)

- IMAP IDLE for push-like email detection
- SSE streaming for cover letter generation (token-by-token in drawer)
- Cover letter version history
- pm2 for always-on background operation

## User Journeys

### Journey 1: Daily Triage (Primary — Success Path)

*Stryker, 8:47am. Coffee in hand. Opens localhost:3000.*

The Pipeline view loads. Overnight, his Google Sheets job scraper ran — 9 new records synced. He scans the fit score column before reading a single company name. Three green badges. Two yellow. Four red. The reds don't need reading. He starts with the greens.

First green: score 84, action chip says **apply**. He clicks the row. Drawer slides open — fit breakdown shows 6 of 7 requirements met, one gap flagged ("5+ years distributed systems"). Claude's explanation: "Strong match. Gap in distributed systems experience is minor given strong Kubernetes background." He toggles Applied, closes the drawer.

Second green: score 79, action chip says **investigate**. He opens the drawer — the job description mentions a tech he hasn't used. He marks it **skip** via the status override. Four minutes in, he's made 5 decisions, marked 2 applied, skipped 4, two yellows left.

He switches to **Tracker view**. Applications from three weeks ago are noticeably more muted than last week's. One entry from 21 days ago is mentally written off. He closes the tab.

*Total time: 9 minutes. Sheets never opened.*

**Capabilities revealed:** Pipeline table with fit score/action columns, color-coded badges, Tracker view with visual aging, detail drawer with full record, applied toggle, status override.

---

### Journey 2: Fresh Sync (Primary — Data In Path)

*Stryker finishes tagging 15 new listings in Google Sheets, each pre-scored by his Claude pipeline.*

He hits **Sync**. A spinner. Two seconds later: "15 records added, 47 existing records updated." He spot-checks a job applied to yesterday: `applied: true`, `status: "Applied"` — intact. The sync didn't touch it.

He runs Sync again accidentally. Same result: "0 records added, 62 existing records updated." He trusts the system.

**Capabilities revealed:** Manual Sync button, `/ingest` upsert with mutable field protection, sync result feedback, idempotent behavior.

---

### Journey 3: Edge Case — Auth Failure During Sync

*Stryker hits Sync. The OAuth token has expired.*

The dashboard shows: "Sync failed — OAuth token expired. No data was modified." His existing records are untouched. He re-authenticates, retries. Sync completes cleanly.

**Capabilities revealed:** Graceful sync error handling, atomic-or-nothing write behavior, clear error messaging, OAuth token expiry detection.

---

### Journey 4: First-Run Setup (Operations / Configuration)

*Stryker clones the repo to a new machine.*

He copies `.env.example` → `.env`. Fills in his OAuth credentials, spreadsheet ID, and IMAP credentials for privateemail.com. Runs `bun install && bun start`. Terminal shows: "Running migrations… OK. Server started on :3000."

He opens `localhost:3000`. Empty table. He hits **Sync**. 62 jobs populate. Fit score badges appear. Drawer works. Column visibility toggle saves to localStorage.

*Time from clone to live dashboard: under 5 minutes.*

**Capabilities revealed:** Boot migrations, `.env`-driven configuration, self-bootstrapping setup, no manual DB initialization.

---

### Journey 5: Data Flow — Sheets-to-Dashboard (Integration Path)

*Stryker's Google Sheets pipeline runs: scrapes a job listing, calls Claude to score it, writes a row with fit_score, reqs_met, reqs_missed, recommendation, job_description, source_url.*

He opens the dashboard and hits Sync. The Hono `/ingest` endpoint receives the row, maps it to the SQLite schema, upserts — leaving `applied`, `status`, and `status_override` untouched if the record already exists (matched on `company + job_title`). The new job appears in the Pipeline view with its pre-computed score and action chip ready.

**Capabilities revealed:** `/ingest` endpoint schema contract, compound key upsert logic, Sheets column mapping, mutable field ownership enforcement.

---

### Journey Requirements Summary

| Capability Area | Revealed By |
|---|---|
| Pipeline table + fit score/action badge | Journey 1 |
| Tracker view + visual row aging | Journey 1 |
| Detail drawer + applied toggle + status override | Journey 1 |
| Manual Sync button + result feedback | Journey 2 |
| Idempotent upsert with mutable field protection | Journey 2, 5 |
| Graceful sync error handling + OAuth expiry detection | Journey 3 |
| Boot migrations + `.env` config | Journey 4 |
| `/ingest` schema contract + compound key logic | Journey 5 |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Passive State Communication via Visual Aging**
The dashboard eliminates the "ghosted" application status entirely. Row visual properties (opacity, color saturation) decay as a function of days since application. State is communicated through entropy — absorbed before the user reads a word. This removes an entire category of explicit UI state management.

**2. Pre-Scored Dossier Model (Upstream AI)**
All scoring and reasoning happens upstream in Google Sheets (via Claude). The dashboard receives finished analysis and acts as a pure decision surface — no scoring UI, no analysis panel, no in-app AI calls. The dashboard's only job is to present conclusions and record decisions.

### Validation Approach

- **Visual aging:** Validated by daily use — if the user never needs to explicitly mark jobs "ghosted," the pattern works. Tooltip fallback ("Applied 18 days ago") available on hover if needed.
- **Pre-scored model:** Validated at first Sheets sync — upstream pipeline must produce data the dashboard can consume without transformation.

### Risk Mitigation

- Visual aging ambiguity: hover tooltip provides explicit fallback without cluttering the table.
- Schema changes in Sheets pipeline: `/ingest` mapping layer is the single point of change — not the UI's concern.

## Web Application Requirements

### Architecture Overview

Single-page application served by Hono from a single process (`bun start`). All UI state in React; all persistence in SQLite via Hono API routes. No public deployment, no CDN, no build pipeline beyond `bun run build`. Localhost-only.

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

Desktop-only. Dense table UI is intentional — no responsive adaptation needed. Accessibility beyond shadcn/ui defaults is not required for this single-user personal tool.

### Implementation Constraints

- Column visibility state persisted to `localStorage`
- No authentication, sessions, or user accounts
- No service worker, offline mode, or PWA features
- All config via `.env` — no runtime config UI

## Risk Mitigation

### Technical Risks

- *Google Sheets OAuth setup* — highest first-run friction. Mitigate: `.env.example` includes step-by-step OAuth credential setup comments; app fails fast with a clear error if token is missing or expired.
- *Sheets API quota* — read quota (60 req/min) is not a concern for personal-scale sync.

### Data Risks

- *Compound key email matching (post-MVP)* — job title strings may differ between Sheets scrape and email body (e.g., "Senior Engineer" vs "Sr. Engineer"). Matching strategy: fuzzy title comparison (normalized, lowercase, abbreviation-expanded) **plus** email received datetime within ±3 days of `date_applied` from Sheets. Date anchoring is the primary false-positive reducer.

## Functional Requirements

### Data Ingestion & Sync

- **FR1:** User can trigger a manual sync that fetches all job records from Google Sheets via OAuth
- **FR2:** System ingests job records via a POST endpoint accepting structured job data arrays
- **FR3:** System upserts job records on sync without overwriting user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`)
- **FR4:** System matches existing records by compound key (company + job title) to determine insert vs. update
- **FR5:** User receives feedback on sync completion showing records added and records updated
- **FR6:** System reports sync failures with a clear error message without modifying any existing data

### Job Pipeline View

- **FR7:** User can view all job records in a dense tabular pipeline view
- **FR8:** User can see each job's fit score as a color-coded visual indicator
- **FR9:** User can see each job's AI-recommended action (skip/investigate/apply) as a visual chip
- **FR10:** User can switch between Pipeline view and Tracker view
- **FR11:** User can toggle visibility of optional columns (reqs met count, reqs missed count, notes)
- **FR12:** System persists column visibility preferences across browser sessions

### Job Tracker View

- **FR13:** User can view applied jobs with their application status and date applied
- **FR14:** User can perceive time elapsed since application through ambient row visual decay
- **FR15:** User can distinguish recent applications from stale ones without an explicit ghosted status label

### Job Detail & Decision

- **FR16:** User can open a detailed record view for any job by selecting it from the table
- **FR17:** User can view the complete AI analysis for a job (fit score breakdown, requirements met, requirements missed, Claude's explanation)
- **FR18:** User can view the original job description and source URL for any job
- **FR19:** User can mark a job as applied, with that state persisting across re-syncs
- **FR20:** User can manually set or override the application status for any job
- **FR21:** User can view a chronological timeline of status events for a job record

### Application Setup & Configuration

- **FR22:** System automatically runs database migrations on startup without manual intervention
- **FR23:** System reads all configuration (OAuth credentials, Sheets ID, webhook URLs) from environment variables
- **FR24:** User can start the full application (API + UI) with a single command

### Post-MVP: Email Status Integration

- **FR25:** System polls an IMAP email inbox for job-related messages
- **FR26:** System matches incoming emails to job records using fuzzy title comparison anchored to applied date proximity
- **FR27:** System automatically updates a job's status based on matched email detection
- **FR32:** User can view matched email events linked to a job record in the detail drawer

### Post-MVP: Cover Letter Generation

- **FR28:** User can trigger cover letter generation for a specific job record
- **FR29:** System delivers the generated cover letter to the user via email
- **FR30:** System updates a job record to reflect cover letter generation and delivery status
- **FR31:** User can view the generated cover letter in the job detail view
- **FR33:** User can see a visual cover letter status indicator on a job's table row

## Non-Functional Requirements

### Reliability

- App starts successfully with `bun start` on every launch with no manual intervention
- Database migrations complete without error on a clean install and are idempotent on subsequent starts
- Sheets sync is atomic with respect to user-owned fields — a failed or interrupted sync must not partially overwrite `applied`, `status`, `status_override`, or `cover_letter_sent_at`
- No crashes or instability during standard daily-use sessions

### Performance

- Pipeline and Tracker table views render up to 500 job records without perceptible lag
- Detail drawer opens without noticeable delay (data already in client state)
- Sheets sync for up to 200 rows completes within 10 seconds under normal network conditions

### Security

- OAuth tokens and IMAP credentials stored only in `.env` on the local filesystem — never committed, logged, or exposed via API response
- Hono API server binds to `localhost` only — not network-accessible
- `.env.example` documents all required variables without real credential values

### Integration

- The `/ingest` endpoint accepts a documented JSON schema; Sheets column mapping changes are reflected in a single mapping layer only
- Sheets API OAuth 2.0 calls include token refresh handling — expired tokens produce a clear error, not silent failure
- *(Post-MVP)* n8n webhook callbacks to Hono include a shared secret for basic request authentication
- *(Post-MVP)* Compound key email matching uses normalized, lowercase title comparison + ±3 day window against `date_applied` as the default strategy
