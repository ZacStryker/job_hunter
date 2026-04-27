---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsSelected:
  prd: _bmad-output/planning-artifacts/prd.md
  architecture_distillate: _bmad-output/planning-artifacts/architecture-distillate.md
  architecture_full: _bmad-output/planning-artifacts/architecture.md
  epics_index: _bmad-output/planning-artifacts/epics/index.md
  epics:
    - _bmad-output/planning-artifacts/epics/epic-1-working-application-foundation.md
    - _bmad-output/planning-artifacts/epics/epic-2-data-ingestion-sheets-sync.md
    - _bmad-output/planning-artifacts/epics/epic-3-pipeline-view-job-triage-at-a-glance.md
    - _bmad-output/planning-artifacts/epics/epic-4-job-detail-decision-the-triage-moment.md
    - _bmad-output/planning-artifacts/epics/epic-5-tracker-view-monitoring-applied-applications.md
    - _bmad-output/planning-artifacts/epics/epic-6-post-mvp-email-status-detection.md
    - _bmad-output/planning-artifacts/epics/epic-7-post-mvp-cover-letter-generation-pipeline.md
    - _bmad-output/planning-artifacts/epics/epic-8-field-visibility-and-archive.md
    - _bmad-output/planning-artifacts/epics/epic-24-authentication-and-multi-user-data-foundation.md
    - _bmad-output/planning-artifacts/epics/epic-25-user-onboarding.md
    - _bmad-output/planning-artifacts/epics/epic-26-admin-user-management.md
    - _bmad-output/planning-artifacts/epics/epic-27-production-deployment.md
  ux_index: _bmad-output/planning-artifacts/ux-design-specification/index.md
  ux_auth: _bmad-output/planning-artifacts/ux-design-specification/auth-onboarding-admin-ux.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-27
**Project:** bmad

---

## Document Inventory

| Type | File | Date |
|---|---|---|
| PRD | `prd.md` | Apr 26 |
| Architecture (distillate) | `architecture-distillate.md` | Apr 26 |
| Architecture (full) | `architecture.md` | Apr 26 |
| Epics Index | `epics/index.md` | Apr 26 |
| Epic 1 | `epics/epic-1-working-application-foundation.md` | Mar 30 |
| Epic 2 | `epics/epic-2-data-ingestion-sheets-sync.md` | Mar 30 |
| Epic 3 | `epics/epic-3-pipeline-view-job-triage-at-a-glance.md` | Mar 30 |
| Epic 4 | `epics/epic-4-job-detail-decision-the-triage-moment.md` | Mar 30 |
| Epic 5 | `epics/epic-5-tracker-view-monitoring-applied-applications.md` | Mar 30 |
| Epic 6 | `epics/epic-6-post-mvp-email-status-detection.md` (post-MVP) | Mar 30 |
| Epic 7 | `epics/epic-7-post-mvp-cover-letter-generation-pipeline.md` (post-MVP) | Mar 30 |
| Epic 8 | `epics/epic-8-field-visibility-and-archive.md` | Apr 7 |
| Epic 24 | `epics/epic-24-authentication-and-multi-user-data-foundation.md` | Apr 26 |
| Epic 25 | `epics/epic-25-user-onboarding.md` | Apr 26 |
| Epic 26 | `epics/epic-26-admin-user-management.md` | Apr 26 |
| Epic 27 | `epics/epic-27-production-deployment.md` | Apr 26 |
| UX Index | `ux-design-specification/index.md` | Apr 26 |
| UX Auth/Onboarding | `ux-design-specification/auth-onboarding-admin-ux.md` | Apr 26 |

**Issues:** None — no duplicate conflicts, no missing required documents.

---

## PRD Analysis

### Functional Requirements

