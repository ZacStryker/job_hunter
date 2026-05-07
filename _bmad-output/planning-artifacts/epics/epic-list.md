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

---
