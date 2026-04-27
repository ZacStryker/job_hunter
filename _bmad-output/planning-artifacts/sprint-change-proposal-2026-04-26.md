# Sprint Change Proposal — Multi-User Hosted Platform
**Date:** 2026-04-26  
**Author:** Stryker  
**Change Type:** Strategic Expansion  
**Scope Classification:** Major  

---

## Section 1 — Issue Summary

**Problem statement:** The Job Hunt Dashboard was built as a single-user localhost personal tool (Epics 1–23). All architecture, PRD, and UX artifacts reflect that premise explicitly: no auth, no sessions, `127.0.0.1` binding, no deployment strategy, single shared SQLite database. The product has matured to the point where it is ready to share with a small group of test users (~10), which requires a fundamental platform shift.

**Trigger:** Deliberate strategic decision — not a sprint failure or technical blocker. The user has identified that the application is feature-complete for its original single-user purpose and wants to open it to a small invited group on a hosted Linode server.

**Change required:**
- Multi-user support with invite-key registration
- Email verification (activation link on registration)
- Per-user onboarding: Anthropic API key + IMAP connection setup with live connection testing
- Admin and Standard account types
- Admin view: user list with active toggle, reset password, edit, impersonate
- Production deployment to Linode behind Nginx with TLS

**Priority:** Stable, consistent experience for ~10 test users. Reliability over features.

---

## Section 2 — Impact Analysis

### Epic Impact

- **Epics 1–23:** All done or in review. No modifications needed. All features remain valid in a per-user context.
- **Story 18-1 (Search Config UI):** Currently in `review`. Not affected — search configs are valid per-user features. Complete review as planned.
- **New epics required:** 4 (see Section 4).

### Artifact Conflicts

| Artifact | Conflict | Action |
|---|---|---|
| PRD | "No auth, sessions, or user accounts"; "localhost only"; "single-user personal use" | Update Executive Summary, Architecture Overview, Security NFR, Implementation Constraints; add FR-A1–FR-A11 |
| Architecture Distillate | "App auth: none"; "127.0.0.1 only"; no deployment section; no per-user isolation | Add auth/session layer, per-user data model, new API routes, new env vars, deployment section |
| UX Spec | No landing page, registration, onboarding, or admin view | Add new UX section covering all new surfaces |
| project-context.md | No auth middleware invariants; no user_id query scoping rules | Update after architecture is written |
| .env.example | Missing: SESSION_SECRET, ENCRYPTION_KEY, SMTP_*, APP_URL, bootstrap vars | Add new required vars block |
| sprint-status.yaml | Missing Epics 24–27 | Add 4 new epics at `backlog` status |

### Technical Impact

- **DB schema changes:** Add `users`, `invite_keys`, `user_secrets`, `sessions` tables; add `user_id` FK to all data tables
- **Data migration:** Existing rows assigned to a seed admin account on first deploy
- **Auth middleware:** New Hono middleware applied to all `/api/*` routes
- **Encryption:** Per-user secrets (Anthropic API key, IMAP credentials) encrypted at rest (AES-256-GCM)
- **Email service:** New SMTP integration for activation emails, password reset
- **Deployment:** Docker Compose + Nginx + Let's Encrypt on Linode

### Deferred Items Now Actionable

These items from `deferred-work.md` were explicitly deferred until multi-user deployment:
- "No auth on POST endpoints" (reviews: 7-1, 8-2, 10-1) → covered by Epic 24 auth middleware
- "No CSRF protection on POST webhook endpoints" → Epic 24, Story 24-1 scope
- "process.cwd() path resolution unreliable in Docker/systemd" → Epic 27, Story 27-1 scope

---

## Section 3 — Recommended Approach

**Selected: Direct Adjustment (Option 1)**

Add 4 new epics. No rollback of existing work. The entire 23-epic feature set remains valid and will operate in the new per-user context once Epic 24 (auth foundation + data isolation) is complete.

