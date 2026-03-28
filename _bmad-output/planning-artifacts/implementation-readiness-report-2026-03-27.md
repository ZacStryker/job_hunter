---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
documentsInventoried:
  prd: "_bmad-output/planning-artifacts/prd.md"
  architecture: "_bmad-output/planning-artifacts/architecture.md"
  epics: "_bmad-output/planning-artifacts/epics.md"
  ux: "_bmad-output/planning-artifacts/ux-design-specification.md"
---

# Implementation Readiness Assessment Report

**Date:** 2026-03-27
**Project:** bmad

---

## Summary and Recommendations

### Overall Readiness Status

**READY FOR MVP IMPLEMENTATION — with 3 items to resolve before specific epics**

The PRD, Architecture, UX Design, and Epics & Stories are comprehensively documented, internally consistent for the MVP scope, and demonstrate strong requirements traceability (100% FR coverage). The planning artifacts are production-quality. MVP Epics 1–5 can proceed to implementation immediately after the one critical conflict below is resolved.

---

### Critical Issues Requiring Immediate Action

#### 🔴 1. `status_events` Schema Missing `source` Column
**Epics affected:** Epic 4 (Story 4.4 defines the table), Epic 6 (Story 6.2 requires the column)
**Action:** Add `source TEXT DEFAULT 'manual'` to the `status_events` table schema in Story 4.4's AC. This is a greenfield project — fix it at the schema level now, not as a migration in Epic 6.
**Risk if ignored:** Epic 6 Story 6.2 and Story 6.3 will require an unplanned migration that could corrupt status event display.

#### 🔴 2. localStorage Key Conflict (`"job-dashboard:column-visibility"` vs. `"job-hunt-column-visibility"`)
**Documents affected:** UX spec (says `"job-dashboard:column-visibility"`), Epics frozen requirement + Story 3.3 AC (say `"job-hunt-column-visibility"`)
**Action:** The frozen key in Story 3.3 AC and epics additional requirements is `"job-hunt-column-visibility"`. This is the authoritative value — update the UX spec to match.
**Risk if ignored:** If a developer follows the UX spec, the key will be wrong. Column visibility preferences will silently fail to persist.

---

### Major Issues (Address Before Affected Epic)

#### 🟠 3. View Switching — URL Routing vs. Local State Conflict
**Documents affected:** UX spec navigation patterns ("local React state"), Story 1.3 AC (configures TanStack Router routes `/` and `/tracker`), Story 3.4 AC (TanStack Router navigates to `/tracker`)
**Action:** The ACs are more authoritative than the UX narrative. Confirm URL routing via TanStack Router is the intended approach, then update the UX spec's navigation patterns section to reflect this. Must be resolved before Epic 3 Story 3.4.

---

### Minor Concerns (No Blocking Impact)

4. **NFR4 cross-cutting:** Explicitly call out "no crashes, stable daily use" as a done-criteria template for all story reviews.
5. **Story 2.1 and 3.1 developer framing:** Non-blocking but worth noting for sprint review — ensure these stories still get acceptance tested from a user perspective.
6. **Story 3.3 over-bundled:** Column sorting and column visibility are bundled. Consider splitting if story estimation is large.

---

### Recommended Next Steps

1. **Fix the `status_events` schema now** — Add `source TEXT DEFAULT 'manual'` to Story 4.4's AC before any code is written. Zero cost now; painful migration later.
2. **Resolve the localStorage key** — Update the UX spec to use `"job-hunt-column-visibility"`. Confirm once, freeze forever.
3. **Resolve the routing approach** — Pick URL routing or local state and make both the UX spec and story ACs consistent. Recommend confirming URL routing (TanStack Router) since it's already wired in Story 1.3.
4. **Proceed to Epic 1 implementation** — All MVP epics are otherwise ready. Epic 1 has no open issues.

---

### Final Note

This assessment identified **5 issues** across **3 categories** (UX alignment, schema design, routing consistency). Of these, **2 are critical** and must be resolved before their respective epics begin. **1 is major** and must be resolved before Epic 3 Story 3.4. The overall planning quality is high — the epics are well-structured, ACs are specific and testable, FR coverage is 100%, and the architecture is sound.

