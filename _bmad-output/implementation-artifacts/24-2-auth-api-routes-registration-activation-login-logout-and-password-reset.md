# Story 24.2: Auth API Routes — Registration, Activation, Login, Logout & Password Reset

Status: done

## Story

As a new user,
I want to register with my invite key, receive an activation email, log in, and reset my password if needed,
so that I have a personal, authenticated account.

## Acceptance Criteria

1. **Given** a valid unused invite key and a unique email
   **When** `POST /auth/register` is called with `{ inviteKey, email, password }`
   **Then** a `users` row is created with `is_active = false` and a random 32-byte hex `activation_token`; the invite key is marked used; an activation email is sent to the normalized email containing `APP_URL/auth/activate?token=<token>`
   **And** response is `201 {}` with no user data in the body

2. **Given** an already-used invite key
   **When** `POST /auth/register` is called
   **Then** response is `400 { error: "Invite key not recognized or already used" }`

3. **Given** an email already registered
   **When** `POST /auth/register` is called
   **Then** response is `400 { error: "Email already registered" }`

4. **Given** a valid, unexpired activation token
   **When** `GET /auth/activate?token=<token>` is called
   **Then** `users.is_active = true`; `activation_token` and `activation_token_expires_at` cleared to null; a new session is created; session cookie set (httpOnly, Secure when `APP_URL` starts with `https://`, SameSite=Lax, 30-day maxAge); response redirects to `APP_URL/onboarding`

5. **Given** an expired or invalid activation token
   **When** `GET /auth/activate?token=<token>` is called
   **Then** response is `400 { error: "Activation link invalid or expired" }`

6. **Given** valid email + password for an active account
   **When** `POST /auth/login` is called with `{ email, password }`
   **Then** a session is created; session cookie is set; response is `200 { onboardingComplete: false }` (hardcoded false — placeholder until Epic 25 adds `/api/onboarding/status`)

7. **Given** an inactive account (is_active = false)
   **When** `POST /auth/login` is called
   **Then** response is `403 { error: "Account is disabled" }`

8. **Given** wrong email or password
   **When** `POST /auth/login` is called
   **Then** response is `401 { error: "Invalid email or password" }` (same error for both cases — never reveal which was wrong)

9. **Given** a valid session cookie
   **When** `POST /auth/logout` is called
   **Then** the session row is deleted from DB; the cookie is cleared; response is `204`

10. **Given** a request with a valid admin session cookie
    **When** `POST /auth/reset-request` is called with `{ email }`
    **Then** a reset token is generated and stored with 1-hour expiry; a reset email is sent containing `APP_URL/reset?token=<token>`; all existing sessions for the target user are deleted; response is `204`

11. **Given** no session cookie or a session with `role !== 'admin'`
    **When** `POST /auth/reset-request` is called
    **Then** response is `401 { error: "Unauthorized" }` (no session) or `403 { error: "Forbidden" }` (non-admin session)

12. **Given** a valid, unexpired reset token
    **When** `POST /auth/reset` is called with `{ token, newPassword }`
    **Then** `users.password_hash` updated with argon2id (memory=65536, iterations=3, parallelism=4); `reset_token` and `reset_token_expires_at` cleared to null; response is `204`

13. **Given** an expired or invalid reset token
    **When** `POST /auth/reset` is called
    **Then** response is `400 { error: "Reset token invalid or expired" }`

## Tasks / Subtasks