**Rationale:**
- All existing code is correct and stable; rollback would destroy working features
- The auth layer is additive, not a rewrite
- Per-user data isolation (Story 24-5) is the highest-risk piece — it touches every table — but is well-understood and can be done in a single focused migration story
- Encryption at rest for secrets is a new pattern for this codebase but straightforward with a well-defined key management approach
- Deployment (Epic 27) is independent and can proceed in parallel once the app is stable

**Effort estimate:** 8–14 stories across 4 epics.

**Risk areas:**
1. **Story 24-5** (per-user data isolation) — touches every table; requires careful migration with rollback plan
2. **Encryption at rest** — get the key management design right in architecture before writing Story 24-1
3. **Email deliverability** — transactional email must be tested early; activation links that don't arrive block all new users

**Timeline impact:** Significant but not disruptive. Epics 24–25 are prerequisites for any real-user use. Epic 26 (admin) and Epic 27 (deployment) can run in sequence after.

---

## Section 4 — Detailed Change Proposals

### PRD Changes

**3.1.A — Remove "no auth" implementation constraint**
- Section: Web Application Requirements > Implementation Constraints
- OLD: `- No authentication, sessions, or user accounts`
- NEW: *(remove this line)*

**3.1.B — Update architecture overview**
- Section: Web Application Requirements > Architecture Overview
- OLD: `No public deployment, no CDN, no build pipeline beyond bun run build. Localhost-only.`
- NEW: `Deployed on Linode behind Nginx with TLS. Session-based authentication with invite-key registration. Multi-user with Admin and Standard account types.`

**3.1.C — Update Executive Summary**
- OLD: `Built for single-user personal use; runs entirely on localhost with bun start.`
- NEW: `Built for a small group of invited users; deployed on Linode. Each user manages their own jobs, IMAP connection, and Anthropic API key independently.`

**3.1.D — Update Security NFR**
- Replace localhost-binding and .env-only credential constraints with:
  - Per-user IMAP credentials and Anthropic API keys stored encrypted in the database
  - Sessions use secure, httpOnly cookies with server-side session store
  - All routes require authentication; admin routes require admin role
  - Hono serves over Nginx with TLS
  - Invite keys required for registration; accounts inactive until email verification

**3.1.E — Add Functional Requirements FR-A1–FR-A11**
```
FR-A1:  Public landing page accessible without auth
FR-A2:  Registration requires a valid invite key and email address
FR-A3:  Activation email sent on registration; account inactive until link clicked
FR-A4:  Users log in with email + password; sessions persist across browser sessions
FR-A5:  Users complete onboarding (Anthropic API key + IMAP setup) before accessing app
FR-A6:  Admins can view all user accounts in a list
FR-A7:  Admins can toggle a user's active status
FR-A8:  Admins can reset a user's password (sends email, invalidates current session)
FR-A9:  Admins can edit a user's name, email, and account type
FR-A10: Admins can impersonate any user for debugging and support
FR-A11: All job data, email events, cover letters, and settings are scoped to owning user
```

---

### Architecture Changes

**3.2.A — Auth & Session layer**
- Replace "App auth: none (single user, localhost)" section with:
  - Session-based auth; httpOnly secure cookie; SQLite sessions table
  - Password hashing: bcrypt or argon2id
  - Invite keys: single-use, stored in DB
  - Per-user secrets encrypted at rest (AES-256-GCM); key from ENCRYPTION_KEY env var; never returned to client
  - Auth middleware on all `/api/*`; admin middleware on `/api/admin/*`
  - Hono binds `0.0.0.0` in production (Nginx terminates TLS); `127.0.0.1` in dev

**3.2.B — Per-user data isolation**
- Add to Data Architecture section:
  - All core tables get `user_id` FK (non-nullable after migration)
  - New tables: `users`, `invite_keys`, `user_secrets`, `sessions`
  - Existing data migrated to seed admin account on first deploy

