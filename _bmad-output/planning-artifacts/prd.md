---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete', 'step-e-01-discovery', 'step-e-02-review', 'step-e-03-edit']
inputDocuments:
  - '_bmad-output/brainstorming/brainstorming-session-2026-03-26-1400.md'
workflowType: 'prd'
workflow: 'edit'
classification:
  projectType: web_app
  domain: general
  complexity: medium
  projectContext: greenfield
briefCount: 0
researchCount: 0
brainstormingCount: 1
projectDocsCount: 0
lastEdited: '2026-06-14'
editHistory:
  - date: '2026-06-14'
    changes: 'Validation-driven fixes (overall status Warning → Pass): closed the FR4a orphan by adding a manual add-job beat to Journey 2 (+ capabilities line and summary-table row); replaced unmeasurable "clear" in FR6 and FR-L2 with testable phrasing (names failed source/cause; "LinkedIn not connected"); documented SEO-out-of-scope for the public Tour page in Web Application Requirements.'
  - date: '2026-06-14'
    changes: 'Source accuracy pass: corrected the PRD to reflect that LinkedIn is the only reliable discovery source today (Indeed/Arc exist but are being hardened) rather than implying all three work; added "source-agnostic discovery" as the Future goal and additional-sources hardening to Active. Updated Executive Summary, Measurable Outcomes, Scope, Journey 2, and FR1.'
  - date: '2026-06-14'
    changes: 'Reconciliation with shipped reality (epics 28–44 + 16 specs): rebranded to HITLOBSTER; reframed two-phase pipeline as three-phase (added Relevance pre-scoring); restructured Product Scope into Delivered/Active/Future; raised complexity to medium; dropped Firefox-only/desktop-only constraints; replaced ".env-only config" with runtime Config section. Added capabilities: relevance pre-scoring (FR3a/FR6a), per-source streaming (FR3b), manual add-job (FR4a), run history (FR5a), resizable/split columns + applied/archived filters (FR8/FR11/FR11a), blacklist (FR2/FR21a), archive (FR-AR1–3), candidate profile (FR-P1–4), Config section + editable prompts (FR-C1–5), LinkedIn connection (FR-L1–2), resume generation (FR-R1–3), public Tour page (FR-T1), admin delete/source-gating (FR-A13/FR-A14). Promoted cover letter + email status out of post-MVP. Updated Journeys 2/4/5/6, added Journey 7 (Profile & Materials), refreshed summary table, Innovation, NFRs (Docker deploy, relevance/scraper reliability) and Risk Mitigation.'
  - date: '2026-04-26'
    changes: 'Multi-user platform expansion: updated Executive Summary, classification footer, Architecture Overview, Implementation Constraints, Journey 4, Functional Requirements (added FR-A1–FR-A11), Security NFR, and Layout/Accessibility to reflect hosted multi-user deployment on Linode.'
  - date: '2026-04-26'
    changes: 'Validation-driven edits: removed visual aging feature (FR14, FR15, design decision #2, Innovation #1, Success Criterion, MVP scope, Journey 1 narrative); added Journey 6 (Admin User Management) to close FR-A6–FR-A10 orphan FRs; added multi-user onboarding success criterion; updated Journey Requirements Summary table; fixed FR actor violations (FR-A1–FR-A3, FR-A11); fixed FR-A5 IMAP gate inconsistency; rewrote FR7, FR13, FR26; fixed unmeasurable NFRs (performance thresholds, reliability definition); lifted implementation details from Security/Integration NFRs.'
  - date: '2026-04-26'
    changes: 'Pipeline architecture update: replaced all Google Sheets and n8n references with self-contained Discovery and Analysis pipeline (scraper API + Anthropic API direct calls); rewrote Executive Summary, design decisions, Product Scope, Journeys 2/3/5, FR1–FR6 section, FR23, FR29, Success Criteria, NFRs (Reliability, Performance, Integration), Risk Mitigation, and Innovation section.'
---

# Product Requirements Document — HITLOBSTER

**Author:** Stryker
**Date:** 2026-03-26

## Executive Summary

