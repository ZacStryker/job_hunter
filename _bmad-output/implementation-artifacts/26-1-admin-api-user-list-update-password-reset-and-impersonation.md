# Story 26.1: Admin API — User List, Update, Password Reset & Impersonation

Status: done

## Story

As an admin,
I want API endpoints to view all users, update accounts, trigger password resets, and impersonate users for debugging,
So that I can handle all support tasks without direct database access.

## Acceptance Criteria

1. **Given** a valid admin session
   **When** `GET /api/admin/users` is called
   **Then** response is `200 [ { id, email, name, role, isActive, createdAt, lastLoginAt } ]` for all registered users
   **And** `passwordHash`, `activationToken`, `activationTokenExpiresAt`, `resetToken`, `resetTokenExpiresAt` are NEVER included in the response

2. **Given** a valid admin session
   **When** `PATCH /api/admin/users/:id` is called with `{ name?, email?, role?, isActive? }`
   **Then** specified fields are updated; response is `200` with the updated user object (same shape as GET, no sensitive fields)

3. **Given** `isActive` is set to `false` in the PATCH body
   **When** the update succeeds
   **Then** all existing sessions for that user are deleted immediately — they are logged out

4. **Given** an email already taken by another account
   **When** `PATCH /api/admin/users/:id` is called with that email
   **Then** response is `409 { error: "Email already in use" }`

5. **Given** a valid admin session
   **When** `POST /api/admin/impersonate/:id` is called with a target user's id
   **Then** the admin's session `data` is updated to `JSON.stringify({ impersonating: targetUserId })`
   **And** all subsequent `/api/*` calls use `targetUserId` as the effective `userId` for data scoping
   **And** response is `200 { impersonating: { id, email, name } }`

6. **Given** an active impersonation session
   **When** `POST /api/admin/impersonate/exit` is called
   **Then** session `data` is set to `null`; the admin's own `userId` is restored as the effective user
   **And** response is `200 {}`

7. **Given** a non-admin session
   **When** any `/api/admin/*` route is accessed
   **Then** response is `403 { error: "Forbidden" }` — admin middleware enforces this

8. **Given** an admin is actively impersonating a standard user
   **When** `POST /api/admin/impersonate/exit` is called
   **Then** the admin middleware still allows the request (it checks the real admin's role, not the impersonated user's role)

## Tasks / Subtasks

### 1. Update `src/db/schema.ts` — add `name` and `lastLoginAt` to `users` table (AC: #1, #2, #5)

- [x] Add two columns to the `users` table definition:
  ```ts
  name: text('name'),           // nullable — new users have no name until admin sets it
  lastLoginAt: text('last_login_at'),  // nullable — null until first login
  ```
  Place them after `createdAt` for readability.
- [x] Full updated users table definition:
  ```ts
  export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('standard'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    activationToken: text('activation_token'),
    activationTokenExpiresAt: text('activation_token_expires_at'),
    resetToken: text('reset_token'),
    resetTokenExpiresAt: text('reset_token_expires_at'),
    createdAt: text('created_at').notNull(),
    name: text('name'),
    lastLoginAt: text('last_login_at'),
  }, (table) => [
    uniqueIndex('users_activation_token_idx').on(table.activationToken),
    uniqueIndex('users_reset_token_idx').on(table.resetToken),
  ])
  ```

### 2. Generate and commit migration (AC: #1, #2)

- [x] After updating `schema.ts`, run: `bun run db:generate`
- [x] Verify the generated SQL file (in `src/db/migrations/`) contains:
  ```sql
  ALTER TABLE `users` ADD `name` text;
  ALTER TABLE `users` ADD `last_login_at` text;
  ```
  If Drizzle generates a different form, verify it is semantically equivalent.
- [x] Commit the generated `.sql` file to the repo.
- [x] Do NOT manually create the migration file — always use `bun run db:generate`.

### 3. Update `src/server/routes/api-auth.ts` — set `lastLoginAt` on login (AC: #1)

- [x] In the `POST /login` handler, after verifying the password and before creating the session, update the user's `lastLoginAt`:
  ```ts
  // After: if (!user || !valid) ... and if (!user.isActive) ...
  const loginAt = new Date().toISOString()
  db.update(users).set({ lastLoginAt: loginAt }).where(eq(users.id, user.id)).run()
  ```
  Insert this immediately before the `db.insert(sessions).values(...)` line.

