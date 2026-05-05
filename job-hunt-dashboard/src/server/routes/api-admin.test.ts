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

function makeAdminApp(userId = 1, sessionUserId = 1) {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => {
    c.set('userId', userId)
    c.set('sessionUserId', sessionUserId)
    return next()
  })
  w.route('/', adminRoute)
  return w
}

function request(app: Hono<AppEnv>, path: string, opts: RequestInit & { sessionId?: string } = {}) {
  const sessionId = opts.sessionId ?? 'test-session'
  const headers = new Headers(opts.headers ?? {})
  headers.set('Cookie', `session=${sessionId}; csrf_token=tok`)
  if (opts.method && opts.method !== 'GET') {
    headers.set('x-csrf-token', 'tok')
  }
  return app.request(path, { ...opts, headers })
}

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
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS invite_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      used_by_user_id INTEGER REFERENCES users(id),
      used_at TEXT
    )
  `)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM invite_keys')
  prodSqlite.run('DELETE FROM sessions')
  prodSqlite.run('DELETE FROM users')
})

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

function insertInviteKey(id: number, opts: { key?: string; usedByUserId?: number | null; usedAt?: string | null } = {}) {
  prodSqlite.run(
    `INSERT INTO invite_keys (id, key, used_by_user_id, used_at) VALUES (?, ?, ?, ?)`,
    [id, opts.key ?? `ABCD-EFGH-${String(id).padStart(4, '0')}`, opts.usedByUserId ?? null, opts.usedAt ?? null]
  )
}

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
    expect(body[0]).not.toHaveProperty('activationTokenExpiresAt')
    expect(body[0]).not.toHaveProperty('resetToken')
    expect(body[0]).not.toHaveProperty('resetTokenExpiresAt')
  })

  test('empty table returns []', async () => {
    const app = makeAdminApp()
    const res = await request(app, '/users')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
  })
})

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
    insertUser(1, { role: 'admin' })
    insertUser(2, { email: 'target@test.com' })
    insertSession('user-session', 2)
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    expect(res.status).toBe(200)
    const remaining = prodSqlite.query('SELECT * FROM sessions WHERE user_id = 2').all()
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

describe('POST /api/admin/impersonate/:id', () => {
  test('valid target → 200 with impersonating object, session data updated', async () => {
    insertUser(1, { role: 'admin' })
    insertUser(2, { email: 'target@test.com', name: 'Target' })
    insertSession('admin-session', 1)
    const app = makeAdminApp(1, 1)
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

  test('no session cookie → 401', async () => {
    const app = makeAdminApp()
    const headers = new Headers()
    const res = await app.request('/impersonate/exit', { method: 'POST', headers })
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/admin/users/:id — new guards', () => {
  test('empty body → 400', async () => {
    insertUser(1)
    const app = makeAdminApp()
    const res = await request(app, '/users/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  test('admin cannot deactivate their own account → 400', async () => {
    insertUser(1, { role: 'admin' })
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Cannot deactivate your own account')
  })

  test('cannot demote the last admin → 400', async () => {
    insertUser(1, { role: 'admin' })
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'standard' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Cannot remove the last admin')
  })

  test('demoting non-last admin succeeds → 200', async () => {
    insertUser(1, { role: 'admin' })
    insertUser(2, { role: 'admin' })
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'standard' }),
    })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/impersonate/:id — new guards', () => {
  test('self-impersonation → 400', async () => {
    insertUser(1, { role: 'admin' })
    insertSession('admin-session', 1)
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/impersonate/1', {
      method: 'POST',
      sessionId: 'admin-session',
    })
    expect(res.status).toBe(400)
  })

  test('no session cookie → 401', async () => {
    const app = makeAdminApp()
    const headers = new Headers()
    const res = await app.request('/impersonate/2', { method: 'POST', headers })
    expect(res.status).toBe(401)
  })

  test('nested impersonation → 409', async () => {
    insertUser(1, { role: 'admin' })
    insertUser(2, { email: 'user2@test.com' })
    insertUser(3, { email: 'user3@test.com' })
    insertSession('admin-session', 1, JSON.stringify({ impersonating: 2 }))
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/impersonate/3', {
      method: 'POST',
      sessionId: 'admin-session',
    })
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('exit first')
  })
})

describe('GET /api/admin/invite-keys', () => {
  test('empty table returns []', async () => {
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
  })

  test('unused key → status unused, usedByEmail null', async () => {
    insertInviteKey(1, { key: 'AAAA-BBBB-CCCC' })
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys')
    expect(res.status).toBe(200)
    const body = await res.json() as Array<Record<string, unknown>>
    expect(body).toHaveLength(1)
    expect(body[0].key).toBe('AAAA-BBBB-CCCC')
    expect(body[0].status).toBe('unused')
    expect(body[0].usedByEmail).toBeNull()
    expect(body[0].usedAt).toBeNull()
  })

  test('used key → status used, usedByEmail populated', async () => {
    insertUser(2, { email: 'user@test.com' })
    insertInviteKey(1, { key: 'AAAA-BBBB-CCCC', usedByUserId: 2, usedAt: '2026-05-01T00:00:00.000Z' })
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys')
    expect(res.status).toBe(200)
    const body = await res.json() as Array<Record<string, unknown>>
    expect(body[0].status).toBe('used')
    expect(body[0].usedByEmail).toBe('user@test.com')
    expect(body[0].usedAt).toBe('2026-05-01T00:00:00.000Z')
  })

  test('keys ordered newest first (desc id)', async () => {
    insertInviteKey(1, { key: 'AAAA-AAAA-0001' })
    insertInviteKey(2, { key: 'BBBB-BBBB-0002' })
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys')
    const body = await res.json() as Array<Record<string, unknown>>
    expect(body[0].id).toBe(2)
    expect(body[1].id).toBe(1)
  })
})

describe('POST /api/admin/invite-keys', () => {
  test('generates key → 201 with XXXX-XXXX-XXXX format', async () => {
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.id).toBeTypeOf('number')
    expect(typeof body.key).toBe('string')
    expect((body.key as string)).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(body.status).toBe('unused')
    expect(body.usedByEmail).toBeNull()
    expect(body.usedAt).toBeNull()
  })

  test('key is persisted in DB', async () => {
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys', { method: 'POST' })
    const body = await res.json() as Record<string, unknown>
    const row = prodSqlite.query('SELECT * FROM invite_keys WHERE id = ?').get(body.id as number) as Record<string, unknown> | null
    expect(row).not.toBeNull()
    expect(row!.key).toBe(body.key)
    expect(row!.used_by_user_id).toBeNull()
  })
})

describe('DELETE /api/admin/invite-keys/:id', () => {
  test('unused key → 204, row deleted', async () => {
    insertInviteKey(1)
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys/1', { method: 'DELETE' })
    expect(res.status).toBe(204)
    const row = prodSqlite.query('SELECT * FROM invite_keys WHERE id = 1').get()
    expect(row).toBeNull()
  })

  test('used key → 409', async () => {
    insertUser(2, { email: 'user@test.com' })
    insertInviteKey(1, { usedByUserId: 2, usedAt: '2026-05-01T00:00:00.000Z' })
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys/1', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Cannot revoke a used invite key')
  })

  test('key not found → 404', async () => {
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys/999', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  test('invalid id → 400', async () => {
    const app = makeAdminApp()
    const res = await request(app, '/invite-keys/notanid', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })
})

describe('admin access control — AC #7', () => {
  test('non-admin session is rejected with 403', async () => {
    insertUser(1, { role: 'standard' })
    const { adminMiddleware } = await import('../middleware/admin-middleware')
    const { Hono: H } = await import('hono')
    const w = new H<AppEnv>()
    w.use('*', (c, next) => {
      c.set('userId', 1)
      c.set('sessionUserId', 1)
      return next()
    })
    w.use('*', adminMiddleware)
    w.route('/', adminRoute)
    const res = await request(w, '/users')
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Forbidden')
  })

  test('admin role passes through middleware', async () => {
    insertUser(1, { role: 'admin' })
    const { adminMiddleware } = await import('../middleware/admin-middleware')
    const { Hono: H } = await import('hono')
    const w = new H<AppEnv>()
    w.use('*', (c, next) => {
      c.set('userId', 1)
      c.set('sessionUserId', 1)
      return next()
    })
    w.use('*', adminMiddleware)
    w.route('/', adminRoute)
    const res = await request(w, '/users')
    expect(res.status).toBe(200)
  })
})