**HITLOBSTER** (hitlobster.com) is a hosted, multi-user web application that serves as a **decision surface for job hunting** — not a data entry tool or tracker. Job records are discovered, pre-screened, and analyzed directly within the application across a three-phase pipeline: Discovery queries job-board sources (LinkedIn is the working source today; the source layer is built to be source-agnostic) for new listings; a lightweight Relevance pre-score (resume-embedding cosine similarity, no LLM call) flags obvious mismatches before any spend; Analysis fetches each listing's full description and calls the Anthropic API to compute fit scores, requirements met/missed, and a skip/investigate/apply recommendation. The dashboard surfaces that intelligence so the user can make fast, informed triage decisions. The app also generates tailored cover letters and resumes from a structured candidate profile, and detects application status from IMAP email. Built for a small group of invited users; deployed on Linode via Docker behind Nginx. Each user manages their own jobs, profile, connections, API key, and prompts independently.

**Target User:** Individual job seeker who wants AI-powered job scoring, pre-screening, and tailored application materials without external pipeline dependencies. The app discovers, scores, analyzes, and presents job listings end-to-end, and produces the resume and cover letter for each application.

**Problem Solved:** Job hunting creates sustained decision fatigue. Existing trackers require manual data entry and offer no analytical signal — they record what happened, not what to do. HITLOBSTER inverts the model: discovery, pre-screening, and AI analysis run automatically as part of the app, the dashboard displays the conclusion, and the user decides — then generates the application materials in the same place.

### What Makes This Special

Three design decisions set this apart from generic job trackers:

1. **Three-phase pipeline with cost-aware pre-screening** — Discovery, Relevance pre-scoring, and Analysis run as separate, explicit steps. Discovery pulls raw listings (`analysisStatus = pending`); a local embedding model scores each job against the user's resume at insert time (no Anthropic spend), so obvious mismatches can be archived before Analysis; Analysis then calls the Anthropic API only on the jobs worth scoring. The dashboard is a decision surface after the pipeline completes.

2. **Profile-driven application materials** — A structured candidate profile (personal details, jobs, education, projects, certifications, licences, awards, skills) is the single source feeding every AI flow: relevance embedding, fit analysis, cover-letter generation, and tailored resume generation (canonical JSON → HTML template → PDF).

3. **Strict data ownership boundary** — Scraper sources own scraped columns (`sourceUrl`, `dateScraped`, `source`, `location`); the Analysis pipeline owns scored columns (`fitScore`, `recommendation`, `requirementsMet`, etc.); user-state columns (`applied`, `status`, `status_override`, `archived`, `cover_letter_sent_at`) are never overwritten by Discovery, Relevance, or Analysis runs.

**Classification:** Web Application · SPA (React + Vite) · Hosted on Linode (Docker + Nginx) · multi-user · Greenfield · Medium complexity

## Success Criteria

### User Success

- User makes a triage decision (skip/investigate/apply) on any job record within 10 seconds of opening the dashboard, without touching any other tool
- Applied status, manual status overrides, and archive state persist correctly across sessions and re-syncs
- Discovery, Relevance, and Analysis runs complete without overwriting any user-set fields (`applied`, `status`, `status_override`, `archived`)
- Relevance pre-scoring lets the user archive obvious mismatches before Analysis, so Anthropic spend is concentrated on jobs worth scoring
- Detail drawer displays complete job record — relevance score, fit score breakdown, reqs met/missed, Claude's explanation, source URL, status timeline — with no missing data
- User generates a tailored cover letter and resume for an application without leaving the app
- A new invited user activates their account, completes onboarding, and reaches a functional dashboard in under 5 minutes

### Business Success

*(Personal tool — success measured by personal utility, not commercial metrics)*

- Replaces manual job board browsing and spreadsheet tracking entirely; zero need to open external tools for daily job triage
- Becomes the primary interface for every job application decision and the source of every application's resume and cover letter from day one

### Technical Success

- App starts reliably via `docker compose up` on every deploy — migrations run on boot without intervention
- Discovery runs are idempotent — repeated runs produce no duplicate records (`externalJobId` deduplication)
- Discovery, Relevance, and Analysis failures produce an error message naming the failed source or cause and leave all existing data unmodified
- All user-state fields survive a full Discover → Relevance → Analyze cycle
- Per-user data isolation holds — no user can read or mutate another user's jobs, profile, secrets, or settings

