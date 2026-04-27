# Sprint Change Proposal — Invite Key Management (Epic 26)

**Date:** 2026-04-27  
**Author:** Scrum Master (Correct Course workflow)  
**Status:** Pending Approval  

---

## Section 1: Issue Summary

**Problem:** Epic 26 (Admin User Management) has no mechanism for admins to create, view, or revoke invite keys. Epic 24 (Story 24.1) defines the `invite_keys` DB table and Story 24.2 validates keys at registration — but the admin-side workflow for generating those keys is entirely absent. PRD Journey 4 describes "Alex receives an invite key from the admin," yet no functional requirement specifies how the admin produces that key. Without this story, invite-key-gated registration cannot actually work in practice.

**Discovery context:** Identified during Sprint Change planning for the multi-user expansion (Epics 24–27) on 2026-04-27.

**Evidence of gap:**
- Epic 26 covers FR-A6 through FR-A10 (user list, active toggle, password reset, profile edit, impersonation). No FR exists for invite key management.
- PRD Security NFR states "Invite keys required for registration" with no corresponding actor-visible requirement for creating them.
- Architecture distillate admin routes list omits all invite-key management endpoints.
- UX spec admin journey (Journey 6) has no mention of an invite keys section or generation workflow.

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Impact |
|---|---|
| Epic 26 — Admin User Management | One new story (26.3) added. Stories 26.1 and 26.2 unaffected. Epic header updated to include FR-A12. |
| Epic 24 — Auth & Multi-User Foundation | Unaffected — `invite_keys` table and registration validation are complete as designed. |
| Epic 25 — User Onboarding | Unaffected. |
| Epic 27 — Production Deployment | Unaffected. |

### Story Impact

- **New:** Story 26.3 — Admin Invite Key Management
- **Modified:** None — no existing stories require changes.

### Artifact Conflicts

| Artifact | Impact |
|---|---|
| PRD | Missing FR-A12. The Security NFR references invite keys with no FR covering their creation. |
| Architecture Distillate | Admin routes list is incomplete — invite key management routes absent. |
| UX Spec | Admin view journey and action patterns omit the invite keys section. |
| Epic 26 file | Story 26.3 must be appended; FR coverage header updated. |
| Sprint Status YAML | Story 26.3 entry added under epic-26. |
| Epics index.md | Story 26.3 entry added. |

### Technical Impact

Zero schema changes. The `invite_keys` table already exists from Story 24.1 with columns `id`, `key`, `used_by_user_id`, `used_at`. New API routes and one UI section (within the existing `/admin/users` page) are all that is required.

---

## Section 3: Recommended Approach

**Selected:** Option 1 — Direct Adjustment. Add Story 26.3 within Epic 26. Update PRD, architecture distillate, and UX spec to close the identified gaps. No rollbacks or MVP scope changes needed.

**Rationale:**
- All DB foundation already exists from Story 24.1
- Admin middleware and route structure already planned in Epics 24 and 26
- UI slots naturally into the existing admin view alongside the user table
- Effort: Low. Risk: Low.

---

## Section 4: Detailed Change Proposals

### Change A — Epic 26: New Story 26.3

**File:** `_bmad-output/planning-artifacts/epics/epic-26-admin-user-management.md`

**Epic header (FRs covered):**

OLD:
```
**FRs covered:** FR-A6, FR-A7, FR-A8, FR-A9, FR-A10
```

NEW:
```
**FRs covered:** FR-A6, FR-A7, FR-A8, FR-A9, FR-A10, FR-A12
```

**Append after Story 26.2:**