**Data Discovery & Analysis**
- FR1: User can trigger Discovery to query the scraper API with 6 parallel searches (LinkedIn + Indeed) and store new job listings in the database
- FR2: System deduplicates discovered jobs by `externalJobId` — records already in the database are skipped
- FR3: System inserts discovered jobs with `analysisStatus = pending` and never overwrites user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`) on any ingestion path
- FR4: User can trigger Analysis to process all `pending` records — fetching full job descriptions from the scraper and calling the Anthropic API to compute fit score, requirements met/missed, and recommendation
- FR5: User receives feedback on Discovery and Analysis completion showing counts of records added and records analyzed
- FR6: System reports Discovery and Analysis failures with a clear error message without modifying any existing data

**Job Pipeline View**
- FR7: User can view all job records in a tabular pipeline view displaying up to 500 records
- FR8: User can see each job's fit score as a color-coded visual indicator
- FR9: User can see each job's AI-recommended action (skip/investigate/apply) as a visual chip
- FR10: User can switch between Pipeline view and Tracker view
- FR11: User can toggle visibility of optional columns (reqs met count, reqs missed count, notes)
- FR12: System persists column visibility preferences across browser sessions

**Job Tracker View**
- FR13: User can view applied jobs with their application status, date applied, and days elapsed since application

**Job Detail & Decision**
- FR16: User can open a detailed record view for any job by selecting it from the table
- FR17: User can view the complete AI analysis for a job (fit score breakdown, requirements met, requirements missed, Claude's explanation)
- FR18: User can view the original job description and source URL for any job
- FR19: User can mark a job as applied, with that state persisting across re-syncs
- FR20: User can manually set or override the application status for any job
- FR21: User can view a chronological timeline of status events for a job record

**Application Setup & Configuration**
- FR22: System automatically runs database migrations on startup without manual intervention
- FR23: System reads all configuration (`SCRAPER_URL`, `SCRAPER_TOKEN`, `ANTHROPIC_API_KEY`, and other service credentials) from environment variables
- FR24: User can start the full application (API + UI) with a single command

**User Accounts & Access Control**
- FR-A1: Any visitor can access the public landing page without authentication
- FR-A2: Users can register with a valid invite key and email address
- FR-A3: System sends an activation email on registration; accounts remain inactive until the activation link is clicked
- FR-A4: Users log in with email + password; sessions persist across browser sessions
- FR-A5: Users complete onboarding (Anthropic API key required; IMAP configuration optional) before accessing the app
- FR-A6: Admins can view all user accounts in a list
- FR-A7: Admins can toggle a user's active status
- FR-A8: Admins can reset a user's password (sends email, invalidates current session)
- FR-A9: Admins can edit a user's name, email, and account type
- FR-A10: Admins can impersonate any user for debugging and support
- FR-A11: System ensures all job data, email events, cover letters, and settings are scoped to the owning user

**Post-MVP: Email Status Integration**
- FR25: System polls an IMAP email inbox for job-related messages
- FR26: System matches incoming emails to job records based on title similarity and application date proximity
- FR27: System automatically updates a job's status based on matched email detection
- FR32: User can view matched email events linked to a job record in the detail drawer

**Post-MVP: Cover Letter Generation**
- FR28: User can trigger cover letter generation for a specific job record
- FR29: System provides the generated cover letter as a downloadable `.docx` file
- FR30: System updates a job record to reflect cover letter generation and delivery status
- FR31: User can view the generated cover letter in the job detail view
- FR33: User can see a visual cover letter status indicator on a job's table row

**Total MVP FRs:** 33 (FR1–FR13 [excl. 14/15], FR16–FR24, FR-A1–FR-A11)
**Total Post-MVP FRs:** 9 (FR25–FR33)

---

### Non-Functional Requirements

**Reliability**
- NFR-R1: App starts successfully with `bun start` on every launch with no manual intervention
- NFR-R2: Database migrations complete without error on clean install and are idempotent on subsequent starts
- NFR-R3: Discovery and Analysis are safe with respect to user-owned fields — a failed or interrupted run must not partially overwrite `applied`, `status`, `status_override`, or `cover_letter_sent_at`
- NFR-R4: App handles continuous use of up to 4 hours without crashes or unhandled errors

**Performance**
- NFR-P1: Pipeline and Tracker table views render up to 500 job records within 500ms
- NFR-P2: Detail drawer opens within 100ms (data already in client state)
- NFR-P3: Analysis of up to 20 pending records completes within 60 seconds under normal network and Anthropic API conditions

**Security**
- NFR-S1: Per-user IMAP credentials and Anthropic API keys stored with strong symmetric encryption at rest; encryption key from environment; never returned to client
- NFR-S2: Sessions protected against client-side script access; server-side session state only
- NFR-S3: All routes require authentication; admin routes require admin role
- NFR-S4: Application served over HTTPS; API server not exposed directly to the public internet
- NFR-S5: Invite keys required for registration; accounts inactive until email verification link is clicked
- NFR-S6: `.env.example` documents all required variables without real credential values

**Integration**
- NFR-I1: The scraper API query contract is encapsulated in the Discovery service; schema changes are reflected in a single mapping layer only
- NFR-I2: Anthropic API calls include error handling for rate limits and model errors — failures produce a descriptive error and set `analysisStatus = failed`, not silent corruption
- NFR-I3 (Post-MVP): Email-to-job matching is tolerant of minor title variations and anchored to application date

**Total NFRs:** 16 (4 Reliability, 3 Performance, 6 Security, 3 Integration)

---

### Additional Requirements / Constraints

- Browser support: Firefox latest only — no cross-browser polyfills
- Layout: Desktop-only; dense table UI; no responsive adaptation
- Accessibility: shadcn/ui defaults only
- Column visibility persisted to `localStorage`
- No service worker, offline mode, or PWA features
- All config via `.env` — no runtime config UI
- Deployment: Linode, behind Nginx with TLS
- Session: server-side session state; invite-key + email activation registration flow
- Multi-user with Admin and Standard account types
- FR14 and FR15 (visual aging) removed from scope

---

### PRD Completeness Assessment

**Strengths:**
- Requirements are numbered, actor-correct, and outcome-focused
- Auth expansion (FR-A1–FR-A11) is comprehensive for a multi-user hosted deployment
- NFRs have measurable thresholds (500ms render, 100ms drawer, 60s analysis)
- Data ownership boundary (Discovery/Analysis never touching user-owned fields) is stated as both FR and NFR

**Observations:**
- FR numbering skips FR14, FR15 (intentional — removed feature); no gaps otherwise
- FR32 is out-of-sequence (placed after FR27 in post-MVP email section) — minor inconsistency
- Invite key generation/management is not explicitly covered as an FR (admin creates invite keys) — may be implied by admin management journey but absent from FR list

---

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement (summary) | Epic / Story | Status |
|---|---|---|---|
| FR1 | Trigger Discovery — scraper API, 6 parallel queries, store new jobs | Epic 2 (Google Sheets sync) | ⚠️ STALE |
| FR2 | Deduplicate by `externalJobId` | Epic 2 (compound key company+title) | ⚠️ STALE |
| FR3 | Insert with `analysisStatus=pending`, never overwrite user-owned fields | Epic 2 Story 2.1 (mutable field protection) | ⚠️ STALE context |
| FR4 | Trigger Analysis — fetch full description from scraper, call Anthropic API, write fit score | **NOT FOUND in any epic** | ❌ MISSING |
| FR5 | Feedback on Discovery/Analysis completion showing counts | Epic 2 Story 2.3 (Sync button feedback) | ⚠️ STALE |
| FR6 | Report failures with clear error without modifying data | Epic 2 Story 2.1/2.3 | ⚠️ STALE |
| FR7 | Tabular pipeline view up to 500 records | Epic 3 Story 3.2 | ✓ |
| FR8 | Fit score as color-coded visual indicator | Epic 3 Story 3.2 | ✓ |
| FR9 | AI-recommended action chip (skip/investigate/apply) | Epic 3 Story 3.2 | ✓ |
| FR10 | Switch between Pipeline and Tracker views | Epic 3 Story 3.4 | ✓ |
| FR11 | Toggle visibility of optional columns | Epic 3 Story 3.3 | ✓ |
| FR12 | Persist column visibility across browser sessions | Epic 3 Story 3.3 | ✓ |
| FR13 | Tracker view with status, date applied, days elapsed | Epic 5 Story 5.1 | ✓ (story omits "days elapsed" column) |
| FR16 | Open detail record view for any job | Epic 4 Story 4.1 | ✓ |
| FR17 | View complete AI analysis in drawer | Epic 4 Story 4.2 | ✓ |
| FR18 | View original job description and source URL | Epic 4 Story 4.2 | ✓ |
| FR19 | Mark job as applied with persistence across re-syncs | Epic 4 Story 4.3 | ✓ |
| FR20 | Manually set or override application status | Epic 4 Story 4.3 | ✓ |
| FR21 | Chronological status timeline | Epic 4 Story 4.4 | ✓ |
| FR22 | Auto-run DB migrations on startup | Epic 1 Story 1.2 | ✓ |
| FR23 | Read all config from env vars (SCRAPER_URL, SCRAPER_TOKEN, ANTHROPIC_API_KEY) | Epic 1 Story 1.3 (lists Google OAuth vars) | ⚠️ STALE |
| FR24 | Start full app with single command | Epic 1 Story 1.1 | ✓ |
| FR-A1 | Public landing page without auth | Epic 24 Story 24.4 | ✓ |
| FR-A2 | Register with invite key + email | Epic 24 Story 24.2 | ✓ |
| FR-A3 | Activation email; inactive until clicked | Epic 24 Story 24.2 | ✓ |
| FR-A4 | Email+password login; persistent sessions | Epic 24 Story 24.2 | ✓ |
| FR-A5 | Onboarding gate (Anthropic key required, IMAP optional) | Epic 25 | ✓ |
| FR-A6 | Admins view all user accounts | Epic 26 Story 26.1 | ✓ |
| FR-A7 | Admins toggle user active status | Epic 26 Story 26.2 | ✓ |
| FR-A8 | Admins reset password (email + session invalidation) | Epic 26 Story 26.1 | ✓ |
| FR-A9 | Admins edit user name, email, account type | Epic 26 Story 26.1 | ✓ |
| FR-A10 | Admins impersonate any user | Epic 26 Story 26.1/26.2 | ✓ |
| FR-A11 | All data scoped to owning user | Epic 24 Story 24.3 | ✓ |

---

### Missing Requirements

#### ❌ CRITICAL MISSING FR

**FR4: Analysis Service** — User can trigger Analysis to process all `pending` records: fetching full job descriptions from the scraper and calling the Anthropic API to compute fit score, requirements met/missed, and recommendation.

- **Impact:** This is the core AI-scoring feature of the product. Without a story covering it, there are no acceptance criteria for the Analyze button, the scraper full-description fetch, the Anthropic API call contract, the fit score write-back, or `analysisStatus` lifecycle transitions. Implementation begins with no spec.
- **Recommendation:** A new story (or full Epic 2 rewrite) must cover: POST `/api/analyze` endpoint, pending-record queue, scraper full-description API call, Anthropic API call (no SDK, via fetch), structured response parsing (fitScore, requirementsMet, requirementsMissed, recommendation), write-back to DB, per-record error handling (`analysisStatus = failed`), and Analyze button UI with progress feedback.

---

#### ⚠️ STALE — Epic 2 (Full Rewrite Required)

All of Epic 2 describes the old Google Sheets sync model. The current PRD replaced Sheets + n8n with a self-contained scraper API pipeline. Every story in Epic 2 is wrong:

| Story | Current (stale) | Required (per PRD) |
|---|---|---|
| 2.1 | `/api/ingest` with compound key upsert | Discovery service: scraper API queries, `externalJobId` deduplication, `analysisStatus = pending` insert |
| 2.2 | Google Sheets OAuth client + column mapping | Scraper API client: 6 parallel queries (LinkedIn + Indeed), response parsing, dedup logic |
| 2.3 | `/api/sync` endpoint + Sync button UI | Discover button + Analyze button UI; two separate API endpoints; progress feedback for both |

Also missing from Epic 2 scope: Analysis service (see FR4 above) with Anthropic API call.

---

#### ⚠️ STALE — Epic 1 Stories 1.2 and 1.3

- **Story 1.2:** References "Sheets-owned columns" and `company_job_title_idx` unique index. PRD uses `externalJobId` as the dedup key — schema definition must reflect the new column set.
- **Story 1.3:** References Google OAuth env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID`). PRD requires `SCRAPER_URL`, `SCRAPER_TOKEN`, `ANTHROPIC_API_KEY` (and removes Google vars entirely).

