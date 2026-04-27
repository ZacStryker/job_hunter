# Epic 24: Authentication & Multi-User Data Foundation

Users can register with an invite key, activate via email, and log in — with all existing features operating correctly in a fully per-user isolated context.

**FRs covered:** FR-A1, FR-A2, FR-A3, FR-A4, FR-A11
**NFRs addressed:** NFR-A1, NFR-A2, NFR-A3, NFR-A5
**UX:** UX-AUTH1, UX-AUTH2, UX-AUTH3, UX-AUTH4, UX-AUTH5, UX-AUTH13, UX-AUTH14
**Architecture:** New DB tables (users, invite_keys, user_secrets, sessions), data isolation migration (0020), auth/admin middleware, CSRF, crypto module, mailer module, public auth routes, AuthFormCard

## Story 24.1: Crypto Module, Mailer Module & Auth DB Schema

As a system,
I want foundational auth infrastructure — encryption utilities, an email sending module, and the DB tables for users/sessions/invite keys/user secrets —
So that all subsequent auth features have a stable foundation to build on.

**Acceptance Criteria:**

**Given** `ENCRYPTION_KEY` is set as a 32-byte hex string in `.env`
**When** `encrypt(plaintext)` is called from `src/server/lib/crypto.ts`
**Then** it returns a string formatted as `hex_iv:hex_ciphertext:hex_authTag` using AES-256-GCM with a random 12-byte IV

**Given** a previously encrypted value
**When** `decrypt(ciphertext)` is called
**Then** it returns the original plaintext exactly

**Given** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `APP_URL` are set in `.env`
**When** `sendMail({ to, subject, html })` is called from `src/server/lib/mailer.ts`
**Then** it sends the email via SMTP and resolves without error

**Given** `bun start` runs the migration runner
**When** `0019_auth_schema.sql` executes
**Then** the `users` (id, email, password_hash, role, is_active, activation_token, reset_token, reset_token_expires_at, created_at), `invite_keys` (id, key, used_by_user_id, used_at), `user_secrets` (user_id FK, key_name, ciphertext, updated_at; unique on user_id+key_name), and `sessions` (id PK, user_id FK, data JSON, expires_at) tables exist with correct constraints
**And** the migration is idempotent — re-running does not error

**Given** `ENCRYPTION_KEY` is missing from `.env`
**When** `bun start` runs
**Then** the app exits with `console.error` listing the missing key — no silent default

## Story 24.2: Auth API Routes — Registration, Activation, Login, Logout & Password Reset

As a new user,
I want to register with my invite key, receive an activation email, log in, and reset my password if needed,
So that I have a personal, authenticated account.

**Acceptance Criteria:**

**Given** a valid unused invite key and a unique email
**When** `POST /auth/register` is called with `{ inviteKey, email, password }`
**Then** a `users` row is created with `is_active = false` and a random 32-byte hex `activation_token`; the invite key is marked used; an activation email is sent containing `APP_URL/auth/activate?token=<token>`
**And** response is `201` with no user data in the body

**Given** an already-used invite key
**When** `POST /auth/register` is called
**Then** response is `400 { error: "Invite key not recognized or already used" }`

**Given** an email already registered
**When** `POST /auth/register` is called
**Then** response is `400 { error: "Email already registered" }`

**Given** a valid, unexpired activation token
**When** `GET /auth/activate?token=<token>` is called
**Then** `users.is_active = true`; `activation_token` cleared; a new session is created; session cookie set (httpOnly, Secure, SameSite=Lax); response redirects to `/onboarding`

**Given** an expired or invalid token
**When** `GET /auth/activate?token=<token>` is called
**Then** response is `400 { error: "Activation link invalid or expired" }`

**Given** valid email + password for an active account
**When** `POST /auth/login` is called
**Then** a session is created; session cookie is set; response is `200 { onboardingComplete: boolean }` — client uses this to redirect to `/onboarding` or `/`

**Given** an inactive account
**When** `POST /auth/login` is called
**Then** response is `403 { error: "Account is disabled" }`

**Given** wrong credentials
**When** `POST /auth/login` is called
**Then** response is `401 { error: "Invalid email or password" }`

**Given** a valid session cookie
**When** `POST /auth/logout` is called
**Then** the session row is deleted; the cookie is cleared; response is `204`

**Given** an admin calls reset for a user's email
**When** `POST /auth/reset-request` is called with `{ email }` (admin session required)
**Then** a reset token is generated and stored with a 1-hour expiry; a reset email is sent containing `APP_URL/reset?token=<token>`; all existing sessions for that user are deleted; response is `204`

