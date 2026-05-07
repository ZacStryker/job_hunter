# Sprint Change Proposal
**Date:** 2026-05-07
**Author:** SM (Correct-Course Workflow)
**Change Classification:** Moderate — new epic, one immediate hotfix story, backlog additions

---

## Section 1: Issue Summary

**Problem:** Every LinkedIn search request in production returns HTTP 500. The scraper child process (`scraper/src/scrapers/linkedin.js`) resolves `AUTH_PATH` as a module-level constant at startup from `process.env.AUTH_DIR`. In Docker, `AUTH_DIR` either points to a nonexistent `linkedin.json` or a developer's personal session file. Playwright throws when attempting to load the storage state → exception propagates unhandled → 500 on Discovery for any user with LinkedIn search configs.

**Discovery:** Identified in production after Epic 27 deployment (multi-user Docker on Linode).

**Scope of impact:** All users with LinkedIn search configurations. Discovery flow is fully broken for LinkedIn sources.

**Root cause files:**
- `scraper/src/scrapers/linkedin.js` — `AUTH_PATH` module-level constant (the bug)
- `job-hunt-dashboard/src/server/services/scraper-process.ts` — sets `AUTH_DIR` env var for child process

---

## Section 2: Impact Analysis

| Area | Impact | Action Required |
|------|--------|----------------|
| Epic 28 | None — rebrand stories continue as-is | None |
| Epic 25 | Pattern model for implementation; epic is closed | None (read-only reference) |
| Epic 14 | Bug surface introduced here; no story changes | None |
| Architecture doc | API routes, user_secrets key_names, discovery-service notes | Update architecture-distillate.md + architecture.md |
| UX spec | Config > Connections section (new surface) | Extend auth-onboarding-admin-ux.md |
| sprint-status.yaml | Add Epic 29 | Updated as part of this proposal |

---

## Section 3: Recommended Approach — Direct Adjustment

Create **Epic 29: Per-User LinkedIn Authentication** with 4 stories:

| Story | Title | Priority | Effort |
|-------|-------|----------|--------|
| 29.1 | LinkedIn Discovery — Graceful Skip (Stopgap) | **Immediate / deploy now** | XS |
| 29.2 | Scraper — Per-Request storageStatePath | High | S |
| 29.3 | API & Discovery — LinkedIn Session Storage & Temp File | High | M |
| 29.4 | UI — Config > Connections: LinkedIn Upload & Status | High | M |

**Rationale:**
- 29.1 ships immediately and eliminates the production 500 with zero risk — only touches `discovery-service.ts`
- 29.2–29.4 deliver the proper multi-user solution, following Epic 25 patterns exactly
- No rollback needed; no MVP scope change; no dependency on Epic 28 in-review stories
- Epic 25 is done and retrospective is complete — reopening it would be incorrect; new Epic 29 is the right boundary

**Alternatives rejected:**
- Hotfix story on Epic 28: category error — Epic 28 is a rebrand; mixing auth/scraper fixes muddies the retrospective
- Append to Epic 25: epic is done + retrospective done; per-user LinkedIn auth has distinct concerns (scraper-layer protocol, file-upload UX, helper script)

---

## Section 4: Detailed Change Proposals

### 4.1 New Epic — Epic 29: Per-User LinkedIn Authentication

**File created:** `_bmad-output/planning-artifacts/epics/epic-29-per-user-linkedin-authentication.md`

Users store their own LinkedIn Playwright session state (`linkedin.json`) encrypted in `user_secrets`. The Discovery service decrypts it at runtime, writes it to a temp file, and passes `storageStatePath` per-request to the scraper. Users without LinkedIn auth configured see a clear error instead of a 500.

---

### 4.2 Story 29.1: LinkedIn Discovery — Graceful Skip (Stopgap)

**Priority: Immediate — deploy to production as soon as implemented.**

**OLD behavior:**
- `discovery-service.ts` passes a fixed `storageStatePath` derived from `AUTH_DIR` env var
- If `linkedin.json` does not exist → Playwright throws → unhandled 500

**NEW behavior:**
- `discovery-service.ts` checks `user_secrets` for `linkedin_storage_state` before any LinkedIn scrape
- If absent: all LinkedIn searches skipped; a `{ source: 'linkedin', error: 'LinkedIn not connected — add your session in Config > Connections' }` entry is included in the run result
- Discovery continues and completes for all other sources

**Files changed:** `src/server/services/discovery-service.ts` only

**Rationale:** Zero-risk stopgap. Fixes the 500 immediately without touching the scraper binary or routes.

---

### 4.3 Story 29.2: Scraper — Per-Request storageStatePath

**OLD:**
```js
// scraper/src/scrapers/linkedin.js — top of file
const AUTH_PATH = path.resolve(process.env.AUTH_DIR, 'linkedin.json');
```