### Measurable Outcomes

- **Discovery:** Discover triggers parallel queries across the user's enabled sources (LinkedIn today); new jobs insert with a relevance score and `analysisStatus = pending`; runs are recorded in run history
- **Analysis:** Analyze processes pending jobs via the Anthropic API; results write fit score, reqs met/missed, and recommendation to the record
- **Triage UI:** Jobs table renders color-coded relevance and fit badges, action chips, resizable columns, and Applied/Archived filters; column state persists per user
- **Detail & decision:** Drawer opens with the full record; applied toggle, status override, blacklist, and archive write to SQLite; status timeline visible
- **Application materials:** User generates a cover letter and a tailored resume PDF from their profile for any job
- **Production:** Runs reliably on Linode under Docker behind Nginx/TLS for multiple invited users — no crashes, no data loss on re-discover

## Product Scope

### Delivered

**Pipeline & triage**
1. Bun + Hono + SQLite + Drizzle stack with boot migrations
2. Discovery service — Discover triggers parallel queries across the user's enabled sources (LinkedIn is the working source today), deduplicates by `externalJobId`, inserts new records with `analysisStatus = pending`; runs recorded in run history; result feedback shows added count
3. Relevance pre-scoring — each newly discovered job is scored at insert time by resume-embedding cosine similarity (local model, no Anthropic call); relevance appears as a sortable column and drawer card
4. Analysis service — Analyze processes all `pending` records: fetches full job description, calls the Anthropic API for fit score, requirements met/missed, recommendation; writes results to DB
5. Jobs table (TanStack Table + shadcn/ui) — relevance and fit score badges, action chip (skip/investigate/apply), resizable columns, split Location/Type columns, column visibility toggle, Applied/Unapplied/All and Archived filters
6. Tracker view — status, applied date, days since application, visual row aging
7. Detail drawer (`<Sheet>`) — relevance + fit breakdown, reqs met/missed, Claude's explanation, job description, source URL, applied toggle, status override, blacklist toggle, archive, status timeline
8. Add job manually — create a job from a pasted description (with or without a URL); Analysis uses the stored description and skips the scraper
9. Archive workflow — archive from the drawer, bulk archive, dedicated Archived filter, date-archived tracking

**Profile & application materials**
10. Structured candidate profile — personal details + websites, jobs, education, projects, certifications, licences, awards, skills; single source for all AI flows
11. Cover letter / Messages — generate per job from the profile, track status, edit per row, company typeahead
12. Resume generation — canonical JSON schema → HTML template (Sage) → PDF; project-URL hyperlinks

**Accounts, config & operations**
13. Multi-user auth — invite-key registration, email activation, login/logout, password reset, per-user data isolation
14. Onboarding — 4-step guided setup (Anthropic API key hard-gated; IMAP soft-gated)
15. Config section — Profile, Job Sources (searches, connections, blacklist), editable per-flow Prompts, API keys, inbox mapping, Logs/run history
16. Per-user LinkedIn authentication — in-app browser session capture (and file upload), session stored encrypted in `user_secrets`
17. Company blacklist — exclude companies from future discovery; manage in Config and from the drawer
18. Admin — user list, active toggle, password reset, profile edit, impersonation, invite-key management, delete user, global enable/disable of discovery sources
19. IMAP email status detection — poll inbox, fuzzy title + date matching, automatic status updates, email events in drawer
20. Public Tour page — unauthenticated `/tour` marketing page (hero, feature sections, interactive demo, FAQ, CTA)
21. Production deployment — Docker Compose on Linode behind Nginx/TLS; split deps base image for fast deploys; first-deploy admin bootstrap

### Active

- Scraper reliability & bot-detection hardening — Firefox-first strategy, pooled Firefox instances, locale/timezone parameterization; LinkedIn is the working source today
- Additional job-board sources — Indeed and Arc scrapers exist but are not yet reliable; hardening them is in progress
- Config UX polish — clearer labels, card tooltips, breadcrumbs, expanded nav

### Future

- **Source-agnostic discovery** — generalize the scraper layer so new job boards can be added without bespoke per-source work; the platform aims to be source-agnostic rather than LinkedIn-bound
- IMAP IDLE for push-like email detection
- SSE streaming for cover letter / resume generation (token-by-token in drawer)
- Cover letter and resume version history
- Scheduled/automatic discovery runs beyond manual and webhook triggers

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