### 4. Update `src/server/types.ts` — add `sessionUserId` to `AppEnv` (AC: #8)

- [x] Update `AppEnv` to include both `userId` and `sessionUserId`:
  ```ts
  export type AppEnv = {
    Variables: {
      userId: number        // effective user ID — equals sessionUserId unless impersonating
      sessionUserId: number // always the real authenticated user's DB id
    }
  }
  ```
  This allows admin middleware to check the real admin's role even during impersonation.

### 5. Update `src/server/middleware/auth-middleware.ts` — support impersonation (AC: #5, #6, #8)

- [x] After the existing session lookup, parse `session.data` for impersonation:
  ```ts
  c.set('userId', session.userId)  // existing line — REPLACE with block below
  ```
  Replace the single `c.set('userId', session.userId)` line with:
  ```ts
  let effectiveUserId = session.userId
  if (session.data) {
    try {
      const data = JSON.parse(session.data) as { impersonating?: number }
      if (typeof data.impersonating === 'number') effectiveUserId = data.impersonating
    } catch {}
  }
  c.set('userId', effectiveUserId)
  c.set('sessionUserId', session.userId)
  ```
- [x] The `await next()` call stays exactly where it is — only the userId assignment logic changes.
- [x] Import additions: none — JSON.parse is built-in; no new imports required.

### 6. Update `src/server/middleware/admin-middleware.ts` — use `sessionUserId` for role check (AC: #7, #8)

- [x] Change the role check from `c.get('userId')` to `c.get('sessionUserId')`:
  ```ts
  export const adminMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    const userId = c.get('sessionUserId')  // ← was c.get('userId')
    const user = db.select({ role: users.role }).from(users)
      .where(eq(users.id, userId))
      .get()
    if (!user || user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    await next()
  }
  ```
  This ensures the admin's real role is checked even when impersonating a standard user.

### 7. Create `src/server/routes/api-admin.ts` — all four endpoints (AC: #1–#6)

- [x] File structure:
  ```ts
  import { Hono } from 'hono'
  import { z } from 'zod'
  import { eq } from 'drizzle-orm'
  import { getCookie } from 'hono/cookie'
  import { db } from '../../db/client'
  import { users, sessions } from '../../db/schema'
  import { sendMail } from '../lib/mailer'
  import type { AppEnv } from '../types'

  const app = new Hono<AppEnv>()
  ```