```markdown
## Story 26.3: Admin Invite Key Management

As an admin,
I want to generate, view, and revoke invite keys from within the admin panel,
So that I can control who can register and share credentials with invited users without direct database access.

**Acceptance Criteria:**

**Given** a valid admin session
**When** `GET /api/admin/invite-keys` is called
**Then** response is `200 [ { id, key, status, usedByEmail, usedAt } ]`
**And** `status` is `'unused'` if `used_by_user_id` is null, otherwise `'used'`
**And** `usedByEmail` is the email of the user who consumed the key, or `null`
**And** `usedAt` is an ISO 8601 string or `null`

**Given** a valid admin session
**When** `POST /api/admin/invite-keys` is called with no body
**Then** a new key is generated as 12 uppercase alphanumeric characters formatted `XXXX-XXXX-XXXX` using server-side `crypto.randomBytes`
**And** the key is inserted into `invite_keys` with `used_by_user_id = null`, `used_at = null`
**And** response is `201 { id, key, status: 'unused', usedByEmail: null, usedAt: null }`

**Given** a valid admin session and an unused key
**When** `DELETE /api/admin/invite-keys/:id` is called
**Then** the key row is deleted; response is `204`

**Given** the target key has already been used (`used_by_user_id` is not null)
**When** `DELETE /api/admin/invite-keys/:id` is called
**Then** response is `409 { error: "Cannot revoke a used invite key" }`

**Given** I am logged in as admin and navigate to `/admin/users`
**When** the page loads
**Then** below the user table I see an "Invite Keys" card section (`rounded-lg border border-zinc-800 bg-zinc-900`) with a "Generate Key" button (`bg-blue-600`) in the card header

**Given** invite keys exist
**When** the Invite Keys section loads
**Then** I see a compact table with columns: Key (font-mono), Status (badge: "Unused" zinc-700 / "Used" zinc-600), Used By (email or —), Used At (ISO date or —), Actions

**Given** a key has status "Unused"
**When** I view its row
**Then** I see a clipboard icon button that copies the key value to clipboard on click
**And** after copying, the icon briefly transitions to a check state for 1.5 seconds
**And** I see a "Revoke" text button (`text-red-400 hover:text-red-300`)

**Given** I click "Revoke"
**When** the confirmation Dialog opens
**Then** the dialog body reads: "This invite key will be permanently deleted and cannot be used to register."
**And** clicking "Confirm" calls `DELETE /api/admin/invite-keys/:id`; the row disappears; a toast shows "Invite key revoked"
**And** clicking "Cancel" closes the dialog with no action taken

**Given** a key has status "Used"
**When** I view its row
**Then** no Copy or Revoke actions are shown — used keys are permanent historical records

**Given** no invite keys exist
**When** the section renders
**Then** empty state text reads: "No invite keys. Click Generate Key to invite a new user."

**Given** I click "Generate Key"
**When** the `POST /api/admin/invite-keys` request succeeds
**Then** the new key row appears at the top of the list with status "Unused", a clipboard copy button, and a "Revoke" action
**And** a toast shows "Invite key generated"

**Given** a non-admin session
**When** any `/api/admin/invite-keys` route is accessed
**Then** response is `403 { error: "Forbidden" }` — admin middleware enforces this
```

---

### Change B — PRD: New Functional Requirement FR-A12

**File:** `_bmad-output/planning-artifacts/prd.md`

**Section:** Functional Requirements → User Accounts & Access Control

OLD (last line of section):
```
- **FR-A11:** System ensures all job data, email events, cover letters, and settings are scoped to the owning user
```

NEW:
```
- **FR-A11:** System ensures all job data, email events, cover letters, and settings are scoped to the owning user
- **FR-A12:** Admins can generate, view, and revoke invite keys for controlling new user registration
```

---

### Change C — Architecture Distillate: Admin Routes

**File:** `_bmad-output/planning-artifacts/architecture-distillate.md`

**Section:** API Design

OLD:
```
- Admin routes (role=admin): `GET /api/admin/users`; `PATCH /api/admin/users/:id`; `POST /api/admin/impersonate/:id`
```

NEW:
```
- Admin routes (role=admin): `GET /api/admin/users`; `PATCH /api/admin/users/:id`; `POST /api/admin/impersonate/:id`; `GET /api/admin/invite-keys`; `POST /api/admin/invite-keys`; `DELETE /api/admin/invite-keys/:id`
```

---

### Change D — UX Spec: Admin Action Patterns

**File:** `_bmad-output/planning-artifacts/ux-design-specification/auth-onboarding-admin-ux.md`

**Section:** UX Consistency Patterns → Admin Action Patterns table

ADD two rows:
```
| Generate invite key | No | Single-action, low stakes, easily revoked if sent to wrong person |
| Revoke invite key   | Yes — Dialog | Permanently deletes key; consequence copy: "This invite key will be permanently deleted and cannot be used to register." |
```

---

### Change E — Sprint Status YAML

**File:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

Add under Epic 26 section:
```yaml
  26-3-admin-invite-key-management: backlog
```

---

### Change F — Epics Index

**File:** `_bmad-output/planning-artifacts/epics/index.md`

ADD under Epic 26 entries:
```
    - [Story 26.3: Admin Invite Key Management](./epic-26-admin-user-management.md#story-263-admin-invite-key-management)
```

---

## Section 5: Implementation Handoff

**Scope classification: Minor**  
Direct addition within an existing planned epic. No backlog reorganization required. Dev team can implement Story 26.3 as the third story in Epic 26, after Stories 26.1 and 26.2 are complete.

**Dependencies:** Story 26.3 depends on Stories 26.1 (admin API infrastructure and admin middleware) and 26.2 (admin UI shell, drawer pattern). It should be implemented third.

**Success criteria:**
- Admin can generate an invite key, copy it to clipboard, and hand it to a prospective user
- That user can register using the key — key is marked used, is no longer copyable/revocable
- Admin can see which keys have been used and by whom (historical record)
- Admin can revoke an unused key — it cannot subsequently be used for registration
- All invite key API routes return 403 for non-admin sessions