He hits **Discover**. A spinner. The service fires parallel queries to his configured source — LinkedIn — for his configured roles and locations. As each query returns, jobs stream into the table. Eight seconds later: "23 new jobs found," and the run lands in his run history. Each job already shows a **relevance score** — scored at insert time against his resume embedding, no Anthropic call yet — but a grey fit badge: `pending`.

He sorts by relevance. Six jobs score near zero — wrong stack entirely. He bulk-archives them before spending a cent on analysis. Seventeen left.

He hits **Analyze**. The analysis service works through the 17 pending records — fetching each full description, calling the Anthropic API to score it. A progress indicator updates: "Analyzing 17 jobs… 8/17." Half a minute later: "17 jobs analyzed." The grey badges resolve to red, yellow, and green. Four greens. He switches to triage mode.

A colleague had emailed him a role that never showed up on LinkedIn. He clicks **Add Job**, pastes the description, and saves it — no URL needed. It lands in the table as `pending`; on the next Analyze it scores directly from the pasted text, no scraper involved.

He spot-checks a job he applied to yesterday: `applied: true`, `status: "Applied"` — intact. Neither Discover, Relevance, nor Analyze touched it.

He runs Discover again. "0 new jobs found." Same listings, same `externalJobId` values — deduplication held.

**Capabilities revealed:** Discover across multiple sources, per-source streaming inserts, relevance pre-scoring at insert time, bulk archive, manual add-job with pasted description, Analyze button, Anthropic API scoring, run history, `externalJobId` deduplication, mutable field protection, idempotent behavior.

---

### Journey 3: Edge Case — Scraper Service Unavailable

*Stryker hits Discover. The scraper API is unreachable.*

The dashboard shows: "Discovery failed — scraper service unavailable. No data was modified." His existing records are untouched. He retries after a minute. Discovery completes cleanly.

**Capabilities revealed:** Graceful discovery error handling, atomic-or-nothing write behavior, clear error messaging, scraper API failure detection.

---

### Journey 4: First-Time User Setup (Operations / Configuration)

*Alex lands on hitlobster.com and receives an invite key from the admin.*

He hits the **Tour** page first — a scroll-driven walkthrough of the discover → score → match → apply → track workflow, with a live demo of the Matches view. Convinced, he clicks **Get started**. The registration form asks for his invite key, email, and a password. The form submits: "Check your email — an activation link has been sent."

The activation email arrives within a minute. He clicks the link. His account is activated and he's redirected to onboarding.

**Step 1 of 4 — Welcome.** A brief explanation of what the app does. He clicks Next.

**Step 2 of 4 — Anthropic API Key.** He pastes his API key. A live test call runs: "Connection verified." He can't continue until it passes. He clicks Next.

**Step 3 of 4 — IMAP Setup.** He enters his IMAP credentials. A test connection runs: "Connected." *(He could skip this and configure it later.)* He clicks Next.

**Step 4 of 4 — Done.** "You're set up." He clicks Go to Dashboard.

The Jobs table loads — empty until he discovers jobs. Before his first Discover, he opens **Config**: he fills in his candidate profile, connects LinkedIn through the in-app browser (no file downloads, no server access), and confirms his search sources. Now Discover is enabled.

*Time from invite key to live dashboard: under 5 minutes.*

**Capabilities revealed:** Public Tour page, invite-key registration, email activation, hard-gated API key onboarding, soft-gated IMAP, candidate profile setup, in-app LinkedIn connection, per-user dashboard isolation.

---

### Journey 5: Data Flow — Scraper-to-Dashboard (Integration Path)

*Stryker hits Discover. The Discovery service fires parallel queries across his enabled sources.*

Each query returns a list of job listings with `externalJobId`, `title`, `company`, `source`, `location`, `sourceUrl`, and `dateScraped`. The service deduplicates the combined results by `externalJobId` — any listing already in the DB, and any company on his blacklist, is skipped. Each surviving listing is embedded and scored against his cached resume embedding (cosine similarity) and inserted with a `relevanceScore` and `analysisStatus = pending`. No Anthropic call has happened yet.

