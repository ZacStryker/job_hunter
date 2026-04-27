# Requirements Inventory

## Functional Requirements

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

**Post-MVP: Field Visibility & Archive**
- FR34: User can view Date Scraped and Status as optional columns in the Pipeline table (togglable via column visibility dropdown)
- FR35: Job detail drawer displays the job description when one is available — collapsible at ~300 chars with "Show more" (null-safe) *(fulfilled by Epic 4 implementation)*
- FR36: User can archive a job record from the job detail drawer
- FR37: Archived jobs are excluded from Pipeline and Tracker views by default
- FR38: User can view archived jobs via a dedicated Archived view tab

**User Accounts & Access Control (Epics 24–26)**
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

## NonFunctional Requirements

**Reliability**
- NFR1: App starts successfully with `bun start` on every launch with no manual intervention
- NFR2: Database migrations complete without error on a clean install and are idempotent on subsequent starts
- NFR3: Sheets sync is atomic with respect to user-owned fields — a failed or interrupted sync must not partially overwrite `applied`, `status`, `status_override`, or `cover_letter_sent_at`
- NFR4: No crashes or instability during standard daily-use sessions

**Performance**
- NFR5: Pipeline and Tracker table views render up to 500 job records without perceptible lag
- NFR6: Detail drawer opens without noticeable delay (data already in client state)
- NFR7: Sheets sync for up to 200 rows completes within 10 seconds under normal network conditions

**Security**
- NFR8: OAuth tokens and IMAP credentials stored only in `.env` on the local filesystem — never committed, logged, or exposed via API response
- NFR9: Hono API server binds to `127.0.0.1` only — not network-accessible
- NFR10: `.env.example` documents all required variables without real credential values
- NFR-A1: Per-user IMAP credentials and Anthropic API keys stored with AES-256-GCM symmetric encryption at rest; ENCRYPTION_KEY from env; never returned to client (presence flag only)
- NFR-A2: Sessions use httpOnly Secure cookies with server-side session store; client-side script cannot access session data
- NFR-A3: All `/api/*` routes require valid session authentication; `/api/admin/*` routes additionally require admin role
- NFR-A4: Application served over HTTPS via Nginx TLS termination; Hono not exposed directly to public internet
- NFR-A5: Invite keys required for registration; accounts inactive until email verification link is clicked
- NFR-A6: App handles up to 10 concurrent users without crashes or data cross-contamination between user accounts

**Integration**
- NFR11: The `/ingest` endpoint accepts a documented JSON schema; Sheets column mapping changes are reflected in a single mapping layer only
- NFR12: Sheets API OAuth 2.0 calls include token refresh handling — expired tokens produce a clear error, not silent failure
- NFR13 (Post-MVP): n8n webhook callbacks to Hono include a shared secret for basic request authentication
- NFR14 (Post-MVP): Compound key email matching uses normalized, lowercase title comparison + ±3 day window against `date_applied`

## Additional Requirements

From Architecture — critical implementation constraints:

- **Starter template (Epic 1 Story 1):** Project initialized via `bun create hono@latest job-hunt-dashboard --template bun` followed by adding React, Vite, Drizzle, TanStack stack, and shadcn/ui init
- **Zod shared schema:** `src/shared/schemas.ts` must be defined before any server handler or client component — single source of truth for all job types across all layers
- **Compound unique index:** `db/schema.ts` must define `uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle)` — required for ON CONFLICT upsert
- **Drizzle camelCase config:** `drizzle.config.ts` must include `casing: 'camelCase'` so all query results auto-map snake_case → camelCase
- **SQLite transaction wrapping:** All upsert rows in a sync batch wrapped in a single transaction — full rollback if any row fails validation or write
- **TanStack Query key shapes (frozen):** `['jobs']` for list, `['jobs', id]` for single — no variations permitted
- **localStorage key (frozen):** Column visibility stored under `"job-hunt-column-visibility"` — changing post-ship loses user preferences
- **Server binding:** Hono must bind to `127.0.0.1` — never `0.0.0.0`
- **Error response shape (frozen):** All error responses must return `{ error: string }` — never `{ message }` or nested shapes
- **Date format:** ISO 8601 strings throughout — never Unix timestamps or Date objects in API responses
- **Visual aging thresholds (frozen):** 0–7d = 1.0, 8–14d = 0.75, 15–21d = 0.55, 22+ = 0.35 opacity
- **Cache update strategy:** PATCH mutations use optimistic update on `['jobs']`; POST /api/sync invalidates `['jobs']` for full re-fetch
- **No direct fetch in components:** All data access via hooks in `src/client/hooks/` — never raw `fetch()` in a component

