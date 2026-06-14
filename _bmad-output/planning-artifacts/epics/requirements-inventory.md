# Requirements Inventory

> **Reconciled 2026-06-14** with the current PRD (`prd.md`, HITLOBSTER) and the shipped epics/specs (epics 1–8, 24–44 + implementation specs). This supersedes the original Google Sheets / n8n inventory. FR IDs match the PRD. The FR Coverage Map at the bottom traces each requirement to the epic (and spec) that delivered it.

## Functional Requirements

**Data Discovery & Analysis**
- FR1: User can trigger Discovery to query their enabled job-board sources in parallel and store new job listings (LinkedIn is the only reliable source today; the source layer is designed to add more)
- FR2: System deduplicates discovered jobs by `externalJobId` and excludes jobs from blacklisted companies
- FR3: System inserts discovered jobs with `analysisStatus = pending` and never overwrites user-owned fields (`applied`, `status`, `status_override`, `archived`, `cover_letter_sent_at`)
- FR3a: System assigns each newly discovered job a relevance score at insert time via embedding cosine similarity against the user's cached resume embedding (no Anthropic call)
- FR3b: System streams discovered jobs into the table per source as each source completes
- FR4: User can trigger Analysis to process all `pending` records — fetch full description, call the Anthropic API for fit score, requirements met/missed, recommendation
- FR4a: User can add a job manually by pasting a job description (with or without a URL); Analysis uses the stored description and skips the scraper
- FR5: User receives feedback on Discovery and Analysis completion showing counts added/analyzed
- FR5a: User can view a history of Discovery and Analysis runs, including per-run statistics (analyzed, matched, archived)
- FR6: System reports Discovery/Analysis failures with an error message naming the failed source or cause, without modifying existing data
- FR6a: Discovery requires a configured candidate profile/resume — Discover is unavailable until the profile is set

**Job Pipeline View**
- FR7: User can view all job records in a tabular pipeline view displaying up to 500 records
- FR8: User can see each job's fit score and relevance score as color-coded, sortable indicators
- FR9: User can see each job's AI-recommended action (skip/investigate/apply) as a visual chip
- FR10: User can switch between Pipeline view and Tracker view
- FR11: User can toggle visibility of optional columns and resize columns; Location and Type are separate columns
- FR11a: User can filter the dashboard by applied state (Applied / Unapplied / All) and by archived state
- FR12: System persists column visibility, sizing, and filter preferences across browser sessions

**Job Tracker View**
- FR13: User can view applied jobs with status, date applied, and days elapsed, with visual row aging communicating staleness

**Job Detail & Decision**
- FR16: User can open a detailed record view for any job from the table
- FR17: User can view the complete AI analysis (relevance score, fit score breakdown, requirements met/missed, explanation)
- FR18: User can view the original job description and source URL
- FR19: User can mark a job as applied, with state persisting across re-syncs
- FR20: User can manually set or override application status
- FR21: User can view a chronological timeline of status events
- FR21a: User can blacklist a job's company directly from the detail drawer

**Archive**
- FR-AR1: User can archive a job from the detail drawer; archived jobs are excluded from default Pipeline/Tracker views
- FR-AR2: User can archive multiple jobs at once (bulk archive)
- FR-AR3: User can view archived jobs via the archived filter; system records the archive date per job

**Application Setup & Configuration**
- FR22: System automatically runs database migrations on startup without manual intervention
- FR23: System reads operational secrets and deployment settings from environment variables; per-user application settings are managed at runtime in the Config section
- FR24: Operator can run the full application (API + UI) as a single deployable unit via Docker Compose

**Candidate Profile**
- FR-P1: User can manage a structured candidate profile — personal details + repeatable websites list, and six experience sections (jobs, education, projects, certifications, licences, awards) with per-entry add/delete
- FR-P2: User can record a skills set as part of the profile
- FR-P3: Saving the profile refreshes the user's cached resume embedding so relevance scores reflect the current profile
- FR-P4: The structured profile is the single source consumed by relevance scoring, fit analysis, cover-letter generation, and resume generation