- [x] Install argon2 package (AC: #1, #6, #12)
  - [x] `bun add argon2`
  - [x] Verify import and a test hash works: `await argon2.hash('test', { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 })`
  - [x] If compile fails, see Dev Notes for `@node-rs/argon2` alternative

- [x] Update `src/db/schema.ts` with new column and indexes (AC: #4, #5 — migration resolves deferred-work items)
  - [x] Add `activationTokenExpiresAt: text('activation_token_expires_at')` to `users` table (after `activationToken` field)
  - [x] Add `index` to drizzle-orm/sqlite-core imports
  - [x] Add `index('users_activation_token_idx').on(table.activationToken)` in users table callback
  - [x] Add `index('users_reset_token_idx').on(table.resetToken)` in users table callback
  - [x] Add `index('sessions_user_id_idx').on(table.userId)` in sessions table callback
  - [x] Add `index('sessions_expires_at_idx').on(table.expiresAt)` in sessions table callback

- [x] Generate and commit migration (AC: #4)
  - [x] Run `bun run db:generate`
  - [x] Rename generated file to `0020_auth_indexes.sql` per project naming convention
  - [x] Verify SQL contains ALTER TABLE for `activation_token_expires_at` + 4 CREATE INDEX statements
  - [x] Update `_journal.json` slug to match renamed file if Drizzle used a different name

- [x] Create `src/server/routes/api-auth.ts` (AC: #1–#13)
  - [x] `POST /register` — validate body, normalize email, hash password, run check-and-insert transaction, fire-and-forget activation email
  - [x] `GET /activate` — query user by activation_token, check expiry, activate user, create session, set cookie, redirect to `APP_URL/onboarding`
  - [x] `POST /login` — normalize email, lookup user, verify argon2 hash, check is_active, create session, set cookie, return `{ onboardingComplete: false }`
  - [x] `POST /logout` — read session cookie, delete session row, clear cookie
  - [x] `POST /reset-request` — inline admin session check (no middleware yet), generate reset token with 1h expiry, delete all target-user sessions, send reset email
  - [x] `POST /reset` — find user by reset_token, check expiry, hash new password, clear token fields

- [x] Mount route in `src/index.ts`
  - [x] `import authRoute from './server/routes/api-auth'`
  - [x] `app.route('/auth', authRoute)` — add with other route registrations, before `app.onError(errorHandler)`

- [x] Write `src/server/routes/api-auth.test.ts` (AC: all)
  - [x] Set all env vars BEFORE imports (see Dev Notes)
  - [x] `beforeAll`: create `users`, `invite_keys`, `sessions` tables via raw SQL on `prodSqlite`
  - [x] `beforeEach`: `DELETE FROM sessions`, `DELETE FROM users`, `DELETE FROM invite_keys`
  - [x] Registration: invalid invite key → 400
  - [x] Registration: duplicate email → 400
  - [x] Registration: success → 201 `{}`; verify user row created with `is_active=0`; verify invite key marked used
  - [x] Activation: missing/invalid token → 400
  - [x] Activation: expired token (set `activation_token_expires_at` to past ISO datetime) → 400
  - [x] Activation: success → 302 redirect; Location header = `http://localhost:3000/onboarding`; `set-cookie` header present; `users.is_active` becomes 1
  - [x] Login: wrong password → 401
  - [x] Login: inactive account → 403
  - [x] Login: success → 200 `{ onboardingComplete: false }`; `set-cookie` header present
  - [x] Logout: valid session → 204; session row deleted; cookie cleared (set-cookie with empty value or maxAge=0)
  - [x] Logout: no session → still 204 (idempotent)
  - [x] Reset-request: no session cookie → 401
  - [x] Reset-request: non-admin session → 403
  - [x] Reset-request: admin session → 204; reset token set; all target-user sessions deleted
  - [x] Reset: invalid token → 400
  - [x] Reset: expired token → 400
  - [x] Reset: success → 204; password hash updated; token fields cleared; new password works for login

- [x] Update `_bmad-output/implementation-artifacts/deferred-work.md` to mark resolved items from 24.1 review

### Review Findings

- [x] [Review][Patch] `reset` handler must delete existing sessions after password change [api-auth.ts:~260]
- [x] [Review][Patch] APP_URL missing from REQUIRED_ENV_VARS — Secure cookie flag silently wrong if missing or http:// in production [src/index.ts:~22]
- [x] [Review][Patch] activationToken and resetToken should use `uniqueIndex`, not plain `index` [src/db/schema.ts:~122]
- [x] [Review][Patch] ENCRYPTION_KEY startup check validates length but not hex decodability [src/index.ts:~30]
- [x] [Review][Patch] Register transaction: `created.get()!` non-null assertion — add explicit null guard with structured error [api-auth.ts:~77]
- [x] [Review][Patch] Test: `beforeEach` deletes `users` before `invite_keys` — FK-unsafe if enforcement ever enabled [api-auth.test.ts:~51]
- [x] [Review][Patch] Test: `insertAdminSession` uses non-standard session ID format (not 64-char hex) [api-auth.test.ts:~115]

- [x] [Review][Defer] Timing oracle: SQL equality on token lookup is not constant-time [api-auth.ts:~102,~208] — deferred, 256-bit token space makes practical exploitation infeasible
- [x] [Review][Defer] reset-request: repeated admin calls cycle reset tokens — no idempotency guard [api-auth.ts:~180] — deferred, admin-only endpoint; known limitation
- [x] [Review][Defer] sendMail creates a new nodemailer transport per invocation — no SMTP connection pooling [src/server/lib/mailer.ts:~10] — deferred, low call volume at MVP scale
- [x] [Review][Defer] No rate limiting on auth endpoints [api-auth.ts] — deferred, infrastructure concern; address with auth middleware in future story
- [x] [Review][Defer] Token expiry uses ISO-8601 string comparison — fragile if non-UTC timestamps ever introduced [api-auth.ts:~102,~208] — deferred, all app timestamps use toISOString()
- [x] [Review][Defer] inviteKeys has no expiry column — invite keys valid indefinitely [src/db/schema.ts:~124] — deferred, enhancement; out of scope for epic 24
- [x] [Review][Defer] users table has no updatedAt / last-login audit columns [src/db/schema.ts] — deferred, enhancement; out of scope for story 24.2
- [x] [Review][Defer] userSecrets has no ON DELETE CASCADE — orphaned rows if user deleted [src/db/schema.ts:~128] — deferred, table unused in story 24.2 routes; address when user deletion flow added
- [x] [Review][Defer] Activation/reset tokens in URL query params — appear in server logs and browser history [api-auth.ts:~91,~198] — deferred, standard MVP pattern; mitigated by short TTLs
- [x] [Review][Defer] Register invite-key race under multi-worker deployment [api-auth.ts:~57] — deferred, single-threaded Bun runtime; UNIQUE constraint on key provides atomic guard
- [x] [Review][Defer] reset-request: resetToken write and session delete not in a single transaction [api-auth.ts:~226] — deferred, no race window in single-threaded Bun; harden in future
- [x] [Review][Defer] No session count cap per user [api-auth.ts:~115,~165] — deferred, MVP scale (~10 users); add GC job before production scale

## Dev Notes

### New Files

```
src/server/routes/api-auth.ts          ← new route file (kebab-case.ts)
src/server/routes/api-auth.test.ts     ← co-located test (project convention)
src/db/migrations/0020_auth_indexes.sql  ← generated, renamed
```

### Existing Files Modified

```
src/db/schema.ts                       ← add column + indexes
src/index.ts                           ← mount /auth route
src/db/migrations/meta/_journal.json   ← auto-updated by drizzle-kit
src/db/migrations/meta/0020_snapshot.json  ← auto-generated
```

### New Package

```bash
bun add argon2
```

**Argon2 + Bun compatibility:** `argon2` (node-argon2) is a native addon. Bun 1.3.x has native addon support but it can be hit-or-miss. If `bun add argon2` fails to compile OR produces a runtime error, use `@node-rs/argon2` instead:

```bash
bun remove argon2
bun add @node-rs/argon2
```

| | `argon2` | `@node-rs/argon2` |
|---|---|---|
| Hash | `argon2.hash(pwd, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 })` | `hash(pwd, { memoryCost: 65536, timeCost: 3, parallelism: 4, algorithm: Algorithm.Argon2id })` |
| Verify | `argon2.verify(hash, pwd)` → `boolean` | `verify(hash, pwd)` → `boolean` |
| Import | `import argon2 from 'argon2'` | `import { hash, verify, Algorithm } from '@node-rs/argon2'` |

Both produce compatible PHC-format argon2id strings. Both operations are async — route handlers must be `async`.

### Schema Changes (`src/db/schema.ts`)

Add `index` to imports and update `users` + `sessions` tables:

```typescript
import { integer, real, text, sqliteTable, uniqueIndex, primaryKey, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('standard'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  activationToken: text('activation_token'),
  activationTokenExpiresAt: text('activation_token_expires_at'),  // ← ADD
  resetToken: text('reset_token'),
  resetTokenExpiresAt: text('reset_token_expires_at'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('users_activation_token_idx').on(table.activationToken),  // ← ADD
  index('users_reset_token_idx').on(table.resetToken),             // ← ADD
])

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  data: text('data'),
  expiresAt: text('expires_at').notNull(),
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),      // ← ADD
  index('sessions_expires_at_idx').on(table.expiresAt), // ← ADD
])
```

Run `bun run db:generate`. Expected migration SQL:

```sql
ALTER TABLE `users` ADD `activation_token_expires_at` text;
--> statement-breakpoint
CREATE INDEX `users_activation_token_idx` ON `users` (`activation_token`);
--> statement-breakpoint
CREATE INDEX `users_reset_token_idx` ON `users` (`reset_token`);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);
```

Rename generated file (e.g., `0020_something_random.sql`) to `0020_auth_indexes.sql`. Update `_journal.json` slug if renamed.

### Cookie Handling (Hono built-in — no extra package)

```typescript
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

// Detect secure mode from APP_URL — not NODE_ENV
const isSecure = (process.env.APP_URL ?? '').startsWith('https://')

// Set session cookie
setCookie(c, 'session', sessionId, {
  httpOnly: true,
  secure: isSecure,
  sameSite: 'Lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60,  // 30 days in seconds
})

// Clear cookie on logout (set expired)
setCookie(c, 'session', '', {
  httpOnly: true,
  secure: isSecure,
  sameSite: 'Lax',
  path: '/',
  maxAge: 0,
})
```

`hono/cookie` is built into Hono v4 — no additional install.

### Session Creation Pattern

```typescript
import { randomBytes } from 'node:crypto'

const sessionId = randomBytes(32).toString('hex')
const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

db.insert(sessions).values({
  id: sessionId,
  userId: user.id,
  data: null,
  expiresAt: sessionExpiresAt,
}).run()
```

### Registration Handler Pattern

**Critical: argon2 is async, `db.transaction()` callback is synchronous — hash password BEFORE the transaction.**

```typescript
import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import argon2 from 'argon2'
import { db } from '../../db/client'
import { users, inviteKeys, sessions } from '../../db/schema'
import { sendMail } from '../lib/mailer'

app.post('/register', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const { inviteKey, password } = parsed.data
  const email = parsed.data.email.toLowerCase().trim()  // ← normalize here

  // Hash BEFORE transaction (async — cannot await inside sync tx callback)
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })

  const activationToken = randomBytes(32).toString('hex')
  const now = new Date().toISOString()
  const activationTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  let errorCode: 'INVALID_KEY' | 'EMAIL_EXISTS' | null = null

  try {
    db.transaction((tx) => {
      // Atomic check-and-mark for invite key
      const key = tx.select().from(inviteKeys)
        .where(and(eq(inviteKeys.key, inviteKey), isNull(inviteKeys.usedAt)))
        .get()
      if (!key) {
        errorCode = 'INVALID_KEY'
        throw new Error('INVALID_KEY')  // triggers rollback
      }

      // Email uniqueness inside transaction
      const existing = tx.select({ id: users.id }).from(users)
        .where(eq(users.email, email)).get()
      if (existing) {
        errorCode = 'EMAIL_EXISTS'
        throw new Error('EMAIL_EXISTS')  // triggers rollback
      }

      tx.insert(users).values({
        email, passwordHash, role: 'standard',
        isActive: false, activationToken, activationTokenExpiresAt, createdAt: now,
      }).run()

      const created = tx.select({ id: users.id }).from(users)
        .where(eq(users.email, email)).get()!

      tx.update(inviteKeys)
        .set({ usedByUserId: created.id, usedAt: now })
        .where(eq(inviteKeys.id, key.id))
        .run()
    })
  } catch (err) {
    if (errorCode === 'INVALID_KEY') return c.json({ error: 'Invite key not recognized or already used' }, 400)
    if (errorCode === 'EMAIL_EXISTS') return c.json({ error: 'Email already registered' }, 400)
    throw err  // unexpected — propagates to global errorHandler
  }

  const activationUrl = `${process.env.APP_URL}/auth/activate?token=${activationToken}`
  sendMail({
    to: email,
    subject: 'Activate your account',
    html: `<p>Click to activate your account: <a href="${activationUrl}">${activationUrl}</a></p>`,
  }).catch((err) => console.error('[auth] activation email failed:', err))
  // Fire-and-forget: email failure does NOT abort 201 response

  return c.json({}, 201)
})
```

**Zod schema for registration:**
```typescript
const registerSchema = z.object({
  inviteKey: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})
```

### Activation Handler Pattern

```typescript
import { gte, isNull } from 'drizzle-orm'
import { getCookie, setCookie } from 'hono/cookie'

app.get('/activate', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'Activation link invalid or expired' }, 400)

  const now = new Date().toISOString()
  const user = db.select().from(users)
    .where(and(
      eq(users.activationToken, token),
      gte(users.activationTokenExpiresAt, now),  // expiry check
    ))
    .get()
  if (!user) return c.json({ error: 'Activation link invalid or expired' }, 400)

  const sessionId = randomBytes(32).toString('hex')
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  db.transaction((tx) => {
    tx.update(users).set({
      isActive: true,
      activationToken: null,
      activationTokenExpiresAt: null,
    }).where(eq(users.id, user.id)).run()

    tx.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      data: null,
      expiresAt: sessionExpiresAt,
    }).run()
  })

  const isSecure = (process.env.APP_URL ?? '').startsWith('https://')
  setCookie(c, 'session', sessionId, {
    httpOnly: true, secure: isSecure, sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 60 * 60,
  })

  return c.redirect(`${process.env.APP_URL}/onboarding`, 302)
})
```

**Redirect target is absolute** (`APP_URL/onboarding`): In dev, `APP_URL=http://localhost:5173` sends the browser to the Vite dev server. In production, `APP_URL=https://domain.com` sends it to Nginx.

### Login Handler Pattern

```typescript
app.post('/login', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const email = parsed.data.email.toLowerCase().trim()  // ← normalize
  const { password } = parsed.data

  const user = db.select().from(users).where(eq(users.email, email)).get()

  // Constant-time path: always call argon2.verify even if user not found (prevents timing attacks)
  const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy'
  const passwordHash = user?.passwordHash ?? dummyHash
  const valid = await argon2.verify(passwordHash, password)

  if (!user || !valid) return c.json({ error: 'Invalid email or password' }, 401)
  if (!user.isActive) return c.json({ error: 'Account is disabled' }, 403)

  const sessionId = randomBytes(32).toString('hex')
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  db.insert(sessions).values({
    id: sessionId, userId: user.id, data: null, expiresAt: sessionExpiresAt,
  }).run()

  const isSecure = (process.env.APP_URL ?? '').startsWith('https://')
  setCookie(c, 'session', sessionId, {
    httpOnly: true, secure: isSecure, sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 60 * 60,
  })

  return c.json({ onboardingComplete: false })
  // onboardingComplete hardcoded false — update in 25.1 when /api/onboarding/status exists
})
```

**Timing attack note:** Always call `argon2.verify` even when user not found — dummy hash prevents the response time from revealing whether an email is registered.

### Inline Admin Check for `reset-request`

Auth middleware doesn't exist until story 24.3. `reset-request` handler must validate admin session inline:

```typescript
import { getCookie } from 'hono/cookie'
import { gte } from 'drizzle-orm'

// Inside POST /reset-request handler — BEFORE any token logic:
const sessionId = getCookie(c, 'session')
if (!sessionId) return c.json({ error: 'Unauthorized' }, 401)

const now = new Date().toISOString()
const session = db.select().from(sessions)
  .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
  .get()
if (!session) return c.json({ error: 'Unauthorized' }, 401)

const requestingUser = db.select({ role: users.role }).from(users)
  .where(eq(users.id, session.userId)).get()
if (!requestingUser || requestingUser.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
```

This inline check is intentionally duplicated — story 24.3 adds proper `auth-middleware.ts` and `admin-middleware.ts` that replace this pattern across all protected routes.

### Reset-Request Handler: Deleting All User Sessions

```typescript
import { inArray } from 'drizzle-orm'  // not needed — use eq on userId directly

// Delete all sessions for the target user
db.delete(sessions).where(eq(sessions.userId, targetUser.id)).run()
```

The `sessions_user_id_idx` added in this story's migration makes this efficient (no full-table scan).

### Route File Structure (`src/server/routes/api-auth.ts`)

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getCookie, setCookie } from 'hono/cookie'
import argon2 from 'argon2'
import { db } from '../../db/client'
import { users, inviteKeys, sessions } from '../../db/schema'
import { sendMail } from '../lib/mailer'

const app = new Hono()

// Zod schemas
const registerSchema = z.object({
  inviteKey: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const resetRequestSchema = z.object({ email: z.string().email() })

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

// Helper
const isSecure = () => (process.env.APP_URL ?? '').startsWith('https://')

app.post('/register', async (c) => { /* ... */ })
app.get('/activate', async (c) => { /* ... */ })
app.post('/login', async (c) => { /* ... */ })
app.post('/logout', async (c) => { /* ... */ })
app.post('/reset-request', async (c) => { /* ... */ })
app.post('/reset', async (c) => { /* ... */ })

export default app
```

### Route Mounting in `src/index.ts`

```typescript
import authRoute from './server/routes/api-auth'

// Add with other route imports and registrations (public — no auth middleware):
app.route('/auth', authRoute)
```

Mount BEFORE `app.onError(errorHandler)` and BEFORE the static file serving. `/auth/*` routes are public — do NOT apply auth middleware to them. CSRF exemptions for these routes will be handled in story 24.3.

### `SESSION_SECRET` Is NOT Needed

The architecture lists `SESSION_SECRET` as a required env var. This app uses opaque 32-byte random session IDs validated server-side in the `sessions` table — no HMAC signing needed. Do **not** add `SESSION_SECRET` to `REQUIRED_ENV_VARS` in `src/index.ts`.

### Design Decisions

**Token storage:** Activation and reset tokens stored as **plaintext** in `users` table (design decision from 24.1 deferred review). For MVP with ~10 users this is accepted. Mitigation: the `users_activation_token_idx` and `users_reset_token_idx` indexes make token lookups efficient but don't change the security posture.

**Session TTL:** 30 days (hardcoded — no env var for MVP).

**Activation token TTL:** 48 hours (per architecture spec). Stored in `activation_token_expires_at` (new column in this story's migration).

**Reset token TTL:** 1 hour (per epic AC). Stored in `reset_token_expires_at` (column already existed from 24.1).

**`onboardingComplete` in login response:** Hardcoded `false`. Update in story 25.1 when `/api/onboarding/status` is implemented.

**`sendMail` is fire-and-forget** in registration and reset-request handlers — SMTP failure logs to `console.error` but does not abort the 201/204 response. This allows auth flows to work even if SMTP is temporarily down. If strict delivery is required, change to `await sendMail(...)` and return 500 on failure.

**Redirect URL is absolute:** `c.redirect(\`${process.env.APP_URL}/onboarding\`, 302)`. In dev, set `APP_URL=http://localhost:5173` so the redirect hits the Vite dev server (which serves the SPA). In prod, `APP_URL=https://domain.com`. **Note for dev setup:** Vite currently only proxies `/api/*` to :3001. `/auth/*` routes need to be directly on the API server. Set `APP_URL` to the API port for email links in dev (`:3001`), but be aware the post-activation redirect goes to that port where no SPA is served in dev mode. A Vite proxy for `/auth/*` will be needed for the full dev flow — add it in story 24.4 when building the auth UI.

**Email normalization:** `email.toLowerCase().trim()` applied in BOTH `register` and `login` handlers before ALL DB lookups. This resolves the deferred item from story 24.1 review.

### Testing (`src/server/routes/api-auth.test.ts`)

Follow the exact same pattern as `api-ingest.test.ts`:

```typescript
// MUST be first — before any production module imports
process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = '0'.repeat(64)
process.env.APP_URL = 'http://localhost:3000'
process.env.SMTP_HOST = 'localhost'
process.env.SMTP_PORT = '587'
process.env.SMTP_USER = 'test'
process.env.SMTP_PASS = 'test'
process.env.SMTP_FROM = 'test@test.com'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { default: authApp } = await import('./api-auth')
const { db } = await import('../../db/client')
const prodSqlite = (db as unknown as { $client: Database }).$client

beforeAll(() => {
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'standard',
      is_active INTEGER NOT NULL DEFAULT 0,
      activation_token TEXT,
      activation_token_expires_at TEXT,
      reset_token TEXT,
      reset_token_expires_at TEXT,
      created_at TEXT NOT NULL
    )
  `)
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS invite_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      used_by_user_id INTEGER REFERENCES users(id),
      used_at TEXT
    )
  `)
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      data TEXT,
      expires_at TEXT NOT NULL
    )
  `)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM sessions')
  prodSqlite.run('DELETE FROM users')
  prodSqlite.run('DELETE FROM invite_keys')
})
```

**Test HTTP via `authApp.request()`:**
```typescript
const res = await authApp.request('/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ inviteKey: 'TEST-KEY', email: 'test@example.com', password: 'password123' }),
})
expect(res.status).toBe(201)
```

**SMTP in tests:** `sendMail` is fire-and-forget (`.catch(...)` in handler). SMTP calls in tests will fail silently (connection refused) — this is expected and does not cause test failures. No mock needed.

**Argon2 in tests:** Argon2 hashing in `beforeEach` setup helpers will be slower than typical unit tests (~100–200ms per hash). Use real hashes — do not mock argon2.

**Session cookie in tests:** Check `res.headers.get('set-cookie')` for the session cookie:
```typescript
const cookie = res.headers.get('set-cookie')
expect(cookie).toContain('session=')
expect(cookie).toContain('HttpOnly')
expect(cookie).toContain('SameSite=Lax')
```

**Redirect in tests:** Hono's `c.redirect()` returns a Response with status 302 and a `location` header. `authApp.request()` does NOT follow redirects automatically:
```typescript
const res = await authApp.request('/activate?token=...')
expect(res.status).toBe(302)
expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding')
```

### Deferred Items from Story 24.1 Addressed Here

- ✅ Email normalization (`.toLowerCase()`) — implemented in register + login handlers
- ✅ Invite key race condition — resolved with check-and-mark inside `db.transaction()`
- ✅ Missing DB indexes on `sessions(user_id)`, `sessions(expires_at)`, `users(activation_token)`, `users(reset_token)` — added via migration
- ⏭ GCM auth tag mismatch — `decrypt()` is NOT called in story 24.2 handlers (no user_secrets reads). Remains deferred to Epic 25 onboarding routes where secrets are read.
- ⏭ `sessions.data` size cap — still no constraint. Kept deferred (data is null in 24.2).

### References

- Epic 24 story 24.2 ACs: [Source: _bmad-output/planning-artifacts/epics/epic-24-authentication-and-multi-user-data-foundation.md#story-242]
- Architecture — Authentication & Session: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#authentication--session]
- Architecture — Auth routes list: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#api-design]
- UX — Auth surfaces context (story 24.2 is backend only; no UI): [Source: _bmad-output/planning-artifacts/ux-design-specification/auth-onboarding-admin-ux.md]
- Story 24.1 (foundation): [Source: _bmad-output/implementation-artifacts/24-1-crypto-module-mailer-module-and-auth-db-schema.md]
- Deferred work being addressed: [Source: _bmad-output/implementation-artifacts/deferred-work.md]
- Project context — testing rules: [Source: _bmad-output/project-context.md#testing-rules]
- Project context — framework rules (Hono patterns, error shape): [Source: _bmad-output/project-context.md#framework-specific-rules]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- argon2 native addon installed successfully with bun add argon2 (bun 1.3.11 has native addon support)
- Dummy hash for timing-attack prevention needed a valid 16-byte base64 salt; wrapped verify in try/catch as additional safety
- Hono's `setCookie` sets headers on context accumulator; must use `c.body(null, 204)` for 204 responses (not `new Response(null, {status:204})` which bypasses context headers)

### Completion Notes List

- Installed argon2 0.44.0 with argon2id parameters (memoryCost=65536, timeCost=3, parallelism=4) per spec
- Added `activationTokenExpiresAt` column and 4 indexes (users_activation_token_idx, users_reset_token_idx, sessions_user_id_idx, sessions_expires_at_idx) via migration 0020_auth_indexes.sql
- Created `api-auth.ts` with 6 routes: POST /register, GET /activate, POST /login, POST /logout, POST /reset-request, POST /reset
- All routes use atomic DB transactions where multi-row writes occur; argon2 hashed BEFORE transaction since async cannot run inside sync tx callback
- Login handler uses constant-time path (always calls argon2.verify) to prevent timing attacks; dummy hash uses valid argon2id PHC format
- Inline admin session check in /reset-request (no middleware yet — 24.3 adds proper auth middleware)
- Mounted `/auth` route in `src/index.ts` before `app.onError(errorHandler)`
- 21 tests passing across all 13 ACs; SMTP failures expected and silent (fire-and-forget)
- Resolved 3 deferred items from story 24.1 review: email normalization, invite key race condition, missing DB indexes

### File List

- `job-hunt-dashboard/src/db/schema.ts` — added `activationTokenExpiresAt` column to users; added index callbacks to users and sessions tables; added `index` to imports
- `job-hunt-dashboard/src/db/migrations/0020_auth_indexes.sql` — new migration: ALTER TABLE users + 4 CREATE INDEX statements
- `job-hunt-dashboard/src/db/migrations/meta/_journal.json` — updated tag from 0020_fixed_iron_fist to 0020_auth_indexes
- `job-hunt-dashboard/src/db/migrations/meta/0020_snapshot.json` — auto-generated by drizzle-kit
- `job-hunt-dashboard/src/server/routes/api-auth.ts` — new auth route file with all 6 handlers
- `job-hunt-dashboard/src/server/routes/api-auth.test.ts` — 21 tests covering all ACs
- `job-hunt-dashboard/src/index.ts` — added authRoute import and `app.route('/auth', authRoute)`
- `job-hunt-dashboard/package.json` — added argon2 dependency
- `job-hunt-dashboard/bun.lock` — updated lockfile
- `_bmad-output/implementation-artifacts/deferred-work.md` — marked 3 resolved items from 24.1 review
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated story status to review

## Change Log

- 2026-04-28: Implemented story 24.2 — auth API routes (register, activate, login, logout, reset-request, reset); migration 0020_auth_indexes.sql adds activation_token_expires_at column and 4 DB indexes; resolved 3 deferred items from story 24.1 code review
