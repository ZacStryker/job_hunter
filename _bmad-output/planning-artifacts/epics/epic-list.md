# Epic List

## Epic 1: Working Application Foundation
User can clone the repo, run `bun start`, and see a live (empty) dashboard with migrations applied — the full stack is wired and running.
**FRs covered:** FR22, FR23, FR24
**NFRs addressed:** NFR1, NFR2, NFR9
**Architecture:** Project scaffold via `bun create hono@latest`, Drizzle schema + Zod shared types, TanStack stack wired, shadcn initialized, dev/prod scripts working

## Epic 2: Data Ingestion & Sheets Sync
User can sync job records from Google Sheets into the dashboard — jobs land in SQLite, user-owned fields are protected, and feedback is clear on success or failure.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6
**NFRs addressed:** NFR3, NFR7, NFR8, NFR10, NFR11, NFR12

## Epic 3: Pipeline View — Job Triage at a Glance
User can scan all jobs in a dense, color-coded pipeline table with fit score badges and action chips — including column visibility toggling and view switching to Tracker tab.
**FRs covered:** FR7, FR8, FR9, FR10, FR11, FR12
**UX-DRs:** UX-DR1–4, UX-DR8–9, UX-DR11, UX-DR13–16
**NFRs addressed:** NFR5, NFR6

## Epic 4: Job Detail & Decision — The Triage Moment
User can click any job row to open the full detail drawer — reading AI analysis, marking applied, overriding status — with all changes persisting across re-syncs.
**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21
**UX-DRs:** UX-DR6, UX-DR10, UX-DR12

## Epic 5: Tracker View — Monitoring Applied Applications
User can switch to the Tracker view and see applied jobs with visual row aging that communicates staleness without an explicit "ghosted" label.
**FRs covered:** FR13, FR14, FR15
**UX-DRs:** UX-DR5

## Epic 6 (Post-MVP): Email Status Detection
System polls IMAP inbox, matches emails to job records, and auto-updates application status — visible in the job detail drawer.
**FRs covered:** FR25, FR26, FR27, FR32
**NFRs addressed:** NFR13, NFR14

## Epic 7 (Post-MVP): Cover Letter Generation Pipeline
User can trigger cover letter generation for any job — delivered via email, tracked in the drawer, with status indicator visible in the table row.
**FRs covered:** FR28, FR29, FR30, FR31, FR33

## Epic 8 (Post-MVP): Field Visibility & Archive
User can see additional job data fields (date scraped, status) in the pipeline table and archive irrelevant jobs to keep active views focused.
**FRs covered:** FR34, FR35 (fulfilled), FR36, FR37, FR38

## Epic 24: Authentication & Multi-User Data Foundation
Users can register with an invite key, activate via email, and log in — with all existing features operating correctly in a fully per-user isolated context.
**FRs covered:** FR-A1, FR-A2, FR-A3, FR-A4, FR-A11
**NFRs addressed:** NFR-A1, NFR-A2, NFR-A3, NFR-A5
**UX:** UX-AUTH1, UX-AUTH2, UX-AUTH3, UX-AUTH4, UX-AUTH5, UX-AUTH13, UX-AUTH14
**Architecture:** New DB tables (users, invite_keys, user_secrets, sessions), data isolation migration (0002), auth/admin middleware, CSRF, crypto module, mailer module, public auth routes, AuthFormCard

## Epic 25: User Onboarding
After first login, a new user completes a 4-step guided setup — Anthropic API key (live-tested, hard-gated), IMAP configuration (soft-gated, skippable) — and lands on a functional personal dashboard; onboarding never shown again.
**FRs covered:** FR-A5
**NFRs addressed:** NFR-A1, NFR-A6
**UX:** UX-AUTH6 (StepIndicator), UX-AUTH7 (ConnectionTestButton), UX-AUTH8 (API key step), UX-AUTH9 (IMAP step)
**Architecture:** Onboarding API routes, per-user secrets encryption, onboarding completion gate in auth middleware

## Epic 26: Admin User Management
Admin can view all users, toggle active status, send password reset emails with session invalidation, edit user profiles in a drawer, impersonate any user with a persistent amber banner and one-click exit, and manage invite keys.
**FRs covered:** FR-A6, FR-A7, FR-A8, FR-A9, FR-A10, FR-A12
**UX:** UX-AUTH10 (admin user table), UX-AUTH11 (ImpersonationBanner), UX-AUTH12 (confirmation dialogs)
**Architecture:** Admin API routes (GET/PATCH /api/admin/users/:id, POST /api/admin/impersonate/:id, POST /api/admin/impersonate/exit, GET/POST/DELETE /api/admin/invite-keys), admin middleware

## Epic 27: Production Deployment
The app runs on Linode behind Nginx with TLS, reachable from the internet; Docker Compose manages lifecycle; SQLite is volume-mounted; first-deploy bootstrap creates the admin account automatically.
**FRs covered:** (operational — no new user-facing FRs)
**NFRs addressed:** NFR-A4, NFR-A6
**Architecture:** Dockerfile, docker-compose.yml, Nginx config, .env.example update, import.meta.dirname path fix, first-deploy bootstrap script