---

#### ⚠️ STALE — Epic 5 Story 5.2 (Removed Feature)

Story 5.2 "Visual Row Aging (AgingRow)" implements FR14 and FR15, which were **removed from the PRD** on Apr 26. The story still exists and will be implemented if not removed.

- **Recommendation:** Remove Story 5.2 from Epic 5 and remove FR14/FR15 from the requirements inventory. Update Epic 5's FR coverage to just FR13.

---

#### ⚠️ STALE — Architecture Distillate

Despite an April 26 modified date, the architecture distillate still references:
- Google Sheets, `sheets-sync.ts`, `oauth-client.ts` in project structure
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SPREADSHEET_ID` in required env vars
- `compound key: company_job_title_idx` as the dedup key
- "Sheets-owned vs user-owned" column annotation terminology
- Missing: `SCRAPER_URL`, `SCRAPER_TOKEN`, `ANTHROPIC_API_KEY` in env vars
- Missing: Discovery service and Analysis service in project structure

The distillate must be regenerated against the updated `architecture.md`.

---

#### ⚠️ MINOR GAPS

- **FR13 story gap:** Story 5.1 shows columns `company, job title, status, date applied` but PRD FR13 explicitly requires "days elapsed since application" — story needs a `Days` column.
- **FR29 mismatch:** Epic 7 / requirements-inventory says "deliver cover letter via email" but PRD changed FR29 to "downloadable `.docx` file." Story 7.2 references n8n webhook callback and email delivery — needs updating.
- **Invite key generation FR missing:** No FR covers admin creating/distributing invite keys. The deployment runbook (Story 27.2 step 7) vaguely mentions a "documented admin CLI command or API call" but there is no story for it. Blocked path: an admin cannot onboard new users without a way to generate keys.
- **NFR-P1/P2/P3 measurable thresholds:** requirements-inventory NFR5/NFR6/NFR7 use qualitative language ("without perceptible lag", "without noticeable delay"); PRD has quantified thresholds (500ms, 100ms, 60s). Story ACs should reference the PRD numbers, not the inventory's vague language.

---

### Coverage Statistics

- **Total MVP FRs:** 33
- **Fully covered and aligned:** 26
- **Covered but stale/wrong context (requires update):** 6 (FR1, FR2, FR3, FR5, FR6, FR23)
- **Completely missing:** 1 (FR4 — Analysis service)
- **Coverage %:** 79% fully aligned; 97% nominally claimed

**Orphan epic content (not in PRD):**
- Epic 2 Stories 2.1–2.3: Entirely wrong architecture
- Epic 5 Story 5.2: Removed feature (FR14, FR15)
- Epic 7 Story 7.2 (FR29): Delivery mechanism changed (email → .docx)

---

## UX Alignment Assessment

### UX Document Status

**Found — Comprehensive.** Two UX spec sets present:
1. **Original spec** (`ux-design-specification/` folder, ~10 files, Mar 30) — covers core app UX (pipeline table, tracker view, detail drawer, design system)
2. **Auth/Onboarding/Admin extension** (`auth-onboarding-admin-ux.md`, Apr 26) — covers Epics 24–26 new surfaces

---

### UX ↔ PRD Alignment Issues

**⚠️ UX-DR5 (AgingRow) Documents a Removed Feature**
The original UX spec (requirements-inventory.md) still defines `UX-DR5: AgingRow component — opacity wrapper around TableRow; thresholds: 0–7d=1.0, 8–14d=0.75, 15–21d=0.55, 22+=0.35`. This feature (FR14, FR15) was removed from the PRD on Apr 26. The UX token and its derived `AgingRow` component specification persist. Developers starting from the UX spec will implement this component without knowing it was cut.

**⚠️ UX-DR7 (SyncButton) Maps to Deprecated Architecture**
`UX-DR7` describes a single `SyncButton` component wrapping `useSyncMutation`. The updated PRD requires two separate controls: a **Discover button** (queries scraper API) and an **Analyze button** (calls Anthropic API). No UX spec exists for the Discover or Analyze button states, progress feedback, or their placement in the header bar. This is an actionable UX gap for Epic 2's replacement stories.

**⚠️ UX-DR14 Copy References Google Sheets**
The empty state copy in `UX-DR14` reads: *"No jobs yet. Hit Sync to pull from Google Sheets."* — The Google Sheets integration was removed. The copy must be updated to reflect the Discovery model.

**⚠️ Original User Journey Flows May Be Stale**
`user-journey-flows.md` (Mar 30) documents Journey 2 as "Manual Sync" — a Google Sheets-driven flow. The updated PRD Journey 2 is "Discovery & Analysis Run" — a completely different two-phase flow. The original UX journey specification does not describe the Discovery/Analyze user flow.

---

### UX ↔ Architecture Alignment Issues

**⚠️ Architecture Distillate Missing Discovery/Analysis Service Structure**
The architecture distillate defines `services/sheets-sync.ts` and `services/oauth-client.ts` in the project structure but has no `services/discovery.ts` or `services/analysis.ts`. The UX requires Discovery and Analysis button states and progress feedback, but the architecture hasn't defined the service boundary. This is the same stale-architecture issue noted in Epic Coverage, surfacing again in UX.

**✓ Auth UX ↔ Epic 24–26 Architecture: Well Aligned**
The auth/onboarding UX spec (`auth-onboarding-admin-ux.md`) was authored Apr 26 alongside the epics and is tightly aligned:
- `AuthFormCard` layout spec matches Story 24.4 acceptance criteria
- `StepIndicator` and `ConnectionTestButton` component specs match Story 25.2 criteria exactly
- `ImpersonationBanner` amber strip spec matches Story 26.2 exactly
- Admin table column spec matches Story 26.1/26.2 response shape and Story 26.2 layout criteria
- New shadcn components list (`form`, `input`, `label`, `switch`, `alert`, `dialog`, `avatar`) matches UX-AUTH13

**✓ Mobile-Capable Auth vs Desktop-Only Core: Consistent**
Auth UX spec calls auth form cards "naturally mobile-safe" via `max-w-sm`. Architecture says desktop-only for the core app. These are correctly scoped to different surfaces — no conflict.

**✓ Accessibility Spec ↔ Epic Stories: Aligned**
UX-AUTH14 (form accessibility: `id/htmlFor`, `role="alert"`, `aria-describedby`) is fully echoed in Story 24.4, 25.2, and 26.2 acceptance criteria. UX-AUTH6 (`StepIndicator` ARIA) is implemented in Story 25.2.

---

### Warnings

1. **No UX spec for Discovery/Analyze flow** — The two most important new MVP interactions (Discover button → progress → completion; Analyze button → per-record progress indicator → completion) have no UX documentation. The existing `SyncButton` spec is not applicable. Before Epic 2 stories can be implemented, a UX spec for these two controls is needed.

2. **UX-DR5 will cause orphan implementation** — AgingRow is documented, has opacity thresholds, and has a component name. Without an explicit removal notice in the UX spec, a developer will build it.

3. **UX-DR14 stale copy** — Small but visible; a user will see "Hit Sync to pull from Google Sheets" on an empty dashboard that has no Sheets integration.

---

## Epic Quality Review

### Best Practices Baseline

Stories are evaluated against: user value, independence, no forward dependencies, BDD acceptance criteria, and correct database creation timing.

---

### 🔴 Critical Violations

**1. Epic 2 Implements the Wrong Product (All 3 Stories)**

Epic 2 title ("Data Ingestion & Sheets Sync") and all three stories describe Google Sheets OAuth sync. The PRD replaced this model with a self-contained scraper API pipeline months ago. This is not a stale label — the stories' acceptance criteria are entirely wrong:
- Story 2.1 ACs: `POST /api/ingest`, compound-key upsert, Zod `ingestPayloadSchema` → all obsolete
- Story 2.2 ACs: `GOOGLE_CLIENT_ID`, `oauth-client.ts`, Sheets API v4 → entirely wrong
- Story 2.3 ACs: `POST /api/sync`, Sync button, "0 records added, X updated" → wrong interaction model

A developer executing these stories will build the wrong product. No ACs exist for the scraper API Discovery service or the Anthropic API Analysis service. Epic 2 must be completely rewritten before implementation begins.

**2. Story 1.2 DB Schema Missing Critical Columns**

Story 1.2 defines the `jobs` table with "all Sheets-owned columns" — but the new pipeline model requires columns that are entirely absent:
- `external_job_id` (text, unique, required for `externalJobId` deduplication per FR2)
- `analysis_status` (text: 'pending' | 'done' | 'failed', required for FR3 and FR4)
- `source` (LinkedIn / Indeed source tracking)
- `location` (scraped location field)

Additionally, Story 1.2 defines `uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle)` as the deduplication index. The PRD requires deduplication by `externalJobId` — a different field and a different uniqueness constraint.

A developer building Story 1.2 as written will create a schema that is fundamentally incompatible with the Discovery service defined in the PRD.

**3. FR4 (Analysis Service) Has No Story Anywhere**

As documented in Epic Coverage: the Anthropic API Analysis service — the product's core feature — has zero story coverage. No acceptance criteria exist for:
- The Analyze button (trigger, disabled state, progress indicator)
- `POST /api/analyze` endpoint
- Pending record queue processing
- Scraper full-description API call
- Anthropic API call contract, prompt, and response parsing
- Fit score / requirementsMet / requirementsMissed / recommendation write-back
- Per-record error handling (`analysisStatus = failed`)
- `analysisStatus` lifecycle state machine

This is the most dangerous gap. Implementation cannot proceed on the core MVP value proposition.

---

### 🟠 Major Issues

**4. Story 5.2 — Implements a Removed Feature**

Story 5.2 "Visual Row Aging (AgingRow)" has detailed GWT acceptance criteria for a feature (FR14, FR15) removed from the PRD on Apr 26. The story will be executed if not explicitly removed or marked deprecated.
- **Action:** Remove Story 5.2 from Epic 5. Update Epic 5 goal statement to remove visual aging reference. Update `epic-list.md` to list Epic 5's FRs as just FR13.

**5. Story 7.2 — References Removed n8n Architecture**

Story 7.2 "n8n Webhook Callback & Cover Letter Storage" ACs reference an n8n webhook callback pattern for cover letter delivery. The architecture removed n8n. The PRD changed FR29 to "downloadable `.docx` file." The story's ACs describe a completely different delivery mechanism.
- **Action:** Story 7.2 needs a full rewrite to cover the `.docx` generation endpoint and download trigger.

**6. Missing Story: Invite Key Generation & Management**

There is no story in any epic for creating or distributing invite keys. The entire user onboarding journey (Journey 4) begins "Alex receives an invite key from the admin" — but:
- No epic defines how the admin creates invite keys
- The `invite_keys` table is created in Story 24.1
- Story 27.2 deployment runbook vaguely says "Generate first invite key via a documented admin CLI command or API call" — no endpoint defined, no admin UI story, no acceptance criteria

Without this story, the app is operationally closed: after first deploy, no new users can be invited. This is a functional gap that blocks the entire multi-user value proposition.

**Recommendation:** Add a story to Epic 26 (or Epic 27) covering:
- Admin can generate one or more invite keys via the admin UI (or a defined CLI/API mechanism)
- Generated keys appear in a list with used/unused status
- Invite keys have a configurable expiry

**7. Story 1.3 References Wrong Env Vars**

Story 1.3's AC for `.env.example` lists: `PORT`, `DB_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` as required vars. The current PRD/architecture requires: `SCRAPER_URL`, `SCRAPER_TOKEN`, `ANTHROPIC_API_KEY` instead of the Google vars. Story 27.1 defines the full production env var set but Story 1.3 sets the initial `.env.example` incorrectly.

---

### 🟡 Minor Concerns

**8. Story 5.1 — Missing "Days Elapsed" Column**

Story 5.1 Tracker table AC shows columns: `company, job title, status, date applied`. PRD FR13 explicitly requires "days elapsed since application." The `Days` column is missing from Story 5.1's ACs.

**9. Story 24.4 — Router Update Not Specified**

Story 24.4 adds six new routes (`/login`, `/register`, `/register/pending`, `/onboarding`, `/admin/users`, `/reset`) but the story's ACs don't explicitly specify updating the TanStack Router configuration. Epic 1 Story 1.3 sets up the router with only `/` and `/tracker`. A developer executing Story 24.4 needs to know they're modifying the router — this is implied but not stated.

**10. Story 25.2 — "Never Shown Again" Mechanism Not Owned**

Story 25.2 AC: "clicking Go to Dashboard navigates to / and onboarding is never shown again." The enforcement mechanism (login endpoint returns `onboardingComplete: boolean` → client redirects) is defined in Story 24.2's login ACs. Story 25.2 relies on this cross-story behavior without documenting the dependency. Low risk since both stories are in adjacent epics, but a developer working on Story 25.2 in isolation could miss it.

**11. Story 24.3 and Epic 2 Migration Sequencing**

Story 24.3's `0003_multi_tenancy.sql` adds `user_id` FK to the `jobs` table. If the new Epic 2 replacement stories add `external_job_id` and `analysis_status` columns via their own migration, the migration ordering must be: `0001_initial` → `0002_auth_schema` → `0003_multi_tenancy` → (new Epic 2 migration). The current state has no migration for the new columns; the replacement Epic 2 stories must define it explicitly.

---

### Epic Independence Validation

| Epic | Depends On | Dependency Valid? |
|---|---|---|
| Epic 1 | None | ✓ Standalone |
| Epic 2 (current) | Epic 1 | ✓ (but entire epic is wrong) |
| Epic 3 | Epic 1 | ✓ (can use empty jobs list) |
| Epic 4 | Epics 1, 3 | ✓ |
| Epic 5 | Epics 1, 3 | ✓ (Story 5.1 filters from jobs cache; Story 5.2 dead) |
| Epic 6 (post-MVP) | Epic 1 | ✓ |
| Epic 7 (post-MVP) | Epics 1, 4 | ✓ (but Story 7.2 wrong) |
| Epic 8 (post-MVP) | Epics 1, 3, 4 | ✓ |
| Epic 24 | Epic 1 | ✓ |
| Epic 25 | Epics 1, 24 | ✓ |
| Epic 26 | Epics 1, 24 | ✓ |
| Epic 27 | All prior | ✓ (deployment epic, intentional) |

No circular or forward dependencies detected in the epic relationships.

---

### Database Creation Timing ✓

- `0001_initial.sql` (Epic 1 Story 1.2) — jobs table ✓ (created when first needed)
- `0002_auth_schema.sql` (Epic 24 Story 24.1) — auth tables ✓ (created when auth introduced)
- `0003_multi_tenancy.sql` (Epic 24 Story 24.3) — user_id FK additions ✓ (added when multi-tenancy introduced)
- New columns (`externalJobId`, `analysisStatus`) — must be defined in replacement Epic 2 migration ⚠️ (currently missing)

---

### Starter Template Check ✓

Epic 1 Story 1.1 correctly uses `bun create hono@latest job-hunt-dashboard --template bun` — matches architecture spec exactly.

---

### Quality Summary

| Severity | Count | Description |
|---|---|---|
| 🔴 Critical | 3 | Epic 2 wrong product; Story 1.2 wrong schema; FR4 has no story |
| 🟠 Major | 4 | Story 5.2 dead; Story 7.2 wrong; no invite key story; Story 1.3 wrong env vars |
| 🟡 Minor | 4 | Story 5.1 missing Days column; Story 24.4 router not explicit; Story 25.2 cross-story dependency; migration sequencing gap |

---

## Summary and Recommendations

### Overall Readiness Status

**🔴 NOT READY — Critical blocking issues must be resolved before implementation begins on Epics 24–27.**

Epics 24–27 (the new multi-user expansion) are internally well-structured and ready to implement IF the foundational epics (Epics 1 and 2) are corrected first. The critical problem is that the PRD architecture was updated on Apr 26 to replace Google Sheets with a scraper API pipeline, but the epics, requirements inventory, and architecture distillate that those new epics depend on were not updated to match. A developer beginning implementation today would build the wrong data layer (Google Sheets schema) and have no spec for the core AI Analysis feature.

---

### Critical Issues Requiring Immediate Action

**Before any story execution:**

1. **Rewrite Epic 2 entirely** — Replace all three stories (2.1, 2.2, 2.3) with new stories covering:
   - Story 2.1: Discovery service — `POST /api/discover`, scraper API queries (6 parallel: LinkedIn + Indeed), `externalJobId` deduplication, insert with `analysisStatus = pending`, mutable field protection
   - Story 2.2: Discover button UI — trigger, spinner, count feedback, error handling
   - Story 2.3: Analysis service — `POST /api/analyze`, pending record queue, scraper full-description fetch, Anthropic API call (no SDK), response parsing, DB write-back, per-record error handling (`analysisStatus = failed`)
   - Story 2.4: Analyze button UI — trigger, progress indicator ("Analyzing X/N"), completion feedback, error states

2. **Update Story 1.2 DB schema** — Add `external_job_id` (text, unique), `analysis_status` (text), `source`, `location` columns; change deduplication index from `company_job_title_idx` on (company, job_title) to `unique(external_job_id)`; remove "Sheets-owned" column framing

3. **Update Story 1.3 env vars** — Replace `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` with `SCRAPER_URL`, `SCRAPER_TOKEN`, `ANTHROPIC_API_KEY`; update empty state copy to remove Google Sheets reference

4. **Add invite key management story** — Add to Epic 26: admin can generate, list, and revoke invite keys; without this, the multi-user platform cannot admit new users after first deploy

5. **Remove Story 5.2** — Remove AgingRow/visual aging from Epic 5; remove FR14/FR15 from requirements inventory; remove UX-DR5 or mark it deprecated

6. **Regenerate architecture distillate** — The distillate still references Google Sheets, `oauth-client.ts`, `sheets-sync.ts`, and Google OAuth env vars. It must be regenerated from the updated `architecture.md` to give developers accurate implementation context.

---

### Recommended Next Steps (Ordered)

1. **Fix Story 1.2 DB schema** — Lowest risk change, highest dependency surface; everything else builds on the correct schema
2. **Fix Story 1.3 env vars and empty state copy** — 15-minute fix; removes confusion on first run
3. **Remove Story 5.2** — Prevent dead code implementation
4. **Rewrite Epic 2** — This is the largest work item but also the most blocking; use the PRD FR1–FR6 and Journey 2/5 narrative as the spec source
5. **Add invite key story to Epic 26** — Closes the user onboarding path end-to-end
6. **Update Story 7.2** — Align cover letter delivery with `.docx` model
7. **Regenerate architecture distillate** — Provides correct context for all development work
8. **Update UX-DR7, UX-DR14** — Replace SyncButton spec with Discover/Analyze button specs; update empty state copy

---

### Epics 24–27 Readiness (If Prerequisites Are Fixed)

| Epic | Readiness | Blocker |
|---|---|---|
| Epic 24 | ✅ Ready (after Story 1.2 schema fix) | Story 24.3 migration depends on correct jobs table schema |
| Epic 25 | ✅ Ready | No blockers independent of Epic 24 |
| Epic 26 | ⚠️ Almost Ready | Missing invite key management story |
| Epic 27 | ✅ Ready | Story 27.1 env var list conflicts with Story 1.3 (minor) |

The four new epics (24–27) themselves are of high quality: they have clear user value, correct BDD acceptance criteria, consistent architecture references, and complete UX specification. They are well-engineered work products that will be straightforward to execute once the foundational stale artifacts are corrected.

---

### Final Note

This assessment identified **14 issues** across **4 categories** (epic coverage, architecture alignment, UX alignment, epic quality). Of these, 3 are critical blockers, 4 are major workflow impediments, and 4 are minor gaps and 3 are stale artifacts requiring update. The root cause is a single event: the PRD was updated on Apr 26 to replace the Google Sheets pipeline with a scraper API model, and that change was not fully propagated through the supporting artifacts (Epic 2, Story 1.2, Story 1.3, architecture distillate, requirements inventory, UX specs). Resolving the stale artifacts will bring the backlog into full alignment with the current product vision.

**Assessed by:** Claude Code (bmad-check-implementation-readiness)
**Assessment date:** 2026-04-27