**Given** a valid, unexpired reset token
**When** `POST /auth/reset` is called with `{ token, newPassword }`
**Then** the password hash is updated with argon2id (memory=65536, iterations=3, parallelism=4); the reset token is cleared; response is `204`

## Story 24.3: Per-User Data Isolation — Migration, Auth Middleware & Query Scoping

As a user,
I want my job data, email events, cover letters, and settings completely isolated from other users,
So that my data is private and I only ever see my own records.

**Acceptance Criteria:**

**Given** the migration runner executes `0020_multi_tenancy.sql` on first deploy
**When** `bun start` runs
**Then** `jobs`, `search_configs`, `email_events`, and `cover_letters` tables each have a non-nullable `user_id` FK referencing `users.id`
**And** existing rows are assigned `user_id = 1` (the seed admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`)
**And** the seed admin is created only if no users exist — migration is idempotent

**Given** a request to any `/api/*` route with no session cookie or an expired session
**When** `auth-middleware.ts` processes it
**Then** the response is `401 { error: "Unauthorized" }` — the route handler never executes

**Given** a valid session cookie
**When** auth middleware processes any `/api/*` request
**Then** `ctx.set('userId', userId)` is set and the request proceeds to the route handler

**Given** a valid session with `role = 'standard'`
**When** any `/api/admin/*` route is accessed
**Then** `admin-middleware.ts` returns `403 { error: "Forbidden" }`

**Given** a valid session for User A
**When** `GET /api/jobs` is called
**Then** only User A's jobs are returned — the query includes `where(eq(jobs.userId, ctx.get('userId')))` and User B's records are never visible

**Given** a valid session for User A
**When** `PATCH /api/jobs/:id` is called for a job owned by User B
**Then** the response is `404` — cross-user access is impossible by query scoping

**Given** a POST/PATCH/DELETE request to a non-exempt route
**When** the `x-csrf-token` header is missing or invalid
**Then** the response is `403 { error: "CSRF token invalid" }`
**And** `/auth/login`, `/auth/register`, and `/auth/activate` are exempt from CSRF checks

## Story 24.4: Auth UI — Landing Page, Registration, "Check Email" & Login

As an invited user,
I want a clear set of auth screens — landing page, registration form, email confirmation, and login form — that guide me from invite key to authenticated session,
So that I can create my account and reach the app without confusion or dead ends.

**Acceptance Criteria:**

**Given** I navigate to the app URL without an active session
**When** the SPA loads
**Then** I am redirected to `/login`

**Given** I am already authenticated with a valid session
**When** I navigate to `/login` or `/register`
**Then** I am redirected to `/` immediately

**Given** I am on `/login`
**When** the page loads
**Then** I see an `AuthFormCard` (`max-w-sm`) with email + password fields and a "Register with Invite Key" link to `/register`; no marketing copy

**Given** I submit the login form with valid credentials
**When** the API returns `200 { onboardingComplete: true }`
**Then** I am redirected to `/`

**Given** I submit the login form with valid credentials
**When** the API returns `200 { onboardingComplete: false }`
**Then** I am redirected to `/onboarding`

**Given** I enter wrong credentials
**When** the API returns `401`
**Then** an inline error appears below the password field: "Invalid email or password" — form stays, no navigation

**Given** I enter credentials for an inactive account
**When** the API returns `403`
**Then** an inline error appears: "Account is disabled — contact your admin"

**Given** I am on `/register`
**When** the page loads
**Then** I see an `AuthFormCard` with three fields in order: invite key (font-mono, placeholder "XXXX-XXXX-XXXX"), email, password — all on one screen; "Already have an account? Sign in" ghost link at bottom

**Given** I submit the registration form with a valid invite key, email, and password
**When** the API returns `201`
**Then** I am redirected to `/register/pending` showing "Check your email — an activation link has been sent" with a "Resend" button immediately available (no timer gate)

**Given** I submit with an invalid invite key
**When** the API returns `400`
**Then** an inline error appears below the invite key field — no page navigation

**Given** I submit with an already-registered email
**When** the API returns `400`
**Then** an inline error appears below the email field: "Email already in use — sign in instead" — no page navigation

**Given** I click the activation link in my email
**When** the server validates the token
**Then** I am redirected to `/onboarding` with an active session (handled by Story 24.2)

---