He hits Analyze. For each pending record, the Analysis service fetches the full job description (or uses a pre-stored description for manually added jobs), then calls the Anthropic API with the job description and his structured profile. The response includes `fitScore`, `requirementsMet`, `requirementsMissed`, `recommendation`, and `explanation`. These are written to the job record; `analysisStatus` is set to `done`. User-owned fields (`applied`, `status`, `status_override`, `archived`) are never touched.

**Capabilities revealed:** Multi-source query contract, blacklist + `externalJobId` deduplication, relevance embedding at insert time, three-tier field ownership, Anthropic API scoring call, `analysisStatus` lifecycle.

---

### Journey 6: Admin User Management (Operations)

*The admin receives a support request: a user says they can't log in.*

She opens the dashboard and navigates to the **Admin** panel. A list of all registered users appears — name, email, account type, active status, registration date. She finds the user: account shows "inactive." She toggles **Active** to enabled. The user can now log in.

A second user emails: forgotten password. The admin clicks **Reset Password** — the user receives a reset email; their current session is invalidated.

She notices a third user's email is outdated — registered with a personal address, now on a work email. She clicks **Edit** and updates it.

A fourth user reports their pipeline isn't loading correctly. The admin clicks **Impersonate** next to their row. She's now browsing as that user — she can see their pipeline and settings, identifies a misconfigured IMAP credential, and returns to her own session.

Indeed scraping has been failing platform-wide. From the admin panel she **globally disables the Indeed source** — every user's search config now hides it and existing rows referencing it show a "Disabled by Admin" badge. Later, a departed user asks to be removed entirely; she **deletes** their account and all associated data.

**Capabilities revealed:** User management list, active status toggle, password reset with email notification and session invalidation, user profile editing, admin impersonation with return-to-admin, global discovery-source enable/disable, user deletion.

---

### Journey 7: Profile & Application Materials (Generation Path)

*Stryker found a green-badge job he wants to apply to.*

Earlier he filled in his **candidate profile** under Config — personal details and websites, then his jobs, education, projects, certifications, licences, and awards, each section with its own Add and Delete controls. Saving it refreshed his resume embedding (so relevance scores reflect the current profile) and gave every downstream AI flow the same structured source.

From the job drawer he clicks **Generate Cover Letter**. The app calls the Anthropic API with the job description and his profile, using his editable cover-letter prompt; the result appears on the Messages page, where he tweaks the company field via typeahead and tracks delivery status.

He clicks **Generate Resume**. The service asks the LLM for a canonical JSON document, validates it against the schema, injects it into the Sage HTML template, and renders a PDF — project entries with URLs become clickable hyperlinks. He downloads it and applies, then toggles **Applied** on the job.

**Capabilities revealed:** Structured candidate profile (six experience sections with per-entry add/delete), profile save refreshes resume embedding, editable per-flow prompts, cover-letter generation + Messages tracking, resume generation (JSON → template → PDF) with project hyperlinks.

---

### Journey Requirements Summary

| Capability Area | Revealed By |
|---|---|
| Jobs table + relevance/fit score + action badge + resizable/split columns + filters | Journey 1, 2 |
| Tracker view + applied date + days elapsed + row aging | Journey 1 |
| Detail drawer + applied toggle + status override + blacklist + archive | Journey 1, 2 |
| Discover (multi-source) + Analyze + result feedback + run history | Journey 2 |
| Relevance pre-scoring at insert time + bulk archive | Journey 2, 5 |
| Manual add-job with pasted description (scraper skipped) | Journey 2 |
| Idempotent upsert with mutable field protection (`externalJobId` + blacklist dedup) | Journey 2, 5 |
| Graceful discovery error handling + scraper service failure detection | Journey 3 |
| Public Tour page + invite-key registration + email activation + onboarding | Journey 4 |
| Candidate profile setup + in-app LinkedIn connection + per-user isolation | Journey 4, 7 |
| Boot migrations + Docker/Linode deployment | Journey 4 |
| Multi-source query contract + relevance embedding + `analysisStatus` lifecycle | Journey 5 |
| User management list + active toggle + password reset + profile editing + impersonation | Journey 6 |
| Global discovery-source enable/disable + user deletion | Journey 6 |
| Candidate profile (six experience sections) + editable prompts | Journey 7 |
| Cover-letter generation + Messages tracking | Journey 7 |
| Resume generation (JSON → template → PDF) with project hyperlinks | Journey 7 |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Three-Phase Pipeline with Cost-Aware Pre-Screening (In-App AI)**
Discovery, Relevance pre-scoring, and Analysis run as explicit, separate steps within the app. Discovery stores raw listings; a local embedding model scores each job against the user's resume at insert time (no Anthropic call); Analysis calls the Anthropic API only on jobs worth scoring. The dashboard is a pure decision surface after the pipeline — no real-time AI inference on the UI path. Pre-screening directly reduces token spend by letting users archive obvious mismatches before Analysis.

