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
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      job_title TEXT NOT NULL,
      source_url TEXT,
      date_scraped TEXT,
      source TEXT,
      location TEXT,
      external_job_id TEXT,
      relevance_score REAL,
      analysis_status TEXT,
      date_analyzed TEXT,
      fit_score INTEGER,
      recommendation TEXT,
      job_reqs_met TEXT,
      candidate_reqs_met TEXT,
      candidate_reqs_missed TEXT,
      job_reqs_missed TEXT,
      job_description TEXT,
      salary TEXT,
      benefits TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      applied INTEGER NOT NULL DEFAULT 0,
      status TEXT,
      status_override TEXT,
      cover_letter_sent_at TEXT,
      generation_context TEXT,
      date_applied TEXT,
      applied_at TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      resume_generated_at TEXT,
      user_id INTEGER NOT NULL DEFAULT 1,
      UNIQUE(company, job_title, user_id)
    )
  `)
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual'
    )
  `)
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS cover_letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL,
      message_id TEXT,
      received_at TEXT NOT NULL,
      from_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      type TEXT,
      company TEXT,
      job_title TEXT,
      user_id INTEGER NOT NULL DEFAULT 1
    )
  `)
  prodSqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS messages_uid_user_id_idx ON messages (uid, user_id)`)
  prodSqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS messages_message_id_user_id_idx ON messages (message_id, user_id)`)
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS search_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      query TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER NOT NULL REFERENCES users(id)
    )
  `)
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS user_secrets (
      user_id INTEGER NOT NULL REFERENCES users(id),
      key_name TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key_name)
    )
  `)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM status_events')
  prodSqlite.run('DELETE FROM cover_letters')
  prodSqlite.run('DELETE FROM messages')
  prodSqlite.run('DELETE FROM search_configs')
  prodSqlite.run('DELETE FROM user_secrets')
  prodSqlite.run('DELETE FROM jobs')
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

function insertJob(id: number, userId: number) {
  prodSqlite.run(
    `INSERT INTO jobs (id, company, job_title, user_id) VALUES (?, 'Acme', 'Engineer', ?)`,
    [id, userId]
  )
}

function insertStatusEvent(jobId: number) {
  prodSqlite.run(
    `INSERT INTO status_events (job_id, status, timestamp) VALUES (?, 'applied', ?)`,
    [jobId, new Date().toISOString()]
  )
}

describe('DELETE /api/admin/users/:id', () => {
  test('happy path → 204, user and related data purged', async () => {
    insertUser(1, { role: 'admin' })
    insertUser(2, { email: 'target@test.com' })
    insertSession('target-session', 2)
    insertJob(10, 2)
    insertStatusEvent(10)
    prodSqlite.run(`INSERT INTO messages (uid, received_at, from_address, subject, user_id) VALUES ('uid1', ?, 'a@b.com', 'Hi', 2)`, [new Date().toISOString()])
    prodSqlite.run(`INSERT INTO search_configs (source, query, user_id) VALUES ('linkedin', 'engineer', 2)`)
    prodSqlite.run(`INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (2, 'imap_password', 'enc', ?)`, [new Date().toISOString()])
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/2', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(prodSqlite.query('SELECT * FROM users WHERE id = 2').get()).toBeNull()
    expect(prodSqlite.query('SELECT * FROM sessions WHERE user_id = 2').all()).toHaveLength(0)
    expect(prodSqlite.query('SELECT * FROM jobs WHERE user_id = 2').all()).toHaveLength(0)
    expect(prodSqlite.query('SELECT * FROM status_events WHERE job_id = 10').all()).toHaveLength(0)
    expect(prodSqlite.query('SELECT * FROM messages WHERE user_id = 2').all()).toHaveLength(0)
    expect(prodSqlite.query('SELECT * FROM search_configs WHERE user_id = 2').all()).toHaveLength(0)
    expect(prodSqlite.query('SELECT * FROM user_secrets WHERE user_id = 2').all()).toHaveLength(0)
  })

  test('self-delete → 403', async () => {
    insertUser(1, { role: 'admin' })
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/1', { method: 'DELETE' })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Cannot delete your own account')
    expect(body).not.toHaveProperty('message')
  })

  test('last admin → 409', async () => {
    insertUser(1, { role: 'standard' })
    insertUser(2, { email: 'onlyadmin@test.com', role: 'admin' })
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/2', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Cannot delete the last admin')
    expect(body).not.toHaveProperty('message')
  })

  test('user not found → 404', async () => {
    insertUser(1, { role: 'admin' })
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/999', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('User not found')
  })

  test('invite key usedByUserId nulled, key itself preserved', async () => {
    insertUser(1, { role: 'admin' })
    insertUser(2, { email: 'target@test.com' })
    insertInviteKey(1, { key: 'AAAA-BBBB-CCCC', usedByUserId: 2, usedAt: '2026-05-01T00:00:00.000Z' })
    const app = makeAdminApp(1, 1)
    const res = await request(app, '/users/2', { method: 'DELETE' })
    expect(res.status).toBe(204)
    const key = prodSqlite.query('SELECT * FROM invite_keys WHERE id = 1').get() as Record<string, unknown> | null
    expect(key).not.toBeNull()
    expect(key!.used_by_user_id).toBeNull()
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

describe('POST /api/admin/users/test-user', () => {
  test('creates an active test-role user, no invite key consumed', async () => {
    insertUser(1, { role: 'admin' })
    insertInviteKey(1, { usedByUserId: null })
    process.env.TEST_USER_ANTHROPIC_API_KEY = 'sk-ant-test-123'
    const app = makeAdminApp()
    const res = await request(app, '/users/test-user', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.email).toBe('admin@hitlobster.ai')
    expect(body.role).toBe('test')
    expect(body.isActive).toBe(true)
    expect(body).not.toHaveProperty('passwordHash')

    const secrets = prodSqlite
      .query("SELECT * FROM user_secrets WHERE user_id = ? AND key_name = 'anthropic_api_key'")
      .all(body.id as number) as Array<Record<string, unknown>>
    expect(secrets).toHaveLength(1)

    const key = prodSqlite.query('SELECT * FROM invite_keys WHERE id = 1').get() as Record<string, unknown>
    expect(key.used_by_user_id).toBeNull()
  })

  test('seeds anthropic_api_key ciphertext that decrypts to the env value', async () => {
    insertUser(1, { role: 'admin' })
    process.env.TEST_USER_ANTHROPIC_API_KEY = 'sk-ant-decrypt-me'
    const { decrypt } = await import('../lib/crypto')
    const app = makeAdminApp()
    const res = await request(app, '/users/test-user', { method: 'POST' })
    const body = await res.json() as { id: number }
    const secret = prodSqlite
      .query("SELECT ciphertext FROM user_secrets WHERE user_id = ? AND key_name = 'anthropic_api_key'")
      .get(body.id) as { ciphertext: string }
    expect(decrypt(secret.ciphertext)).toBe('sk-ant-decrypt-me')
  })

  test('creates the user even when the API key env is unset (empty secret)', async () => {
    insertUser(1, { role: 'admin' })
    delete process.env.TEST_USER_ANTHROPIC_API_KEY
    const { decrypt } = await import('../lib/crypto')
    const app = makeAdminApp()
    const res = await request(app, '/users/test-user', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: number }
    const secret = prodSqlite
      .query("SELECT ciphertext FROM user_secrets WHERE user_id = ? AND key_name = 'anthropic_api_key'")
      .get(body.id) as { ciphertext: string }
    expect(decrypt(secret.ciphertext)).toBe('')
  })

  test('second call deletes-and-recreates rather than erroring', async () => {
    insertUser(1, { role: 'admin' })
    process.env.TEST_USER_ANTHROPIC_API_KEY = 'sk-ant-test-123'
    const app = makeAdminApp()

    const first = await request(app, '/users/test-user', { method: 'POST' })
    const firstBody = await first.json() as { id: number }
    // Seed data owned by the first test user that must be purged on recreate
    insertSession('test-user-session', firstBody.id)
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, user_id) VALUES ('Acme', 'Engineer', ?)`,
      [firstBody.id]
    )

    const second = await request(app, '/users/test-user', { method: 'POST' })
    expect(second.status).toBe(201)
    const secondBody = await second.json() as { id: number }
    expect(secondBody.id).not.toBe(firstBody.id)

    const emailRows = prodSqlite
      .query("SELECT id FROM users WHERE email = 'admin@hitlobster.ai'")
      .all() as Array<{ id: number }>
    expect(emailRows).toHaveLength(1)
    const oldSession = prodSqlite.query('SELECT * FROM sessions WHERE user_id = ?').get(firstBody.id)
    expect(oldSession).toBeNull()
    const oldJobs = prodSqlite.query('SELECT * FROM jobs WHERE user_id = ?').all(firstBody.id) as unknown[]
    expect(oldJobs).toHaveLength(0)
  })

  test('non-admin (test-role) caller is rejected with 403 and no user created', async () => {
    insertUser(1, { role: 'test' })
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
    const res = await request(w, '/users/test-user', { method: 'POST' })
    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Forbidden')
    expect(body).not.toHaveProperty('message')
    const created = prodSqlite.query("SELECT * FROM users WHERE email = 'admin@hitlobster.ai'").get()
    expect(created).toBeNull()
  })
})