**Assessed by:** Winston (System Architect persona) via bmad-check-implementation-readiness workflow
**Date:** 2026-03-27
**Report:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-27.md`

---

## PRD Analysis

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

**Total FRs: 24 MVP (FR1–FR24) + 9 Post-MVP (FR25–FR33) = 33**

---

### Non-Functional Requirements

- NFR1 (Reliability): App starts successfully with `bun start` on every launch with no manual intervention
- NFR2 (Reliability): Database migrations complete without error on clean install and are idempotent on subsequent starts
- NFR3 (Reliability): Sheets sync is atomic with respect to user-owned fields — failed/interrupted sync must not partially overwrite protected fields
- NFR4 (Reliability): No crashes or instability during standard daily-use sessions
- NFR5 (Performance): Pipeline and Tracker views render up to 500 job records without perceptible lag
- NFR6 (Performance): Detail drawer opens without noticeable delay (data already in client state)
- NFR7 (Performance): Sheets sync for up to 200 rows completes within 10 seconds under normal network conditions
- NFR8 (Security): OAuth tokens and IMAP credentials stored only in `.env` — never committed, logged, or exposed via API response
- NFR9 (Security): Hono API server binds to `localhost` only — not network-accessible
- NFR10 (Security): `.env.example` documents all required variables without real credential values
- NFR11 (Integration): `/ingest` endpoint accepts a documented JSON schema; Sheets column mapping changes reflected in a single mapping layer only
- NFR12 (Integration): Sheets API OAuth 2.0 includes token refresh handling — expired tokens produce a clear error, not silent failure
- NFR13 (Integration, Post-MVP): n8n webhook callbacks include a shared secret for basic request authentication
- NFR14 (Integration, Post-MVP): Compound key email matching uses normalized lowercase title comparison + ±3 day window against `date_applied`

**Total NFRs: 12 MVP (NFR1–NFR12) + 2 Post-MVP (NFR13–NFR14) = 14**

---

### Additional Requirements / Constraints

- **Browser:** Firefox (latest) only — no cross-browser polyfills
- **Platform:** Desktop-only, localhost, single-user — no auth, sessions, PWA, or offline mode
- **Data Ownership Boundary:** Google Sheets owns scraped/scored columns; SQLite owns user-state columns
- **Dev Mode:** `bun run dev` runs Vite dev server + Hono API as split processes with hot reload
- **Column visibility:** Persisted to `localStorage`

---

---

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement (summary) | Epic Coverage | Status |
|----|--------------------------|---------------|--------|
| FR1 | Manual Sheets sync via OAuth | Epic 2 | ✓ Covered |
| FR2 | POST /api/ingest endpoint | Epic 2 | ✓ Covered |
| FR3 | Upsert with mutable field protection | Epic 2 | ✓ Covered |
| FR4 | Compound key matching | Epic 2 | ✓ Covered |
| FR5 | Sync result feedback | Epic 2 | ✓ Covered |
| FR6 | Sync failure reporting | Epic 2 | ✓ Covered |
| FR7 | Pipeline table view | Epic 3 | ✓ Covered |
| FR8 | Fit score color badge | Epic 3 | ✓ Covered |
| FR9 | Action chip (skip/investigate/apply) | Epic 3 | ✓ Covered |
| FR10 | Pipeline ↔ Tracker view switching | Epic 3 | ✓ Covered |
| FR11 | Column visibility toggle | Epic 3 | ✓ Covered |
| FR12 | localStorage column persistence | Epic 3 | ✓ Covered |
| FR13 | Tracker view with applied jobs | Epic 5 | ✓ Covered |
| FR14 | Visual row opacity decay | Epic 5 | ✓ Covered |
| FR15 | Ambient staleness without "ghosted" | Epic 5 | ✓ Covered |
| FR16 | Detail drawer on row click | Epic 4 | ✓ Covered |
| FR17 | Full AI analysis display | Epic 4 | ✓ Covered |
| FR18 | Job description + source URL | Epic 4 | ✓ Covered |
| FR19 | Applied toggle + persistence | Epic 4 | ✓ Covered |
| FR20 | Status override | Epic 4 | ✓ Covered |
| FR21 | Status timeline | Epic 4 | ✓ Covered |
| FR22 | Boot migrations | Epic 1 | ✓ Covered |
| FR23 | .env configuration | Epic 1 | ✓ Covered |
| FR24 | Single `bun start` command | Epic 1 | ✓ Covered |
| FR25 | IMAP inbox polling | Epic 6 (Post-MVP) | ✓ Covered |
| FR26 | Fuzzy email-to-job matching | Epic 6 (Post-MVP) | ✓ Covered |
| FR27 | Auto status update from email | Epic 6 (Post-MVP) | ✓ Covered |
| FR28 | Cover letter generation trigger | Epic 7 (Post-MVP) | ✓ Covered |
| FR29 | Cover letter email delivery | Epic 7 (Post-MVP) | ✓ Covered |
| FR30 | Job record CL status tracking | Epic 7 (Post-MVP) | ✓ Covered |
| FR31 | Cover letter in drawer | Epic 7 (Post-MVP) | ✓ Covered |
| FR32 | Email events in drawer | Epic 6 (Post-MVP) | ✓ Covered |
| FR33 | CL status indicator on table row | Epic 7 (Post-MVP) | ✓ Covered |

### Missing Requirements

None — all 33 FRs (FR1–FR33) have explicit epic assignments in the FR Coverage Map.

**NFR Note:** NFR4 ("No crashes or instability during standard daily-use sessions") is not explicitly assigned to any single epic. This is a cross-cutting quality standard that applies horizontally — acceptable, but worth confirming it's treated as a done-criteria on all stories rather than an afterthought.

### Coverage Statistics

- Total PRD FRs: 33 (24 MVP + 9 Post-MVP)
- FRs covered in epics: 33
- **Coverage: 100%**
- NFRs explicitly mapped: 13/14 (NFR4 is implicit/cross-cutting)

---

---

## UX Alignment Assessment

### UX Document Status

Found: `_bmad-output/planning-artifacts/ux-design-specification.md` (42K, complete, produced from PRD + Architecture inputs)

### Alignment Issues

#### 🔴 CONFLICT — localStorage Key Mismatch (requires resolution before coding)

| Location | Key Value |
|---|---|
| UX spec (UX Consistency Patterns, line 835) | `"job-dashboard:column-visibility"` |
| Epics frozen requirement (additional requirements section) | `"job-hunt-column-visibility"` |
| UX-DR11 in epics | `"job-hunt-column-visibility"` |

**Impact:** If the implementation uses the wrong key, column visibility preferences will be silently lost on every load. This is a frozen constant — changing it post-ship loses all user preferences. **Must be resolved before Epic 3 implementation begins.**

**Recommendation:** Align on one key in both documents. The epics frozen requirement (`"job-hunt-column-visibility"`) should be treated as authoritative since it was explicitly frozen. Update the UX spec to match.

#### 🟡 INTERNAL UX SPEC INCONSISTENCY — Sync Success Message Persistence

| Location | Behavior |
|---|---|
| UX spec, Emotional Design section | "Sync result message persists until dismissed (not auto-dismissing toast)" |
| UX spec, UX Consistency Patterns section | "Success: Auto-dismisses after 4s" |
| Epics UX-DR13 | "success auto-dismisses 4s, error persists until next sync" |

**Impact:** Developer reads conflicting behavior. The "persists until dismissed" language in the emotional design section appears to be stale intent. Epics UX-DR13 and the UX Consistency Patterns section both agree on 4s auto-dismiss for success, persistent for errors. **Low risk — but the UX spec emotional design section should be corrected to avoid confusion.**

#### ✅ Score Badge Threshold — Resolved (not a conflict)

The design inspiration section casually references "≥80 green" but the authoritative `ScoreBadge` component spec (UX spec lines 697–699) and UX-DR3 both specify **≥75 emerald**. The ≥80 is informal design inspiration text, not a requirement. No action needed.

### UX ↔ PRD Alignment

Strong alignment:
- Platform (desktop, Firefox, localhost) ✓
- Dense table UI, no responsive adaptation ✓
- Column visibility to localStorage ✓
- Visual aging for tracker view ✓
- Mutable field protection / sync safety feedback ✓
- Error message explicitly states "no data was modified" ✓
- Single-command start ✓

No PRD requirements are unaddressed by the UX spec.

### UX ↔ Architecture Alignment

Strong alignment:
- shadcn/ui + Tailwind confirmed in both UX and architecture ✓
- TanStack Table, TanStack Query hooks for data access ✓
- No URL routing for view switching (local React state) ✓
- Hono binds to `127.0.0.1` confirmed in UX error handling patterns ✓

### Warnings

None beyond the two issues documented above.

---

---

## Epic Quality Review

### Epic Structure Validation

#### User Value Focus

| Epic | Goal | User-Centric? | Assessment |
|------|------|---------------|------------|
| Epic 1 | User can run `bun start` and see live empty dashboard | Borderline | ✅ Acceptable — greenfield foundation. Goal is user-visible outcome. |
| Epic 2 | User can sync from Sheets, see results, trust data integrity | Yes | ✅ Clear user value |
| Epic 3 | User can scan color-coded pipeline table | Yes | ✅ Clear user value |
| Epic 4 | User can open drawer, read AI analysis, mark applied | Yes | ✅ Clear user value |
| Epic 5 | User can see applied jobs with visual aging | Yes | ✅ Clear user value |
| Epic 6 | Auto email-to-status detection | Yes | ✅ Clear user value |
| Epic 7 | Cover letter generation pipeline | Yes | ✅ Clear user value |

#### Epic Independence

- **Epic 1:** Standalone. ✅
- **Epic 2:** Uses only Epic 1 output. ✅
- **Epic 3:** Uses Epics 1+2 output. ✅
- **Epic 4:** Uses Epics 1–3 output. ✅
- **Epic 5:** Uses Epics 1–4 output; Story 5.1 reuses Epic 4's `JobDrawer`. ✅ (backward dependency — acceptable)
- **Epic 6:** Uses Epics 1–5 output. ✅
- **Epic 7:** Uses Epics 1–5 output. ✅

No forward dependencies detected between epics.

#### Starter Template Check

Architecture specifies: `bun create hono@latest job-hunt-dashboard --template bun`. Epic 1 Story 1.1 correctly opens with this scaffold command. ✅

---

### Story Quality Assessment

#### Story Framing Issues (Minor)

- **Story 2.1** — "As a developer, I want a POST endpoint…" — developer-framed, not user-centric. Acceptable for a thin API-only story with clear downstream user value.
- **Story 3.1** — "As a developer, I want my job records loaded…" — developer-framed. Same note as 2.1. Impact: low for a personal-use tool with a single developer/user persona.

#### Acceptance Criteria Quality

All stories use proper Given/When/Then BDD format. ACs are specific, testable, and cover error paths. No vague criteria found. Particular strengths:
- Story 2.1: atomic transaction rollback explicitly required ✓
- Story 2.3: idempotent sync behavior verified ✓
- Story 3.2: exact Tailwind class names frozen in ACs ✓
- Story 4.3: optimistic update with rollback-on-error explicitly required ✓
- Story 5.2: `prefers-reduced-motion` handling specified ✓

---

### 🔴 Critical Violations

#### 1. `status_events` Schema Missing `source` Column (Story 4.4 → Story 6.2)

**Location:** Story 4.4 defines `status_events` table as: `(id, job_id FK, status, timestamp ISO string)`. Story 6.2 requires appending entries with `source: 'email'`.

**Impact:** When Epic 6 is implemented, there is no `source` column in the `status_events` table. Story 6.2 will need a schema migration that isn't defined anywhere. Story 6.3's UI renders "via email" indicators from this `source` field — also broken without it.

**Recommendation:** Add `source` column to the `status_events` table definition in Story 4.4, even if it's nullable with a default of `'manual'`. Alternatively, create an explicit migration story at the start of Epic 6. Must be resolved before Epic 6 implementation begins.

---

### 🟠 Major Issues

#### 2. Story 3.4 — Tracker View Placeholder References TanStack Router for Route `/tracker`

Story 3.4 AC states: "TanStack Router navigates to `/tracker`". However, the UX spec and epics navigation patterns section state: "No routing — view switch is local state, not a URL change. TanStack Router reserved for post-MVP deep-linking." This directly contradicts the Story 3.4 AC which says "TanStack Router navigates to `/tracker`" and Story 1.3 which configures TanStack Router routes `/` and `/tracker`.

**Impact:** Developer gets conflicting signals. The UX consistency patterns say "local React state" but the ACs hard-wire URL routing via TanStack Router. Whichever approach is chosen, it must be consistent.

**Recommendation:** Decide once: is view switching URL-routed (TanStack Router `/tracker`) or local state? The Story 1.3 and 3.4 ACs point to URL routing; the UX Consistency Patterns section says local state. The ACs are more specific and were written later — URL routing is the likely intended approach. Update the UX spec navigation patterns section to match.

---

### 🟡 Minor Concerns

#### 3. NFR4 Not Assigned to Any Epic

NFR4 ("No crashes or instability during standard daily-use sessions") has no explicit epic owner. Cross-cutting quality standard — acceptable, but should be noted as a done-criteria on all story ACs during implementation.

#### 4. Story 3.3 — Column Header Click vs. Separate Sorting Story

Story 3.3 bundles column visibility toggle AND column sorting (fit score default descending, click to toggle) into one story. Minor scope creep — sorting is a distinct behavior. Low risk but slightly oversized.

---

### Best Practices Compliance Checklist

| Epic | Delivers User Value | Epic Independent | Stories Sized OK | No Forward Deps | Tables Created When Needed | Clear ACs | FR Traced |
|------|--------------------|-----------------|-----------------|-----------------|-----------------------------|-----------|-----------|
| Epic 1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 6 | ✅ | ✅ | ✅ | ✅ | ⚠️ `source` column missing | ✅ | ✅ |
| Epic 7 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### PRD Completeness Assessment

The PRD is well-structured and thorough for an MVP scope. Requirements are numbered and unambiguous. User journeys clearly map to capability areas. The data ownership boundary and mutable field protection rules are explicitly stated, which is critical for the upsert logic. Post-MVP requirements are cleanly scoped and separated. No significant gaps observed at PRD level — coverage validation against epics will confirm traceability.