**2. Canonical Resume Contract**
Resume generation aligns three artifacts against one canonical flat JSON schema — the LLM prompt emits it, a schema validates it, and the HTML template consumes it — so the prompt, data, and template stay provably in sync and the rendered PDF is deterministic.

### Validation Approach

- **Three-phase pipeline:** Validated at first Discover → Analyze run — sources must return `externalJobId`-keyed records; the embedding model must produce a relevance score at insert time; the Anthropic API must return parseable fit score JSON.
- **Resume contract:** Validated by schema check between LLM output and template input — drift fails fast rather than rendering a broken PDF.

### Risk Mitigation

- Scraper schema changes: field mapping in the Discovery service is the single point of change — not the UI's concern.
- Embedding runtime risk: the embedding path was spike-validated before production code; a sidecar fallback exists if the in-process model is unavailable.

## Web Application Requirements

### Architecture Overview

Single-page application served by Hono. All UI state in React; all persistence in SQLite via Hono API routes. Deployed on Linode under Docker Compose behind Nginx with TLS. Session-based authentication with invite-key registration. Multi-user with Admin and Standard account types. A public, unauthenticated Tour page lives alongside the authenticated app.

- **SPA:** React + Vite handles routing client-side. Hono serves the built bundle as static assets and exposes the API under `/api/*`.
- **Public surface:** The `/tour` route and the auth screens (landing, register, login, activation) are reachable without a session; everything under the app shell requires authentication.
- **Production:** Docker Compose manages the container lifecycle; SQLite is volume-mounted; Nginx terminates TLS. A split deps base image keeps deploys fast.
- **Dev mode:** `bun run dev` runs Vite dev server + Hono API as split processes with hot reload on both sides.

### Browser & Device Support

Modern evergreen browsers (Chromium, Firefox, Safari, latest). The authenticated dashboard is information-dense and optimized for desktop; the public Tour page is responsive. Modern CSS and JS features may be used freely.

SEO is out of scope for the public Tour page — it is a conversion surface reached by invited prospects, not an organically discovered marketing site; no indexing, sitemap, or content strategy is required.

### Accessibility

Beyond shadcn/ui defaults: auth, onboarding, and admin surfaces communicate state via icon/text plus color (never color alone), label every input, and announce errors and impersonation status to assistive tech.

### Implementation Constraints

- Most configuration is managed at runtime per user through the Config section (profile, job sources, connections, prompts, API keys, inbox mapping); only operational secrets and deployment settings come from environment variables
- Column and filter state persisted to `localStorage` (per user)
- No service worker, offline mode, or PWA features

## Risk Mitigation

### Technical Risks

- *Scraper service availability* — Discovery and Analysis depend on the scraper API being reachable. Mitigate: clear error messages on unreachable or error responses; operations are idempotent and can be retried.
- *Anthropic API rate limits* — Analysis calls the Anthropic API once per job record. Mitigate: failed records are set to `analysisStatus = failed` and can be re-queued; rate limit errors produce descriptive messages.

- *Relevance embedding runtime* — the in-process embedding model may not load under the target runtime. Mitigate: the embedding path was spike-validated before production code, with a sidecar fallback if the in-process model is unavailable.

### Data Risks

- *Email-to-job matching* — job title strings may differ between the database record and the email body (e.g., "Senior Engineer" vs "Sr. Engineer"). Matching strategy: fuzzy title comparison (normalized, lowercase, abbreviation-expanded) **plus** email received datetime within ±3 days of `date_applied` from the database. Date anchoring is the primary false-positive reducer.