**Configuration Section**
- FR-C1: User can navigate a Config section (Profile, Job Sources, Prompts, Logs), each with an overview page and subpages
- FR-C2: User can configure discovery searches (roles, locations) and view which sources are enabled
- FR-C3: User can view and edit the AI prompts for each flow (analysis, cover letter, resume), with defaults provided
- FR-C4: User can enter and update their Anthropic API key and IMAP inbox settings, including inbox folder mapping
- FR-C5: User can view discovery and analysis run logs from the Config section

**Job Source Connections**
- FR-L1: User can connect their LinkedIn account through an in-app browser session, stored encrypted per user; a file-upload fallback is available
- FR-L2: Discovery uses the user's own LinkedIn session at runtime; a user without LinkedIn configured receives a "LinkedIn not connected" message rather than a failed run

**User Accounts & Access Control**
- FR-A1: Any visitor can access the public landing page without authentication
- FR-A2: Users can register with a valid invite key and email address
- FR-A3: System sends an activation email on registration; accounts inactive until the link is clicked
- FR-A4: Users log in with email + password; sessions persist across browser sessions
- FR-A5: Users complete onboarding (Anthropic API key required; IMAP optional) before accessing the app
- FR-A6: Admins can view all user accounts in a list
- FR-A7: Admins can toggle a user's active status
- FR-A8: Admins can reset a user's password (sends email, invalidates session)
- FR-A9: Admins can edit a user's name, email, and account type
- FR-A10: Admins can impersonate any user for debugging and support
- FR-A11: System scopes all job data, email events, cover letters, resumes, profile, and settings to the owning user
- FR-A12: Admins can generate, view, and revoke invite keys
- FR-A13: Admins can delete a user account and its associated data
- FR-A14: Admins can globally enable/disable discovery sources; disabled sources are hidden from all users' search config and flagged on existing rows

**Email Status Integration**
- FR25: System polls a user's IMAP inbox for job-related messages
- FR26: System matches incoming emails to job records by title similarity and application date proximity
- FR27: System automatically updates a job's status based on matched email detection
- FR32: User can view matched email events linked to a job record in the drawer

**Cover Letter Generation**
- FR28: User can trigger cover letter generation for a job, using their structured profile and editable cover-letter prompt
- FR29: System produces the generated cover letter as a downloadable document
- FR30: System updates a job record to reflect cover letter generation and delivery status
- FR31: User can view and manage generated cover letters (incl. company assignment via typeahead) on the Messages page
- FR33: User can see a visual cover letter status indicator on a job's table row

**Resume Generation**
- FR-R1: User can generate a tailored resume for a job from their structured profile
- FR-R2: System generates the resume as canonical JSON, validates it against the schema, injects it into the HTML template, and renders a downloadable PDF
- FR-R3: Resume project entries with a URL render as clickable hyperlinks in the output

**Public Tour Page**
- FR-T1: Any visitor can access a public `/tour` page (workflow overview, interactive demo, FAQ, registration CTA) without authentication

## NonFunctional Requirements

**Reliability**
- NFR1: App starts successfully via `docker compose up` on every deploy with no manual intervention
- NFR2: Database migrations complete without error on clean install and are idempotent on subsequent starts
- NFR3: Discovery, Relevance, and Analysis are safe with respect to user-owned fields — a failed/interrupted run must not partially overwrite them
- NFR4: Discovery is resilient to source bot-detection and transient failures — a failed source does not abort the whole run; runs can be retried
- NFR5: App handles continuous use of up to 4 hours without crashes or unhandled errors

**Performance**
- NFR6: Pipeline and Tracker table views render up to 500 job records within 500ms
- NFR7: Detail drawer opens within 100ms (data already in client state)
- NFR8: Relevance scoring at discovery adds no Anthropic API cost and does not block the table from rendering newly inserted jobs
- NFR9: Analysis of up to 20 pending records completes within 60 seconds under normal network and Anthropic API conditions

**Security**
- NFR10: Per-user IMAP credentials and Anthropic API keys stored with strong symmetric encryption at rest; key from environment; never returned to client (presence flag only)
- NFR11: Sessions protected against client-side script access; server-side session state only
- NFR12: All routes require authentication; admin routes require admin role
- NFR13: Application served over HTTPS; API server not exposed directly to the public internet
- NFR14: Invite keys required for registration; accounts inactive until email verification link is clicked
- NFR15: App handles multiple concurrent users without crashes or data cross-contamination between accounts

