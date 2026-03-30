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

---