## Epic 28: HITLOBSTER Rebrand
Every surface where the app was called "Job Hunt Dashboard" — the UI, browser tab, package metadata, localStorage, and production infrastructure — now reads "HITLOBSTER."
**FRs covered:** (rebrand — display name, package name, localStorage key, Docker volume)
**NFRs addressed:** non-destructive volume migration, operator migration checklist

## Epic 29: Per-User LinkedIn Authentication
Users store their own LinkedIn Playwright session state encrypted in `user_secrets`. Discovery decrypts it at runtime, writes it to a temp file per-request, and passes `storageStatePath` to the scraper. Users without LinkedIn auth configured see a clear error instead of a 500. A Config > Connections upload section lets users provide their session file.
**FRs covered:** (net-new — multi-user LinkedIn auth)
**NFRs addressed:** NFR-A1 (per-user secrets isolation), NFR-A6 (graceful degradation)
**Architecture:** Extends `user_secrets` pattern; removes `AUTH_DIR` global constant; adds `PUT /api/onboarding/linkedin`; discovery-service writes temp file per-request

## Epic 30: LinkedIn In-App Browser Authentication
Users can connect their LinkedIn account entirely within the browser — no local tools, no file downloads, no server access required. "Connect LinkedIn" in Config > Connections opens a modal with a live remote browser; the server detects login completion and captures the session automatically. Replaces the file-upload flow from Epic 29.4.
**FRs covered:** FR1–FR10 (net-new — replaces Epic 29.4 file-upload)
**NFRs addressed:** NFR1 (session isolation), NFR2 (process cleanup), NFR3 (screenshot rate)
**Architecture:** `linkedin-browser-service.ts` (in-memory session Map, Playwright lifecycle); WebSocket screenshot streaming at ≤5fps; 960×1200 viewport with coordinate mapping; `encrypt()` / `user_secrets` pattern from Epic 29.3

## Epic 31: Scraper Reliability & Bot Detection Hardening
Operators can run discovery across LinkedIn, Indeed, and Arc without bot-detection failures, locale fingerprinting signals, or concurrency bottlenecks. All scrapers use a consistent Firefox-first browser strategy with a properly pooled Firefox instance.
**FRs covered:** FR1 (LinkedIn fetchers → Firefox), FR2 (locale parameterization), FR3 (Firefox pool), FR4 (temp file race + retry reduction), FR6 (Arc → Firefox)
**NFRs addressed:** NFR1–3, NFR5
**Source:** Scraper Bot Detection & Reliability Investigation Report, 2026-05-08

## Epic 32: Webhook Run Recording Hotfix
Webhook-triggered discovery runs are recorded correctly in the database. The `input_tokens` schema drift is resolved and the startup migration runner is verified to catch future drift.
**FRs covered:** FR5 (webhook_runs schema drift)
**NFRs addressed:** NFR4 (idempotent migration)
**Source:** Scraper Bot Detection & Reliability Investigation Report, 2026-05-08
**Priority:** Currently broken in production — fix immediately

## Epic 35: Config Section Navigation Refactor
User can navigate the Config section through a persistent left nav (Profile, Job Sources, Prompts, Logs). Each section has an overview page with status-badged tiles that drill into subpages. Flat `/config`, standalone `/profile`, `/prompts`, and `/logs` routes are replaced by a `/config/*` hierarchy.
**Source:** User request 2026-05-18
**Priority:** Medium — UX improvement; Story 35.3 adds new inbox folder mapping DB table

## Epic 37: Docker Dependency Layer Separation
Operators deploy new code in seconds. Playwright browsers, system packages, and node_modules live in a pre-built local `hitlobster-deps` base image that rebuilds only when dependencies change. The main `Dockerfile` derives from that base and copies only application code.
**Source:** User request 2026-05-18
**Priority:** High — every deploy currently waits 7–10 min on Playwright downloads

## Epic 38: Config UX Polish — Labels, Tooltips, Breadcrumbs & Expanded Nav
Users see clearer, action-oriented labels in the Config section (Candidate Info, Analyze Jobs, Generate Cover Letter, Generate Resume), get one-sentence help tooltips on every section card, navigate with breadcrumbs at the top of the content area, and the left nav always shows an expanded tree with visually distinct parent and child entries.
**Source:** User request 2026-05-21
**Priority:** Medium — UX improvement; no backend or API changes required

---

## Epic 39: Add Job with Manual Description
Users can add a job to the pipeline with a pasted job description — either alongside a URL or with no URL at all. When a description is pre-populated at creation time, the analysis flow uses it directly and skips the scraper.
**Source:** User request 2026-05-26
**Priority:** Medium — UX and reliability improvement; no DB migration required

---