**NEW:**
- `AUTH_PATH` constant removed from `linkedin.js`
- `process.env.AUTH_DIR` no longer read in `linkedin.js`
- Routes `POST /scrape/search`, `POST /scrape/listing`, `POST /scrape/job-details` accept `storageStatePath` in request body
- Scraper passes `storageStatePath` directly to `getPage(storageStatePath)` (pool.js already supports this parameter)
- `scraper-process.ts`: `AUTH_DIR` removed from the child process env block

**Files changed:** `scraper/src/scrapers/linkedin.js`, scraper route handlers, `src/server/services/scraper-process.ts`

**Rationale:** Removes the global constant and enables per-request auth — prerequisite for story 29.3.

---

### 4.4 Story 29.3: API & Discovery — LinkedIn Session Storage & Temp File

**OLD:** No `PUT /api/onboarding/linkedin` route; discovery-service uses env var path.

**NEW:**

`GET /api/onboarding/status`:
```
OLD response: { hasAnthropicKey: boolean, hasImap: boolean, onboardingComplete: boolean }
NEW response: { hasAnthropicKey: boolean, hasImap: boolean, hasLinkedinAuth: boolean, onboardingComplete: boolean }
```

`PUT /api/onboarding/linkedin` (new route):
- Accepts raw `linkedin.json` content in request body
- Encrypts via `encrypt()`, stores in `user_secrets` with `key_name: 'linkedin_storage_state'`
- Response: `200 { ok: true }`

`discovery-service.ts`:
- Decrypts `linkedin_storage_state` from `user_secrets`
- Writes to `os.tmpdir()/linkedin-{userId}-{timestamp}.json`
- Passes `storageStatePath` in scrape request body
- Deletes temp file in `finally` block

**Files changed:** `src/server/routes/api-onboarding.ts`, `src/server/services/discovery-service.ts`, `src/shared/schemas.ts`

**Rationale:** Closes the full loop — secrets stored per-user, passed per-request, temp file lifecycle managed safely.

---

### 4.5 Story 29.4: UI — Config > Connections: LinkedIn Upload & Status

**OLD:** No LinkedIn section in Config view.

**NEW:** Config > Connections section with:
- LinkedIn row: file upload button + status indicator (emerald "Connected" / zinc "Not connected")
- Upload sends file content via `PUT /api/onboarding/linkedin`; success → status updates; failure → `Alert variant="destructive"`
- Expandable "How to generate linkedin.json" section with command: `node scripts/generate-linkedin-auth.js`

**New files:** `src/client/hooks/useLinkedinAuthMutation.ts`, `scripts/generate-linkedin-auth.js`
**Modified files:** Config view component (wherever Config view lives), `src/shared/schemas.ts` (if status type needs update)

**Pattern reference:** Follows `ConnectionTestButton` from Epic 25 exactly. Status indicator follows IMAP status pattern.

**Rationale:** Gives users a self-service path to authenticate LinkedIn without server access.

---

## Section 5: Architecture & UX Artifact Updates

These updates should be made by the dev implementing story 29.3 (at the latest):

**architecture-distillate.md:**
- API routes section: add `PUT /api/onboarding/linkedin` to onboarding routes
- Encryption at rest section: add `linkedin_storage_state` to user_secrets key_names inventory
- Add note: discovery-service writes decrypted LinkedIn state to `os.tmpdir()` per-request; temp file deleted in finally block; `AUTH_DIR` env var no longer used

**architecture.md:** Same additions in relevant sections.

**auth-onboarding-admin-ux.md:** Add `ConnectionsSection` component spec for Config view — file upload + status indicator pattern + helper script reference.

**project-context.md:** Add `linkedin_storage_state` to the user_secrets pattern notes (currently only mentions `imap_*` and `anthropic_api_key`).

---

## Section 6: Implementation Handoff

**Scope: Moderate**

| Handoff | Recipient | Action |
|---------|-----------|--------|
| Story 29.1 | Dev — **immediate** | Create story file; implement and deploy |
| Story 29.2 | Dev — next after 29.1 | Create story file; implement |
| Story 29.3 | Dev — after 29.2 | Create story file; implement |
| Story 29.4 | Dev — after 29.3 | Create story file; implement |
| Architecture updates | Dev (during 29.3 or 29.4) | Update architecture-distillate.md, architecture.md |
| UX spec update | Dev (during 29.4) | Extend auth-onboarding-admin-ux.md |
| Epic 29 file | SM — done | `epics/epic-29-per-user-linkedin-authentication.md` created |
| sprint-status.yaml | SM — done | Epic 29 entries added |
| epics/index.md | SM — done | Epic 29 entries added |

**Success criteria:**
1. Story 29.1 deployed → Discovery no longer returns 500 for users without LinkedIn auth; clear user-visible message shown
2. Stories 29.2–29.4 complete → each user can upload their own `linkedin.json`, Discovery uses per-user session, no shared `AUTH_DIR` constant, no temp files leaked

**Status: APPROVED 2026-05-07**