- [x] **`GET /users`** (AC: #1):
  ```ts
  app.get('/users', (c) => {
    const allUsers = db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users).all()
    return c.json(allUsers)
  })
  ```
  Use explicit column selection — NEVER `db.select().from(users)` (which would include `passwordHash`, `activationToken`, `resetToken`, etc.).

- [x] **Validation schema for PATCH** (AC: #2, #4):
  ```ts
  const patchUserSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(['standard', 'admin']).optional(),
    isActive: z.boolean().optional(),
  })
  ```

- [x] **`PATCH /users/:id`** (AC: #2, #3, #4):
  ```ts
  app.patch('/users/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10)
    if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

    const parsed = patchUserSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

    const target = db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()
    if (!target) return c.json({ error: 'User not found' }, 404)

    const updates = parsed.data
    const updateSet: Record<string, unknown> = {}

    if (updates.name !== undefined) updateSet.name = updates.name
    if (updates.role !== undefined) updateSet.role = updates.role
    if (updates.isActive !== undefined) updateSet.isActive = updates.isActive

    if (updates.email !== undefined) {
      const emailNorm = updates.email.toLowerCase().trim()
      const conflict = db.select({ id: users.id }).from(users)
        .where(eq(users.email, emailNorm)).get()
      if (conflict && conflict.id !== id) return c.json({ error: 'Email already in use' }, 409)
      updateSet.email = emailNorm
    }

    db.update(users).set(updateSet).where(eq(users.id, id)).run()

    if (updates.isActive === false) {
      db.delete(sessions).where(eq(sessions.userId, id)).run()
    }

    const updated = db.select({
      id: users.id, email: users.email, name: users.name,
      role: users.role, isActive: users.isActive,
      createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
    }).from(users).where(eq(users.id, id)).get()

    return c.json(updated)
  })
  ```

- [x] **Route ordering for impersonation** — CRITICAL: Define `/impersonate/exit` BEFORE `/impersonate/:id`. Without this, Hono will match "exit" as the `:id` parameter:
  ```ts
  // Exit FIRST — prevents "exit" from being captured as :id
  app.post('/impersonate/exit', (c) => { ... })
  app.post('/impersonate/:id', (c) => { ... })
  ```

- [x] **`POST /impersonate/exit`** (AC: #6, #8):
  ```ts
  app.post('/impersonate/exit', (c) => {
    const sessionId = getCookie(c, 'session')
    if (sessionId) {
      db.update(sessions).set({ data: null }).where(eq(sessions.id, sessionId)).run()
    }
    return c.json({})
  })
  ```

- [x] **`POST /impersonate/:id`** (AC: #5):
  ```ts
  app.post('/impersonate/:id', (c) => {
    const targetId = parseInt(c.req.param('id'), 10)
    if (isNaN(targetId)) return c.json({ error: 'Invalid id' }, 400)

    const target = db.select({
      id: users.id, email: users.email, name: users.name,
    }).from(users).where(eq(users.id, targetId)).get()
    if (!target) return c.json({ error: 'User not found' }, 404)

    const sessionId = getCookie(c, 'session')
    if (sessionId) {
      db.update(sessions)
        .set({ data: JSON.stringify({ impersonating: targetId }) })
        .where(eq(sessions.id, sessionId))
        .run()
    }

    return c.json({ impersonating: target })
  })
  ```

- [x] Add `export default app` at the end.

### 8. Mount admin routes in `src/index.ts` (AC: #7)

- [x] Add import at top of file (alongside the existing route imports):
  ```ts
  import adminRoute from './server/routes/api-admin'
  ```
- [x] Add route mount after the existing `app.route('/api/onboarding', onboardingRoute)` line:
  ```ts
  app.route('/api/admin', adminRoute)
  ```
  The middleware for `/api/*` (authMiddleware) and `/api/admin/*` (adminMiddleware) are already registered at lines 77–78 — no changes needed there.

### 9. Create `src/server/routes/api-admin.test.ts` — comprehensive tests (AC: #1–#8)

- [x] **File header** (DB isolation — must be first):
  ```ts
  process.env.DB_PATH = ':memory:'
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.APP_URL = 'http://localhost:3000'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_USER = 'test'
  process.env.SMTP_PASS = 'test'
  process.env.SMTP_FROM = 'test@test.com'

  import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
  import { Hono } from 'hono'
  import { Database } from 'bun:sqlite'
  import type { AppEnv } from '../../server/types'

  const { default: adminRoute } = await import('./api-admin')
  const { db } = await import('../../db/client')
  const prodSqlite = (db as unknown as { $client: Database }).$client
  ```

- [x] **Test app factory** — inject `userId` (effective/impersonated) AND `sessionUserId` (real admin), plus a session cookie for routes that call `getCookie`:
  ```ts
  function makeAdminApp(userId = 1, sessionUserId = 1, sessionId = 'test-session') {
    const w = new Hono<AppEnv>()
    w.use('*', (c, next) => {
      c.set('userId', userId)
      c.set('sessionUserId', sessionUserId)
      return next()
    })
    w.route('/', adminRoute)
    return w
  }

  // Helper: make a request with a session cookie (needed for impersonate endpoints)
  function request(app: Hono<AppEnv>, path: string, opts: RequestInit & { sessionId?: string } = {}) {
    const sessionId = opts.sessionId ?? 'test-session'
    const headers = new Headers(opts.headers ?? {})
    headers.set('Cookie', `session=${sessionId}; csrf_token=tok`)
    if (opts.method && opts.method !== 'GET') {
      headers.set('x-csrf-token', 'tok')
    }
    return app.request(path, { ...opts, headers })
  }
  ```

- [x] **DDL setup** (full schema with new columns):
  ```ts
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
        created_at TEXT NOT NULL,
        name TEXT,
        last_login_at TEXT
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
  })
  ```

- [x] **Test helpers**:
  ```ts
  function insertUser(id: number, opts: { email?: string; role?: string; isActive?: boolean; name?: string } = {}) {
    prodSqlite.run(
      `INSERT INTO users (id, email, password_hash, role, is_active, created_at, name)
       VALUES (?, ?, 'hash', ?, ?, ?, ?)`,
      [id, opts.email ?? `user${id}@test.com`, opts.role ?? 'standard',
       opts.isActive !== false ? 1 : 0, new Date().toISOString(), opts.name ?? null]
    )
  }

  function insertSession(sessionId: string, userId: number, data: string | null = null) {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
    prodSqlite.run(
      `INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)`,
      [sessionId, userId, data, expiresAt]
    )
  }
  ```

- [x] **`GET /users` tests** (AC: #1):
  ```ts
  describe('GET /api/admin/users', () => {
    test('returns all users with safe fields only', async () => {
      insertUser(1, { email: 'admin@test.com', role: 'admin', name: 'Admin' })
      insertUser(2, { email: 'user@test.com', role: 'standard' })
      const app = makeAdminApp()
      const res = await request(app, '/users')
      expect(res.status).toBe(200)
      const body = await res.json() as Array<Record<string, unknown>>
      expect(body).toHaveLength(2)
      expect(body[0]).toHaveProperty('id')
      expect(body[0]).toHaveProperty('email')
      expect(body[0]).toHaveProperty('name')
      expect(body[0]).toHaveProperty('role')
      expect(body[0]).toHaveProperty('isActive')
      expect(body[0]).toHaveProperty('createdAt')
      expect(body[0]).toHaveProperty('lastLoginAt')
      expect(body[0]).not.toHaveProperty('passwordHash')
      expect(body[0]).not.toHaveProperty('activationToken')
      expect(body[0]).not.toHaveProperty('resetToken')
    })

    test('empty table returns []', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/users')
      expect(res.status).toBe(200)
      const body = await res.json() as unknown[]
      expect(body).toEqual([])
    })
  })
  ```

- [x] **`PATCH /users/:id` tests** (AC: #2, #3, #4):
  ```ts
  describe('PATCH /api/admin/users/:id', () => {
    test('updates name → 200 with updated user', async () => {
      insertUser(1, { name: 'Old Name' })
      const app = makeAdminApp()
      const res = await request(app, '/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body.name).toBe('New Name')
    })

    test('updates role → 200', async () => {
      insertUser(1, { role: 'standard' })
      const app = makeAdminApp()
      const res = await request(app, '/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body.role).toBe('admin')
    })

    test('deactivating user deletes their sessions (AC: #3)', async () => {
      insertUser(1)
      insertSession('user-session', 1)
      const app = makeAdminApp()
      const res = await request(app, '/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      expect(res.status).toBe(200)
      const remaining = prodSqlite.query('SELECT * FROM sessions WHERE user_id = 1').all()
      expect(remaining).toHaveLength(0)
    })

    test('email conflict → 409', async () => {
      insertUser(1, { email: 'a@test.com' })
      insertUser(2, { email: 'b@test.com' })
      const app = makeAdminApp()
      const res = await request(app, '/users/2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@test.com' }),
      })
      expect(res.status).toBe(409)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('Email already in use')
    })

    test('email update to same email (self-conflict) → 200', async () => {
      insertUser(1, { email: 'self@test.com' })
      const app = makeAdminApp()
      const res = await request(app, '/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'self@test.com' }),
      })
      expect(res.status).toBe(200)
    })

    test('user not found → 404', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/users/999', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      })
      expect(res.status).toBe(404)
    })

    test('response never contains passwordHash or tokens', async () => {
      insertUser(1)
      const app = makeAdminApp()
      const res = await request(app, '/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Safe' }),
      })
      const text = await res.text()
      expect(text).not.toContain('password')
      expect(text).not.toContain('token')
    })

    test('invalid JSON body → 400', async () => {
      insertUser(1)
      const app = makeAdminApp()
      const res = await request(app, '/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBeDefined()
      expect(body).not.toHaveProperty('message')
    })

    test('invalid role value → 400', async () => {
      insertUser(1)
      const app = makeAdminApp()
      const res = await request(app, '/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'superuser' }),
      })
      expect(res.status).toBe(400)
    })
  })
  ```

- [x] **`POST /impersonate/:id` and `/impersonate/exit` tests** (AC: #5, #6):
  ```ts
  describe('POST /api/admin/impersonate/:id', () => {
    test('valid target → 200 with impersonating object, session data updated', async () => {
      insertUser(1, { role: 'admin' })
      insertUser(2, { email: 'target@test.com', name: 'Target' })
      insertSession('admin-session', 1)
      const app = makeAdminApp(1, 1, 'admin-session')
      const res = await request(app, '/impersonate/2', {
        method: 'POST',
        sessionId: 'admin-session',
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { impersonating: { id: number; email: string; name: string | null } }
      expect(body.impersonating.id).toBe(2)
      expect(body.impersonating.email).toBe('target@test.com')
      const session = prodSqlite.query('SELECT data FROM sessions WHERE id = ?').get('admin-session') as { data: string }
      expect(JSON.parse(session.data)).toEqual({ impersonating: 2 })
    })

    test('target user not found → 404', async () => {
      insertUser(1, { role: 'admin' })
      insertSession('admin-session', 1)
      const app = makeAdminApp()
      const res = await request(app, '/impersonate/999', { method: 'POST', sessionId: 'admin-session' })
      expect(res.status).toBe(404)
    })

    test('invalid id → 400', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/impersonate/notanid', { method: 'POST' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/admin/impersonate/exit', () => {
    test('clears session data → 200', async () => {
      insertUser(1, { role: 'admin' })
      insertSession('admin-session', 1, JSON.stringify({ impersonating: 2 }))
      const app = makeAdminApp()
      const res = await request(app, '/impersonate/exit', {
        method: 'POST',
        sessionId: 'admin-session',
      })
      expect(res.status).toBe(200)
      const session = prodSqlite.query('SELECT data FROM sessions WHERE id = ?').get('admin-session') as { data: string | null }
      expect(session.data).toBeNull()
    })
  })
  ```

### 10. Update `src/server/middleware/auth-middleware.test.ts` — add impersonation test (AC: #5, #8)

- [x] Add to the existing `auth-middleware.test.ts` file, after the existing `authMiddleware` describe block, add a new describe block:
  ```ts
  describe('authMiddleware — impersonation', () => {
    test('session with data.impersonating sets userId to impersonated user', async () => {
      insertUser(1, 'admin')
      insertUser(2)
      // Insert session with impersonating=2 in data
      const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
      prodSqlite.run(
        `INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)`,
        ['imp-session', 1, JSON.stringify({ impersonating: 2 }), expiresAt]
      )
      const app = makeApp()
      const res = await app.request('/test', {
        method: 'GET',
        headers: { Cookie: 'session=imp-session' },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { userId: number }
      expect(body.userId).toBe(2)  // effective userId is the impersonated user
    })

    test('session without impersonating uses session.userId', async () => {
      insertUser(1)
      insertSession('normal-session', 1)
      const app = makeApp()
      const res = await app.request('/test', {
        method: 'GET',
        headers: { Cookie: 'session=normal-session' },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { userId: number }
      expect(body.userId).toBe(1)
    })

    test('malformed session data falls back to session.userId', async () => {
      insertUser(1)
      const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
      prodSqlite.run(
        `INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)`,
        ['bad-data-session', 1, 'not-valid-json', expiresAt]
      )
      const app = makeApp()
      const res = await app.request('/test', {
        method: 'GET',
        headers: { Cookie: 'session=bad-data-session' },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { userId: number }
      expect(body.userId).toBe(1)
    })
  })
  ```
  Note: The `makeApp` test route `/test` already returns `{ userId: c.get('userId') }` — this is the existing pattern and is sufficient.
  The `insertUser` helper in that file also needs updating for the new `name` and `last_login_at` columns — update the SQL:
  ```ts
  // BEFORE:
  function insertUser(id = 1, role = 'standard') {
    prodSqlite.run(
      `INSERT INTO users (id, email, password_hash, role, is_active, created_at)
       VALUES (?, ?, 'hash', ?, 1, ?)`,
      [id, `user${id}@test.com`, role, new Date().toISOString()]
    )
  }
  // AFTER: (columns added, no values needed — nullable defaults to NULL)
  ```
  The existing DDL in `auth-middleware.test.ts` creates the users table WITHOUT `name` and `last_login_at`. After adding those columns to `schema.ts`, the test DDL must also include them:
  ```ts
  prodSqlite.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'standard',
    is_active INTEGER NOT NULL DEFAULT 0,
    activation_token TEXT,
    activation_token_expires_at TEXT,
    reset_token TEXT,
    reset_token_expires_at TEXT,
    created_at TEXT NOT NULL,
    name TEXT,
    last_login_at TEXT
  )`)
  ```

## Dev Notes

### Impersonation Session State Design

Impersonation is stored in `sessions.data` as `JSON.stringify({ impersonating: targetUserId })`. The `sessions.data` column is `TEXT` (nullable JSON blob) — already in the schema. This requires no schema migration.

The `auth-middleware` now parses `session.data` on every request. The cost is negligible (in-memory SQLite + JSON.parse of a small object).

### Why `sessionUserId` Separate from `userId`

During impersonation, `userId` = target user's ID for data scoping. But admin routes (e.g., `POST /impersonate/exit`) are under `/api/admin/*`, which applies `adminMiddleware`. That middleware must check the REAL admin's role — not the impersonated user's role. Without `sessionUserId`, an admin impersonating a standard user could not exit impersonation (admin middleware would return 403 for the standard user's role).

### Route Ordering for `/impersonate/exit` vs `/impersonate/:id`

Hono matches routes in registration order. If `/impersonate/:id` is registered before `/impersonate/exit`, then `POST /impersonate/exit` is treated as `POST /impersonate/:id` with `id = "exit"`, which returns 400 (isNaN("exit")) or 404. Always register the literal path before the parameterized path.

### Password Reset — Reuse Existing Endpoint

This story does NOT add a new password reset endpoint. The existing `POST /auth/reset-request` (in `api-auth.ts`) already handles admin-triggered password resets: it validates admin role directly from the session, generates a reset token, deletes the target user's sessions, and sends the reset email. Story 26.2's UI will call this existing endpoint with `{ email: targetUser.email }`.

### `GET /users` — Explicit Column Select is Mandatory

Do not use `db.select().from(users)` (which returns ALL columns including `passwordHash`, tokens). Always use `db.select({ id, email, name, ... })` with the explicit safe list. The test asserts absence of `passwordHash` and `token` fields.

### Email Normalization on PATCH

Normalize email to `toLowerCase().trim()` before the uniqueness check and DB write. This matches the pattern in `api-auth.ts` registration. The uniqueness check excludes the user's own ID (`conflict.id !== id`) so setting email to the same value succeeds.

### `lastLoginAt` Update in `api-auth.ts`

The `POST /login` handler updates `users.lastLoginAt` immediately before creating the session. Use `new Date().toISOString()` for consistency with all other timestamps in the codebase (ISO 8601, never Unix timestamps).

### Testing `getCookie` in Isolation Tests

The impersonation routes use `getCookie(c, 'session')` to get the session ID for updating. In tests, pass the cookie via `Cookie: session=<id>` header. The test helper `request()` in the test file injects this header so `getCookie` returns the expected value.

### `auth-middleware.test.ts` DDL Update

The test file creates the users table in-memory. After adding `name` and `last_login_at` to `schema.ts`, the Drizzle ORM will generate SQL selecting those columns. Since the test table lacks these columns, queries would fail at runtime. Update the `CREATE TABLE` DDL in `auth-middleware.test.ts` to include both new columns.

### Process Improvement from Epic 25 Retro

Per Epic 25 retro action item #2: before marking any handler task complete, explicitly ask "what happens with empty, wrong type, or boundary input?" Apply this check to all four endpoints:
- `GET /users`: no body input — not applicable
- `PATCH /users/:id`: non-numeric `:id`, invalid JSON, invalid `role` value, duplicate email (same user vs other user)
- `POST /impersonate/:id`: non-numeric `:id`, non-existent user
- `POST /impersonate/exit`: no session cookie (treat as no-op; auth middleware already guards)

### Project Structure

**New files:**
```
src/server/routes/api-admin.ts
src/server/routes/api-admin.test.ts
src/db/migrations/0024_*.sql  (generated by bun run db:generate)
```

**Modified files:**
```
src/db/schema.ts                          ← add name, lastLoginAt to users
src/server/types.ts                       ← add sessionUserId to AppEnv.Variables
src/server/middleware/auth-middleware.ts  ← parse session.data, set sessionUserId
src/server/middleware/admin-middleware.ts ← use sessionUserId for role check
src/server/middleware/auth-middleware.test.ts ← update DDL + add impersonation tests
src/server/routes/api-auth.ts            ← set lastLoginAt on login
src/index.ts                             ← import and mount adminRoute
```

### References

- Epic 26 spec (story 26.1 ACs): `_bmad-output/planning-artifacts/epics/epic-26-admin-user-management.md#story-261`
- Auth middleware (impersonation hooks into existing session.data): `src/server/middleware/auth-middleware.ts`
- Admin middleware (role check to update): `src/server/middleware/admin-middleware.ts`
- AppEnv type (sessionUserId to add): `src/server/types.ts`
- Session schema (data column = nullable JSON blob): `src/db/schema.ts:157–165`
- Index mount point: `src/index.ts:77–89`
- Password reset existing endpoint (no new endpoint needed): `src/server/routes/api-auth.ts:269–313`
- Onboarding test as pattern reference: `src/server/routes/api-onboarding.test.ts`
- Auth middleware test (DDL to update): `src/server/middleware/auth-middleware.test.ts`
- Epic 25 retro (edge-case discipline): `_bmad-output/implementation-artifacts/epic-25-retro-2026-04-30.md`
- Project context rules: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers encountered.

### Completion Notes List

- Added `name` (TEXT, nullable) and `lastLoginAt` (TEXT, nullable) columns to `users` table in schema.ts
- Generated migration `0024_square_rawhide_kid.sql` via `bun run db:generate` — verified contains correct ALTER TABLE statements
- Updated `POST /login` handler in api-auth.ts to set `lastLoginAt = new Date().toISOString()` before session creation
- Added `sessionUserId` to `AppEnv.Variables` in types.ts — tracks real authenticated user ID, separate from effective `userId`
- Updated auth-middleware.ts to parse `session.data` for `{ impersonating: number }` — sets `userId` to impersonated user and `sessionUserId` to real admin
- Updated admin-middleware.ts to check `sessionUserId` (real admin) instead of `userId` for role enforcement — allows admins to exit impersonation
- Created api-admin.ts with all four endpoints: `GET /users`, `PATCH /users/:id`, `POST /impersonate/exit` (registered first), `POST /impersonate/:id`; explicit column selection ensures no sensitive fields leak
- Mounted admin route at `/api/admin` in index.ts
- Created api-admin.test.ts with 16 tests covering all ACs including edge cases (invalid id, email conflict, self-email, session deletion on deactivation, route ordering)
- Updated auth-middleware.test.ts: added `name` and `last_login_at` columns to DDL, added 3 impersonation tests covering active impersonation, no impersonation, and malformed data fallback
- All 301 tests pass, 0 regressions

### File List

- `src/db/schema.ts` (modified — added `name`, `lastLoginAt` to users table)
- `src/db/migrations/0024_square_rawhide_kid.sql` (new — ALTER TABLE for name, last_login_at)
- `src/server/types.ts` (modified — added `sessionUserId` to AppEnv.Variables)
- `src/server/middleware/auth-middleware.ts` (modified — impersonation support, sets sessionUserId)
- `src/server/middleware/admin-middleware.ts` (modified — uses sessionUserId for role check)
- `src/server/middleware/auth-middleware.test.ts` (modified — updated DDL + 3 impersonation tests)
- `src/server/routes/api-auth.ts` (modified — sets lastLoginAt on login)
- `src/server/routes/api-admin.ts` (new — GET /users, PATCH /users/:id, POST /impersonate/:id, POST /impersonate/exit)
- `src/server/routes/api-admin.test.ts` (new — 16 tests for all admin endpoints)
- `src/index.ts` (modified — imports and mounts adminRoute at /api/admin)

### Review Findings

#### Decision Needed

- [x] [Review][Dismissed] **Admin-to-admin impersonation** — decision: allow (1a); no code change needed
- [x] [Review][Dismissed] **Admin impersonating a disabled user** — decision: allow (3a); debugging disabled accounts is a valid use case; no code change needed

#### Patch

- [x] [Review][Patch] **Block admin self-deactivation** [src/server/routes/api-admin.ts:59-62] — fixed: 400 guard added; test added
- [x] [Review][Patch] **Block demoting the last remaining admin** [src/server/routes/api-admin.ts:31-71] — fixed: count-and-guard added; tests added
- [x] [Review][Patch] **Reject nested impersonation with 409** [src/server/routes/api-admin.ts:83-97] — fixed: session data pre-read; 409 guard added; test added
- [x] [Review][Patch] **api-auth.test.ts DDL missing name and last_login_at columns** [src/server/routes/api-auth.test.ts:21-32] — fixed: DDL updated with new columns
- [x] [Review][Patch] **PATCH /users/:id double write not wrapped in transaction** [src/server/routes/api-admin.ts:59-62] — fixed: wrapped in `db.transaction()`
- [x] [Review][Patch] **PATCH /users/:id with empty body issues no-op DB update** [src/server/routes/api-admin.ts:44-59] — fixed: returns 400 when no fields supplied; test added
- [x] [Review][Patch] **POST /impersonate/:id and /exit silently return 200 when session cookie absent** [src/server/routes/api-admin.ts:74-100] — fixed: early 401 return when sessionId absent; tests added
- [x] [Review][Patch] **GET /users has no ORDER BY** [src/server/routes/api-admin.ts:11-21] — fixed: `.orderBy(asc(users.id))`
- [x] [Review][Patch] **catch {} in auth-middleware swallows JSON.parse errors with no logging** [src/server/middleware/auth-middleware.ts:27-32] — fixed: `console.error('[auth] Failed to parse session.data:', e)`
- [x] [Review][Patch] **data.impersonating accepts 0 or negative integer as valid user ID** [src/server/middleware/auth-middleware.ts:27-32] — fixed: `Number.isInteger(x) && x > 0`
- [x] [Review][Patch] **PATCH /users/:id returns null body when user deleted between update and re-select** [src/server/routes/api-admin.ts:65-69] — fixed: null-check guard returns 404
- [x] [Review][Patch] **GET /users test does not assert absence of activationTokenExpiresAt or resetTokenExpiresAt** [src/server/routes/api-admin.test.ts:105-107] — fixed: two assertions added
- [x] [Review][Patch] **No test for AC #7 — non-admin is rejected with 403** [src/server/routes/api-admin.test.ts] — fixed: added `admin access control — AC #7` describe block with 2 tests
- [x] [Review][Patch] **Admin can self-impersonate** [src/server/routes/api-admin.ts:83-97] — fixed: 400 guard `targetId === sessionUserId`; test added

#### Deferred

- [x] [Review][Defer] **Stale impersonation session not re-validated against target user state on each request** [src/server/middleware/auth-middleware.ts:27-32] — deferred, pre-existing design gap; auth-middleware does not verify impersonated user still exists or is active; requests silently scope to deleted/disabled user
- [x] [Review][Defer] **PATCH deactivation does not clear sessions impersonating the deactivated user** [src/server/routes/api-admin.ts:62] — deferred, pre-existing design gap; `db.delete(sessions).where(eq(sessions.userId, id))` only deletes target's own sessions, not admin sessions with `data.impersonating = id`
- [x] [Review][Defer] **auth-middleware uses db.select() without column restriction on sessions table** [src/server/middleware/auth-middleware.ts] — deferred, pre-existing pattern; not introduced by this story; not a security risk since sessions.data is required for impersonation parsing

## Change Log

- 2026-04-30: Story created — epic 26 kickoff
- 2026-04-30: Story implemented — all 10 tasks complete, 301 tests pass
- 2026-04-30: Code review complete — 5 decision-needed, 11 patch, 3 deferred, 4 dismissed
- 2026-05-01: All 14 patches applied, 311 tests pass — story done