## Functional Requirements

### Data Discovery & Analysis

- **FR1:** User can trigger Discovery to query their enabled job-board sources in parallel and store new job listings in the database (LinkedIn is the only reliable source today; the source layer is designed to add more)
- **FR2:** System deduplicates discovered jobs by `externalJobId` and excludes jobs from blacklisted companies — records already in the database or on the user's blacklist are skipped
- **FR3:** System inserts discovered jobs with `analysisStatus = pending` and never overwrites user-owned fields (`applied`, `status`, `status_override`, `archived`, `cover_letter_sent_at`) on any ingestion path
- **FR3a:** System assigns each newly discovered job a relevance score at insert time by computing embedding cosine similarity against the user's cached resume embedding, with no Anthropic API call
- **FR3b:** System streams discovered jobs into the table per source as each source completes, rather than only after all sources finish
- **FR4:** User can trigger Analysis to process all `pending` records — fetching full job descriptions and calling the Anthropic API to compute fit score, requirements met/missed, and recommendation
- **FR4a:** User can add a job manually by pasting a job description (with or without a source URL); Analysis uses the stored description and skips the scraper
- **FR5:** User receives feedback on Discovery and Analysis completion showing counts of records added and records analyzed
- **FR5a:** User can view a history of Discovery and Analysis runs, including per-run statistics (jobs analyzed, matched, archived)
- **FR6:** System reports Discovery and Analysis failures with an error message that names the failed source or cause, and leaves all existing data unmodified
- **FR6a:** Discovery requires a configured candidate profile/resume — the Discover action is unavailable until the user's profile is set, so relevance scoring has an embedding to compare against

### Job Pipeline View

- **FR7:** User can view all job records in a tabular pipeline view displaying up to 500 records
- **FR8:** User can see each job's fit score and relevance score as color-coded visual indicators, each sortable
- **FR9:** User can see each job's AI-recommended action (skip/investigate/apply) as a visual chip
- **FR10:** User can switch between Pipeline view and Tracker view
- **FR11:** User can toggle visibility of optional columns and resize columns; Location and Type are shown as separate columns
- **FR11a:** User can filter the dashboard by applied state (Applied / Unapplied / All) and by archived state
- **FR12:** System persists column visibility, sizing, and filter preferences across browser sessions

### Job Tracker View

- **FR13:** User can view applied jobs with their application status, date applied, and days elapsed since application

### Job Detail & Decision