**3.2.C — New API routes**
```
POST /auth/register
GET  /auth/activate
POST /auth/login
POST /auth/logout
POST /auth/reset-request    (admin only)
POST /auth/reset
GET  /api/admin/users       (admin only)
PATCH /api/admin/users/:id  (admin only)
POST /api/admin/impersonate/:id (admin only)
GET  /api/onboarding/status
PUT  /api/onboarding/anthropic
PUT  /api/onboarding/imap
```

**3.2.D — New env vars**
```
SESSION_SECRET
ENCRYPTION_KEY
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
APP_URL
INVITE_KEY_SEED
ADMIN_EMAIL / ADMIN_PASSWORD   (first-deploy bootstrap only)
```

**3.2.E — New Deployment section**
- Target: Linode VPS, Ubuntu 24.04 LTS
- Docker Compose: app container + scraper child process; SQLite volume-mounted
- Nginx: TLS termination via Let's Encrypt; HTTP→HTTPS redirect
- Restart policy: `unless-stopped`
- Backups: SQLite volume snapshot or periodic `.backup` to object storage

---

### UX Changes

**3.3.A — New surfaces (Epic 24–26)**
- Landing page: public, single CTA "Register with Invite Key"
- Registration form: invite key + email + password
- Email verification: activation link; re-send on expiry
- Login form: email + password; redirect to onboarding if incomplete
- Onboarding (4 steps): Welcome → Anthropic API key (with test) → IMAP setup (with test, skippable) → Done
- Admin view: user list table with inline active toggle, reset pw, edit, impersonate; impersonate banner

**3.3.B — Existing journey updates**
- All existing journeys remain valid post-authentication
- Add: "First-time user setup" journey (registration → activation → onboarding → dashboard)
- Update Journey 4 (First-Run Setup) to reflect invite-key flow instead of repo clone

---

### Secondary Artifact Changes

**3.4.A — project-context.md** (update after architecture written)
- Auth middleware must be applied to all `/api/*` handlers
- `user_id` must be threaded through all DB queries
- Per-user secrets never returned in API responses (return presence flag only)
- Read `userId` from `ctx.get('userId')` — never trust client-supplied user ID

**3.4.B — .env.example**
- Add new required vars block (see 3.2.D above)

**3.4.C — sprint-status.yaml**
- Add: `epic-24: backlog`, `epic-25: backlog`, `epic-26: backlog`, `epic-27: backlog`

---

## Section 5 — Implementation Handoff

**Scope classification: Major** — Fundamental new platform capability; architecture must be updated before implementation begins.

**Handoff plan:**

| Role | Responsibility |
|---|---|
| Architect (`bmad-create-architecture`) | Update architecture doc with full multi-tenancy, auth, and deployment design before any Epic 24 story is written |
| Product Manager | Update PRD with changes defined in Section 4 |
| UX Designer (`bmad-create-ux-design`) | Add new UX section for auth/onboarding/admin surfaces |
| Scrum Master (`bmad-create-epics-and-stories`) | Create Epic 24–27 story files from the structure defined in Section 4 |
| Developer | Implement in sequence: Epic 24 → Epic 25 → Epic 26 → Epic 27 |

**Sequence constraints:**
1. Architecture update and PRD update must precede Epic 24 story creation
2. Epic 24, Story 24-5 (per-user data isolation) must complete before any Epic 25/26 story touches the DB
3. Epic 27 (deployment) can proceed independently once app is stable; must be in place before inviting real users

**Success criteria:**
- A new invited user can: register → receive activation email → activate → complete onboarding → use the app — with zero admin intervention required
- An admin can: view all users, toggle active status, reset a password, and impersonate
- All existing features (pipeline, tracker, drawer, email detection, dashboard, etc.) work correctly in a per-user context
- The app runs stably on Linode with TLS for 10 concurrent users

---

*Sprint Change Proposal complete. Next step: Architecture update (`bmad-create-architecture`) in a fresh context window.*