**Multi-Tenancy & Auth (Epics 24–27)**
- **New DB tables:** `users` (id, email, password_hash, role, is_active, activation_token, created_at); `invite_keys` (id, key, used_by_user_id, used_at); `user_secrets` (user_id FK, key_name, ciphertext, updated_at; unique on user_id+key_name); `sessions` (id token PK, user_id FK, data JSON, expires_at)
- **Data isolation migration:** Existing tables (`jobs`, `search_configs`, `email_events`, `cover_letters`) get `user_id` non-nullable FK in migration `0002_multi_tenancy.sql`; existing rows assigned `user_id = 1` (seed admin); idempotent
- **User isolation invariant:** All user-scoped queries MUST include `where(eq(table.userId, ctx.get('userId')))` — never accept userId from request body or params
- **Encryption module:** `src/server/lib/crypto.ts` exports `encrypt(string): string` and `decrypt(string): string`; all `user_secrets` I/O goes through this module only; scheme: AES-256-GCM; IV: random 12-byte per call; stored as `hex_iv:hex_ciphertext:hex_authTag`
- **Mailer module:** `src/server/lib/mailer.ts` handles SMTP send for activation and password reset emails
- **Auth middleware:** `auth-middleware.ts` validates session cookie → `ctx.set('userId')`; returns 401 on invalid/expired; applied to all `/api/*`
- **Admin middleware:** `admin-middleware.ts` checks `users.role === 'admin'`; returns 403; applied to all `/api/admin/*`
- **CSRF:** `x-csrf-token` double-submit required on all POST/PATCH/DELETE; exempt: `/auth/login`, `/auth/register`, `/auth/activate`
- **Password hashing:** argon2id (`argon2` npm); params: memory=65536, iterations=3, parallelism=4
- **Session ID:** cryptographically random 32-byte hex; stored in `sessions` table with `expires_at`
- **Hono binding:** `0.0.0.0` in production Docker (behind Nginx); `127.0.0.1` in dev only
- **Bootstrap:** first deploy creates admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars; idempotent
- **Deployment:** Docker Compose on Linode VPS; Nginx TLS via Let's Encrypt; SQLite volume-mounted; restart: `unless-stopped`
- **New env vars:** `SESSION_SECRET`, `ENCRYPTION_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`, `INVITE_KEY_SEED`; first-deploy only: `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- **Path resolution:** Use `import.meta.dirname` (not `process.cwd()`) — `process.cwd()` is unreliable in Docker/systemd

## UX Design Requirements

- UX-DR1: Dark mode base palette — zinc-950 background, zinc-900 surface (cards, drawer), zinc-800 elevated surface, zinc-700 borders, zinc-100 text primary, zinc-400 text muted
- UX-DR2: Semantic color tokens in `globals.css` — `--score-high` (emerald-500 #10b981), `--score-mid` (amber-400 #fbbf24), `--score-low` (red-500 #ef4444); action chip tokens for apply (blue-500), investigate (amber-500), skip (zinc-500)
- UX-DR3: `ScoreBadge` component — outlined badge (border + text in tier color, transparent bg); thresholds: ≥75 emerald, 50–74 amber, 0–49 red; `score: number` prop, color derived internally
- UX-DR4: `ActionChip` component — subtle background tint, no border; apply = `bg-blue-950 text-blue-300`, investigate = `bg-amber-950 text-amber-300`, skip = `bg-zinc-800 text-zinc-400`; `recommendation: 'apply' | 'investigate' | 'skip'` prop
- UX-DR5: `AgingRow` component — opacity wrapper around TableRow; thresholds: 0–7d=1.0, 8–14d=0.75, 15–21d=0.55, 22+=0.35; Tooltip on hover "Applied N days ago"; renders full opacity if `appliedAt` is null
- UX-DR6: `AssessmentSection` component — uppercase label (`text-xs text-zinc-500 uppercase tracking-wide`) above prose paragraph (`text-sm text-zinc-200 leading-relaxed`); renders nothing if content is null; used four times in drawer order: `role_fit` → `requirements_met` → `requirements_missed` → `red_flags`
- UX-DR7: `SyncButton` component — states: idle ("Sync"), loading (spinner + "Syncing…" + disabled), success (green tint + "X added, Y updated", auto-dismisses 3s), error (red tint + truncated message, persists until next click); wraps `useSyncMutation`
- UX-DR8: Pipeline table card container — `rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden`; sticky header with `backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800`
- UX-DR9: Table density — row padding `py-1.5 px-3`, cell font `text-sm`; header `py-2 px-3 text-xs font-medium uppercase`; Inter variable font with fallback `system-ui, -apple-system, sans-serif`; drawer width `w-[480px]` fixed, internal padding `p-6`, section spacing `space-y-4`
- UX-DR10: `JobDrawer` (shadcn `<Sheet side="right">`, 480px) content order: (1) sticky header — company, job title, ScoreBadge, ActionChip; (2) AssessmentSection ×4; (3) Separator; (4) Job description (collapsible, show 300 chars + "Show more"); (5) Source URL with external link icon; (6) Separator; (7) Applied toggle (Switch + date if applied); (8) Status override (Select); (9) StatusTimeline
- UX-DR11: Column visibility `DropdownMenu` in header toolbar — checkboxes for optional columns (`reqs_met`, `reqs_missed`, `notes`); persists to localStorage under `"job-dashboard:column-visibility"`; all columns shown on first load
- UX-DR12: Active row highlight `bg-zinc-800` while drawer is open; clicking a different row replaces drawer content without close/reopen animation
- UX-DR13: No floating toasts — all feedback inline; sync result as shadcn `Alert` below header bar (success auto-dismisses 4s, error persists until next sync); applied toggle and status override changes are their own feedback (no toast)
- UX-DR14: Initial table load shows Skeleton rows (5–8 rows of shimmer); empty state centered inside card: "No jobs yet. Hit Sync to pull from Google Sheets." with Sync shortcut Button
- UX-DR15: View switching (Pipeline/Tracker) via header tabs — local React `useState`, not URL routing; always opens Pipeline view on load; header layout: App name (left) → View tabs (center) → SyncButton + column visibility toggle (right)
- UX-DR16: Fit score column sorts descending by default; click column header toggles ascending/descending; no multi-column sort; no row selection checkboxes

**Auth, Onboarding & Admin UX (Epics 24–26)**
- UX-AUTH1:  Landing page — single centered CTA ("Register with Invite Key"); no marketing copy; zinc-950 bg; same type scale as app interior
- UX-AUTH2:  `AuthFormCard` component — outer: `flex min-h-screen items-center justify-center bg-zinc-950 px-4`; card: `w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-8`; used for registration, login, "check email" screens
- UX-AUTH3:  Registration form — single screen: invite key (`font-mono`, placeholder "XXXX-XXXX-XXXX", trim on submit) + email + password; validate on blur; all errors inline below field (`text-xs text-red-400 mt-1 role="alert"`)
- UX-AUTH4:  "Check your email" screen — resend link available immediately (no timer gate); re-send triggers new token
- UX-AUTH5:  Login form — `AuthFormCard`; inline errors for wrong credentials / inactive account; redirect to onboarding if incomplete; redirect to dashboard if complete
- UX-AUTH6:  `StepIndicator` component — 4 circular dots with connecting lines; done=emerald-500, active=blue-500, pending=zinc-700; `role="list"` + `aria-label="Onboarding progress: step N of 4"`; `aria-current="step"` on active dot; `sr-only` text per dot for color-independent communication
- UX-AUTH7:  `ConnectionTestButton` component — states: idle / loading (spinner, disabled) / pass (emerald border+text, ✓) / fail (red border+text, ✗); 10-second timeout = network error; resets to idle on input change; `onPass()` prop enables parent Continue; `aria-live="polite"` sr-only result region; icon + color (not color alone)
- UX-AUTH8:  Onboarding Step 2 (API Key) — Continue disabled until `ConnectionTestButton` reaches pass state; specific error messages: "Invalid key — verify at console.anthropic.com" / "Connection timed out — check network" / "Server error — try again"
- UX-AUTH9:  Onboarding Step 3 (IMAP) — Skip is primary-weight button (not text link); IMAP-specific errors: "Authentication failed — check username and password" / "Cannot reach host — verify server address and port"; Back always available; step progress persists across logins
- UX-AUTH10: Admin user table — full-width card within existing app shell; columns: name, email, account type, active (inline `Switch`, no confirmation), last login, actions (Edit / Reset PW / Impersonate as explicit text buttons); Edit opens right drawer consistent with `JobDrawer` pattern
- UX-AUTH11: `ImpersonationBanner` — `fixed top-0 left-0 right-0 z-50 h-10 bg-amber-900/80 border-b border-amber-700`; `role="alert" aria-live="assertive"`; persists on every page while active; cannot be dismissed; Exit always navigates to `/admin/users`; `<main>` receives `pt-10` when banner is active
- UX-AUTH12: Admin confirmation dialogs — consequence-focused copy ("This will send a reset email and invalidate [user]'s current session"); Impersonate requires Dialog confirmation; Reset PW requires Dialog confirmation; Toggle active does NOT require confirmation (immediately reversible)
- UX-AUTH13: New shadcn components to install for new surfaces: `form`, `input`, `label`, `switch`, `alert`, `dialog`, `avatar`
- UX-AUTH14: Form accessibility — every input has `id` + matching `htmlFor` label; errors use `role="alert"`; Dialog uses `aria-describedby` pointing to consequence sentence; all state changes communicate via icon/text AND color (never color alone)

## FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 2 | Manual Sheets sync trigger |
| FR2 | Epic 2 | POST /api/ingest endpoint |
| FR3 | Epic 2 | Mutable field protection on upsert |
| FR4 | Epic 2 | Compound key matching |
| FR5 | Epic 2 | Sync result feedback |
| FR6 | Epic 2 | Sync failure handling |
| FR7 | Epic 3 | Pipeline table render |
| FR8 | Epic 3 | Fit score color badge |
| FR9 | Epic 3 | Action chip (skip/investigate/apply) |
| FR10 | Epic 3 | Pipeline ↔ Tracker view switching |
| FR11 | Epic 3 | Column visibility toggle |
| FR12 | Epic 3 | localStorage column persistence |
| FR13 | Epic 5 | Tracker view with applied jobs |
| FR14 | Epic 5 | Visual row opacity decay |
| FR15 | Epic 5 | Ambient staleness without "ghosted" label |
| FR16 | Epic 4 | Detail drawer on row click |
| FR17 | Epic 4 | Full AI analysis display |
| FR18 | Epic 4 | Job description + source URL |
| FR19 | Epic 4 | Applied toggle + persistence |
| FR20 | Epic 4 | Status override |
| FR21 | Epic 4 | Status timeline |
| FR22 | Epic 1 | Boot migrations |
| FR23 | Epic 1 | .env configuration |
| FR24 | Epic 1 | Single `bun start` command |
| FR25 | Epic 6 | IMAP inbox polling |
| FR26 | Epic 6 | Fuzzy email-to-job matching |
| FR27 | Epic 6 | Auto status update from email |
| FR28 | Epic 7 | Cover letter generation trigger |
| FR29 | Epic 7 | Cover letter email delivery |
| FR30 | Epic 7 | Job record CL status tracking |
| FR31 | Epic 7 | Cover letter in drawer |
| FR32 | Epic 6 | Email events in drawer |
| FR33 | Epic 7 | CL status indicator on table row |
| FR34 | Epic 8 | Date Scraped + Status optional columns in Pipeline table |
| FR35 | Epic 8 | Job description in drawer — fulfilled by Epic 4 implementation |
| FR36 | Epic 8 | Archive action in job drawer |
| FR37 | Epic 8 | Archived jobs excluded from Pipeline/Tracker by default |
| FR38 | Epic 8 | Archived view tab to see archived jobs |
| FR-A1 | Epic 24 | Public landing page accessible without auth |
| FR-A2 | Epic 24 | Invite-key registration with email |
| FR-A3 | Epic 24 | Activation email on registration; account inactive until clicked |
| FR-A4 | Epic 24 | Email + password login; persistent sessions |
| FR-A5 | Epic 25 | Onboarding gate — Anthropic API key required; IMAP optional |
| FR-A6 | Epic 26 | Admin: view all user accounts |
| FR-A7 | Epic 26 | Admin: toggle user active status |
| FR-A8 | Epic 26 | Admin: reset password with email + session invalidation |
| FR-A9 | Epic 26 | Admin: edit user name, email, account type |
| FR-A10 | Epic 26 | Admin: impersonate any user |
| FR-A11 | Epic 24 | All data scoped to owning user (per-user isolation) |