- **FR16:** User can open a detailed record view for any job by selecting it from the table
- **FR17:** User can view the complete AI analysis for a job (relevance score, fit score breakdown, requirements met, requirements missed, Claude's explanation)
- **FR18:** User can view the original job description and source URL for any job
- **FR19:** User can mark a job as applied, with that state persisting across re-syncs
- **FR20:** User can manually set or override the application status for any job
- **FR21:** User can view a chronological timeline of status events for a job record
- **FR21a:** User can blacklist a job's company directly from the detail drawer, excluding it from future discovery

### Archive

- **FR-AR1:** User can archive a job from the detail drawer; archived jobs are excluded from the default Pipeline and Tracker views
- **FR-AR2:** User can archive multiple jobs at once (bulk archive)
- **FR-AR3:** User can view archived jobs via the archived filter, and the system records the date each job was archived

### Application Setup & Configuration

- **FR22:** System automatically runs database migrations on startup without manual intervention
- **FR23:** System reads operational secrets and deployment settings (encryption key, session secret, SMTP, scraper credentials, app URL) from environment variables; per-user application settings are managed at runtime through the Config section
- **FR24:** Operator can run the full application (API + UI) as a single deployable unit via Docker Compose

### Candidate Profile

- **FR-P1:** User can manage a structured candidate profile — personal details plus a repeatable websites list, and six experience sections (jobs, education, projects, certifications, licences, awards), each with per-entry add and delete controls
- **FR-P2:** User can record a skills set as part of the profile
- **FR-P3:** Saving the profile refreshes the user's cached resume embedding so subsequent relevance scores reflect the current profile
- **FR-P4:** The structured profile is the single source consumed by relevance scoring, fit analysis, cover-letter generation, and resume generation

### Configuration Section

- **FR-C1:** User can navigate a Config section organized into Profile, Job Sources, Prompts, and Logs, each with an overview page and subpages
- **FR-C2:** User can configure discovery searches (roles, locations) and view which sources are enabled
- **FR-C3:** User can view and edit the AI prompts used for each flow (analysis, cover letter, resume), with defaults provided
- **FR-C4:** User can enter and update their Anthropic API key and IMAP inbox settings, including inbox folder mapping
- **FR-C5:** User can view discovery and analysis run logs from the Config section

### Job Source Connections

- **FR-L1:** User can connect their LinkedIn account through an in-app browser session, with the captured session stored encrypted per user; a file-upload fallback is also available
- **FR-L2:** Discovery uses the user's own LinkedIn session at runtime; a user without LinkedIn configured receives a message stating LinkedIn is not connected rather than a failed run

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
- **FR-A11:** System ensures all job data, email events, cover letters, resumes, profile, and settings are scoped to the owning user
- **FR-A12:** Admins can generate, view, and revoke invite keys for controlling new user registration
- **FR-A13:** Admins can delete a user account and its associated data
- **FR-A14:** Admins can globally enable or disable discovery sources; disabled sources are hidden from all users' search config and flagged on existing rows that reference them

### Email Status Integration

- **FR25:** System polls a user's IMAP email inbox for job-related messages
- **FR26:** System matches incoming emails to job records based on title similarity and application date proximity
- **FR27:** System automatically updates a job's status based on matched email detection
- **FR32:** User can view matched email events linked to a job record in the detail drawer

### Cover Letter Generation

- **FR28:** User can trigger cover letter generation for a specific job record, using their structured profile and editable cover-letter prompt
- **FR29:** System produces the generated cover letter as a downloadable document
- **FR30:** System updates a job record to reflect cover letter generation and delivery status
- **FR31:** User can view and manage generated cover letters, including company assignment via typeahead, on the Messages page
- **FR33:** User can see a visual cover letter status indicator on a job's table row

### Resume Generation

- **FR-R1:** User can generate a tailored resume for a job from their structured profile
- **FR-R2:** System generates the resume as canonical JSON, validates it against the schema, injects it into the HTML template, and renders a downloadable PDF
- **FR-R3:** Resume project entries that include a URL render as clickable hyperlinks in the output

### Public Tour Page

- **FR-T1:** Any visitor can access a public `/tour` page without authentication that presents HITLOBSTER's workflow, an interactive demo, FAQ, and a registration call to action

## Non-Functional Requirements

### Reliability

- App starts successfully via `docker compose up` on every deploy with no manual intervention
- Database migrations complete without error on a clean install and are idempotent on subsequent starts
- Discovery, Relevance, and Analysis are safe with respect to user-owned fields — a failed or interrupted run must not partially overwrite `applied`, `status`, `status_override`, `archived`, or `cover_letter_sent_at`
- Discovery is resilient to source bot-detection and transient failures — a failed source does not abort the whole run, and runs can be retried
- App handles continuous use of up to 4 hours without crashes or unhandled errors

### Performance

- Pipeline and Tracker table views render up to 500 job records within 500ms
- Detail drawer opens within 100ms (data already in client state)
- Relevance scoring at discovery adds no Anthropic API cost and does not block the table from rendering newly inserted jobs
- Analysis of up to 20 pending records completes within 60 seconds under normal network and Anthropic API conditions

### Security

- Per-user IMAP credentials and Anthropic API keys stored with strong symmetric encryption at rest; encryption key from environment; never returned to client
- Sessions protected against client-side script access; server-side session state only
- All routes require authentication; admin routes require admin role
- Application served over HTTPS; API server not exposed directly to the public internet
- Invite keys required for registration; accounts inactive until email verification link is clicked
- `.env.example` documents all required variables without real credential values

### Integration

- Each scraper source's query contract is encapsulated in the Discovery service; schema changes are reflected in a single mapping layer per source
- Anthropic API calls include error handling for rate limits and model errors — failures produce a descriptive error and set `analysisStatus = failed`, not silent corruption
- Resume generation validates LLM output against the canonical schema before rendering — contract drift fails fast rather than producing a broken document
- Email-to-job matching is tolerant of minor title variations and anchored to application date