**Integration**
- NFR16: Each scraper source's query contract is encapsulated in the Discovery service; schema changes reflected in a single per-source mapping layer
- NFR17: Anthropic API calls handle rate limits and model errors — failures produce a descriptive error and set `analysisStatus = failed`, not silent corruption
- NFR18: Resume generation validates LLM output against the canonical schema before rendering — contract drift fails fast
- NFR19: Email-to-job matching is tolerant of minor title variations and anchored to application date (normalized lowercase title + ±3-day window)

## Additional Requirements

From Architecture — implementation constraints that remain in force:

- **Zod shared schema:** `src/shared/schemas.ts` is the single source of truth for all types across layers
- **Drizzle camelCase config:** `casing: 'camelCase'` so query results auto-map snake_case → camelCase
- **TanStack Query key shapes (frozen):** `['jobs']` for list, `['jobs', id]` for single
- **Error response shape (frozen):** all errors return `{ error: string }`
- **Date format:** ISO 8601 strings throughout — never Unix timestamps or Date objects in API responses
- **No direct fetch in components:** all data access via hooks in `src/client/hooks/`
- **Path resolution:** use `import.meta.dirname` (not `process.cwd()`) — unreliable in Docker

**Multi-Tenancy & Auth (Epics 24–27)**
- **New DB tables:** `users`, `invite_keys`, `user_secrets` (per-user encrypted secrets incl. Anthropic key, IMAP, LinkedIn session), `sessions`
- **Data isolation:** all user-scoped queries MUST include `where(eq(table.userId, ctx.get('userId')))`; userId never accepted from request body/params
- **Encryption module:** `crypto.ts` AES-256-GCM; all `user_secrets` I/O via this module; ciphertext stored as `hex_iv:hex_ciphertext:hex_authTag`
- **Auth/Admin middleware:** session cookie → `ctx.set('userId')`, 401 on invalid; admin role check → 403 on `/api/admin/*`
- **Password hashing:** argon2id
- **Hono binding:** `0.0.0.0` in production Docker (behind Nginx); `127.0.0.1` in dev only
- **Bootstrap:** first deploy creates admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; idempotent
- **Deployment:** Docker Compose on Linode; Nginx TLS via Let's Encrypt; SQLite volume-mounted; split `hitlobster-deps` base image for fast deploys (Epic 37)

**Pipeline, Profile & Materials (Epics 39–44)**
- **Discovery sources:** scraper service for LinkedIn (reliable), Indeed/Arc (being hardened, Epic 31); Firefox-first browser strategy with pooled instances
- **Relevance pre-scoring:** `relevance_score` column + `user_embeddings` table; embedding-service + resume-embedding-cache; in-process `@xenova/transformers` path (spike-gated) with Python sidecar fallback (Epic 40)
- **Company blacklist:** `company_blacklist` table (`user_id`, lowercased `company_name`, unique); discovery filters it (Epic 41)
- **Profile:** `profile_data TEXT` JSON column; `profileDataSchema` (`personal` + six `experience` sections); all four downstream services read the structured shape (Epic 43)
- **Resume:** canonical flat `resumeDataSchema`; LLM → JSON → schema validation → Sage HTML template → Playwright PDF; contract-drift guard (Epic 42)
- **Run recording:** `webhook_runs` records discovery/analysis runs incl. `matchedCount`/`archivedCount` (Epic 32, spec-analysis-run-job-column-stats)

## UX Design Requirements

The dashboard UX system (dark zinc palette, `ScoreBadge`, `ActionChip`, `AgingRow`, `AssessmentSection`, `JobDrawer`, table density, column-visibility dropdown, inline feedback, skeleton/empty states, default fit-score sort) is defined in the UX design specification and remains in force, with these reconciled updates:

- **Discover/Analyze controls** replace the original single Sheets `SyncButton` — separate Discover and Analyze actions, each with idle/loading/success/error states and inline (non-toast) result feedback (counts added/analyzed)
- **Relevance column** sits beside Fit Score in the Jobs table and as a sibling card in the drawer
- **Empty state** copy reflects discovery, not Sheets ("No jobs yet — run Discover to pull listings")
- **Resizable columns + split Location/Type** columns; cell `overflow-hidden` preserved (typeahead dropdowns portal out to escape clipping)
- **Applied (Applied/Unapplied/All) and Archived** filter selectors on the dashboard
- **Config section** left-nav UX (Profile, Job Sources, Prompts, Logs) with overview tiles, breadcrumbs, tooltips, expanded nav (Epics 35, 38)
- **Auth/onboarding/admin UX** (`AuthFormCard`, `StepIndicator`, `ConnectionTestButton`, admin user table, `ImpersonationBanner`, confirmation dialogs, form a11y) per Epics 24–26
- **Public Tour page** UX (hero, scroll-driven feature sections, interactive Matches demo, FAQ, CTA) per Epic 44

## FR Coverage Map

| FR | Delivered By | Notes |
|---|---|---|
| FR1 | Discovery pipeline (supersedes Epic 2 Sheets sync); Epic 31 | Multi-source scraper; LinkedIn reliable today |
| FR2 | Discovery pipeline; Epic 41 | `externalJobId` dedup + blacklist filter |
| FR3 | Discovery pipeline | Field-ownership invariant |
| FR3a | Epic 40 | Relevance pre-score at insert |
| FR3b | spec-stream-per-source-discovery-inserts | Per-source streaming inserts |
| FR4 | Analysis pipeline | Anthropic fit scoring |
| FR4a | Epic 39 | Manual add-job with pasted description |
| FR5 | Discovery/Analysis pipeline | Result feedback |
| FR5a | Epic 32; spec-analysis-run-job-column-stats | Run history + per-run stats |
| FR6 | Discovery/Analysis pipeline | Failure handling |
| FR6a | Epic 40 | Discover requires profile/resume |
| FR7–FR10 | Epic 3 | Pipeline table, badges, chips, view switch |
| FR11 | Epic 3; spec-resizable-columns; spec-split-location-type-column | Column visibility/resize/split |
| FR11a | spec-dashboard-applied-filter-selector; spec-dashboard-archived-filter-selector | Applied/Archived filters |
| FR12 | Epic 3 | localStorage persistence |
| FR13 | Epic 5 | Tracker view + visual row aging |
| FR16–FR21 | Epic 4 | Detail drawer, analysis, applied, override, timeline |
| FR21a | Epic 41 | Blacklist from drawer |
| FR-AR1 | Epic 8 | Archive from drawer |
| FR-AR2 | spec-bulk-archive-jobs | Bulk archive |
| FR-AR3 | Epic 8; spec-add-date-archived-field; spec-dashboard-archived-filter-selector | Archived filter + archive date |
| FR22 | Epic 1 | Boot migrations |
| FR23 | Epic 1; Config section (Epic 35) | Env secrets + runtime config |
| FR24 | Epic 27; Epic 37 | Docker Compose deploy |
| FR-P1–FR-P2 | Epic 43; spec-profile-skills-field | Structured profile + skills |
| FR-P3–FR-P4 | Epic 43; Epic 40 | Profile feeds embedding + all AI flows |
| FR-C1–FR-C2 | Epic 35; Epic 38 | Config nav + searches |
| FR-C3 | Epic 35 (Story 35.5) | Editable per-flow prompts |
| FR-C4 | Epic 25; Epic 35 (Story 35.3) | API key + IMAP + inbox mapping |
| FR-C5 | Epic 35 (Story 35.6) | Logs/run history page |
| FR-L1–FR-L2 | Epic 29; Epic 30 | Per-user LinkedIn auth (upload + in-app browser) |
| FR-A1–FR-A5 | Epics 24–25 | Auth + onboarding |
| FR-A6–FR-A11 | Epic 26; Epic 24 | Admin management + data isolation |
| FR-A12 | Epic 26 | Invite-key management |
| FR-A13 | spec-admin-delete-user | Delete user |
| FR-A14 | spec-admin-global-disable-search-sources | Global source enable/disable |
| FR25–FR27, FR32 | Epic 6 | IMAP polling, matching, status, email events |
| FR28–FR31, FR33 | Epic 7; spec-fix-messages-company-typeahead | Cover letter / Messages |
| FR-R1–FR-R3 | Epic 42; spec-project-url-resume-hyperlink; spec-fix-resume-production-path-and-error-surfacing | Resume generation + hyperlinks |
| FR-T1 | Epic 44 | Public Tour page |
