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
import { randomBytes } from 'node:crypto'

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
      created_at TEXT NOT NULL,
      name TEXT,
      last_login_at TEXT
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
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS user_secrets (
      user_id INTEGER NOT NULL,
      key_name TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key_name)
    )
  `)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM user_secrets')
  prodSqlite.run('DELETE FROM sessions')
  prodSqlite.run('DELETE FROM invite_keys')
  prodSqlite.run('DELETE FROM users')
})

interface UserRow {
  id: number
  email: string
  password_hash: string
  role: string
  is_active: number
  activation_token: string | null
  activation_token_expires_at: string | null
  reset_token: string | null
  reset_token_expires_at: string | null
  created_at: string
}

interface SessionRow {
  id: string
  user_id: number
  data: string | null
  expires_at: string
}

// ---- helpers ----

function insertInviteKey(key: string) {
  prodSqlite.run(`INSERT INTO invite_keys (key) VALUES (?)`, [key])
}

async function registerUser(opts: { inviteKey?: string; email?: string; password?: string } = {}) {
  const inviteKey = opts.inviteKey ?? 'TEST-KEY'
  const email = opts.email ?? 'test@example.com'
  const password = opts.password ?? 'password123'
  insertInviteKey(inviteKey)
  return authApp.request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteKey, email, password }),
  })
}

function getUser(email: string): UserRow | null {
  return prodSqlite.query(`SELECT * FROM users WHERE email = ?`).get(email) as UserRow | null
}

function getSession(id: string): SessionRow | null {
  return prodSqlite.query(`SELECT * FROM sessions WHERE id = ?`).get(id) as SessionRow | null
}

function extractSessionId(setCookie: string | null): string | null {
  if (!setCookie) return null
  const match = setCookie.match(/session=([^;]+)/)
  return match ? match[1] : null
}

function insertAdminSession(): { userId: number; sessionId: string } {
  prodSqlite.run(
    `INSERT INTO users (email, password_hash, role, is_active, created_at) VALUES (?, ?, 'admin', 1, ?)`,
    ['admin@example.com', 'hash', new Date().toISOString()]
  )
  const admin = prodSqlite.query(`SELECT id FROM users WHERE email = 'admin@example.com'`).get() as { id: number }
  const sessionId = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  prodSqlite.run(`INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, NULL, ?)`, [sessionId, admin.id, expiresAt])
  return { userId: admin.id, sessionId }
}

// ---- Registration tests ----

describe('POST /register', () => {
  test('invalid invite key → 400', async () => {
    const res = await authApp.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteKey: 'BOGUS', email: 'a@b.com', password: 'password123' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Invite key not recognized or already used')
    expect(body.message).toBeUndefined()
  })

  test('already-used invite key → 400', async () => {
    await registerUser()
    const res = await authApp.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteKey: 'TEST-KEY', email: 'other@example.com', password: 'password123' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Invite key not recognized or already used')
  })

  test('duplicate email → 400', async () => {
    insertInviteKey('KEY-1')
    insertInviteKey('KEY-2')
    await authApp.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteKey: 'KEY-1', email: 'dup@example.com', password: 'password123' }),
    })
    const res = await authApp.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteKey: 'KEY-2', email: 'dup@example.com', password: 'password123' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Email already registered')
  })

  test('success → 201 {}; user created with is_active=0; invite key marked used', async () => {
    const res = await registerUser()
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({})

    const user = getUser('test@example.com')
    expect(user).not.toBeNull()
    expect(user!.is_active).toBe(0)
    expect(user!.activation_token).toBeTruthy()
    expect(user!.activation_token_expires_at).toBeTruthy()

    const key = prodSqlite.query(`SELECT * FROM invite_keys WHERE key = 'TEST-KEY'`).get() as Record<string, unknown>
    expect(key.used_at).not.toBeNull()
    expect(key.used_by_user_id).toBe(user!.id)
  })

  test('email is normalized to lowercase', async () => {
    insertInviteKey('KEY-A')
    const res = await authApp.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteKey: 'KEY-A', email: 'TEST@EXAMPLE.COM', password: 'password123' }),
    })
    expect(res.status).toBe(201)
    const user = getUser('test@example.com')
    expect(user).not.toBeNull()
  })
})

// ---- Activation tests ----

describe('GET /activate', () => {
  test('missing token → 400', async () => {
    const res = await authApp.request('/activate')
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Activation link invalid or expired')
  })

  test('invalid token → 400', async () => {
    const res = await authApp.request('/activate?token=deadbeef')
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Activation link invalid or expired')
  })

  test('expired token → 400', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    prodSqlite.run(`UPDATE users SET activation_token_expires_at = ? WHERE id = ?`, [pastExpiry, user.id])
    const res = await authApp.request(`/activate?token=${user.activation_token}`)
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Activation link invalid or expired')
  })

  test('success → 302; Location header; set-cookie present; user is_active=1', async () => {
    await registerUser()
    const user = getUser('test@example.com')!

    const res = await authApp.request(`/activate?token=${user.activation_token}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding')

    const cookie = res.headers.get('set-cookie')
    expect(cookie).toContain('session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('csrf_token=')

    const updatedUser = getUser('test@example.com')!
    expect(updatedUser.is_active).toBe(1)
    expect(updatedUser.activation_token).toBeNull()
    expect(updatedUser.activation_token_expires_at).toBeNull()
  })
})

// ---- Login tests ----

describe('POST /login', () => {
  test('wrong password → 401', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])

    const res = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' }),
    })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Invalid email or password')
  })

  test('unknown email → 401', async () => {
    const res = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'password123' }),
    })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Invalid email or password')
  })

  test('inactive account → 403', async () => {
    await registerUser()

    const res = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    })
    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Account is disabled')
  })

  test('success → 200 { onboardingComplete: false } when no anthropic key; set-cookie has session + csrf_token', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])

    const res = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ onboardingComplete: false })

    const cookie = res.headers.get('set-cookie')
    expect(cookie).toContain('session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('csrf_token=')
  })
})

// ---- Logout tests ----

describe('POST /logout', () => {
  test('no session cookie → still 204 (idempotent)', async () => {
    const res = await authApp.request('/logout', { method: 'POST' })
    expect(res.status).toBe(204)
  })

  test('valid session → 204; session row deleted; cookie cleared', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])

    const loginRes = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    })
    const loginCookie = loginRes.headers.get('set-cookie')!
    const sessionId = extractSessionId(loginCookie)!
    expect(getSession(sessionId)).not.toBeNull()

    const res = await authApp.request('/logout', {
      method: 'POST',
      headers: { Cookie: `session=${sessionId}` },
    })
    expect(res.status).toBe(204)
    expect(getSession(sessionId)).toBeNull()

    const logoutCookie = res.headers.get('set-cookie')
    expect(logoutCookie).not.toBeNull()
    expect(logoutCookie).toContain('session=')
  })
})

// ---- GET /session tests ----

describe('GET /session', () => {
  test('no cookie → 401', async () => {
    const res = await authApp.request('/session')
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Unauthorized')
  })

  test('invalid session id → 401', async () => {
    const res = await authApp.request('/session', {
      headers: { Cookie: 'session=nonexistent' },
    })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Unauthorized')
  })

  test('expired session → 401', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])

    const loginRes = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    })
    const sessionId = extractSessionId(loginRes.headers.get('set-cookie'))!
    const past = new Date(Date.now() - 1000).toISOString()
    prodSqlite.run(`UPDATE sessions SET expires_at = ? WHERE id = ?`, [past, sessionId])

    const res = await authApp.request('/session', {
      headers: { Cookie: `session=${sessionId}` },
    })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Unauthorized')
  })

  test('valid session → 200 { userId, email, role }', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])

    const loginRes = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    })
    const sessionId = extractSessionId(loginRes.headers.get('set-cookie'))!

    const res = await authApp.request('/session', {
      headers: { Cookie: `session=${sessionId}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body.userId).toBe('number')
    expect(body.email).toBe('test@example.com')
    expect(body.role).toBe('standard')
  })

  test('session with impersonation data → 200 with impersonating field', async () => {
    prodSqlite.run(
      `INSERT INTO users (id, email, password_hash, role, is_active, created_at, name)
       VALUES (1, 'admin@test.com', 'x', 'admin', 1, '2026-01-01T00:00:00.000Z', 'Admin')`,
    )
    prodSqlite.run(
      `INSERT INTO users (id, email, password_hash, role, is_active, created_at, name)
       VALUES (2, 'target@test.com', 'x', 'standard', 1, '2026-01-01T00:00:00.000Z', 'Target User')`,
    )
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
    prodSqlite.run(
      `INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)`,
      ['imp-session', 1, JSON.stringify({ impersonating: 2 }), expiresAt]
    )
    const res = await authApp.request('/session', {
      headers: { Cookie: 'session=imp-session' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.impersonating).toMatchObject({ id: 2, email: 'target@test.com', name: 'Target User' })
  })
})

// ---- POST /resend-activation tests ----

describe('POST /resend-activation', () => {
  test('unknown email → 204 silently', async () => {
    const res = await authApp.request('/resend-activation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    })
    expect(res.status).toBe(204)
  })

  test('already active user email → 204 silently; no token update', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])

    const res = await authApp.request('/resend-activation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    })
    expect(res.status).toBe(204)

    const updated = getUser('test@example.com')!
    expect(updated.activation_token).toBe(user.activation_token)
  })

  test('inactive user → 204; new activation token generated', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    const originalToken = user.activation_token

    const res = await authApp.request('/resend-activation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    })
    expect(res.status).toBe(204)

    const updated = getUser('test@example.com')!
    expect(updated.activation_token).not.toBe(originalToken)
    expect(updated.activation_token).toBeTruthy()
    expect(updated.activation_token_expires_at).toBeTruthy()
  })
})

// ---- Reset-request tests ----

describe('POST /reset-request', () => {
  test('no session cookie → 401', async () => {
    const res = await authApp.request('/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'target@example.com' }),
    })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Unauthorized')
  })

  test('non-admin session → 403', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])

    const loginRes = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    })
    const cookie = loginRes.headers.get('set-cookie')!
    const sessionId = extractSessionId(cookie)!

    const res = await authApp.request('/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${sessionId}` },
      body: JSON.stringify({ email: 'test@example.com' }),
    })
    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Forbidden')
  })

  test('admin session → 204; reset token set; target-user sessions deleted', async () => {
    const { sessionId } = insertAdminSession()

    // Create a target user with an active session
    insertInviteKey('TARGET-KEY')
    await authApp.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteKey: 'TARGET-KEY', email: 'target@example.com', password: 'password123' }),
    })
    const targetUser = getUser('target@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [targetUser.id])
    const targetSessionId = 'target-session-' + Math.random().toString(36).slice(2)
    prodSqlite.run(
      `INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, NULL, ?)`,
      [targetSessionId, targetUser.id, new Date(Date.now() + 3600000).toISOString()]
    )

    const res = await authApp.request('/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${sessionId}` },
      body: JSON.stringify({ email: 'target@example.com' }),
    })
    expect(res.status).toBe(204)

    const updatedTarget = getUser('target@example.com')!
    expect(updatedTarget.reset_token).toBeTruthy()
    expect(updatedTarget.reset_token_expires_at).toBeTruthy()
    expect(getSession(targetSessionId)).toBeNull()
  })
})

// ---- Reset tests ----

describe('POST /reset', () => {
  test('invalid token → 400', async () => {
    const res = await authApp.request('/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'bogus', newPassword: 'newpassword123' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Reset token invalid or expired')
  })

  test('expired reset token → 400', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    prodSqlite.run(
      `UPDATE users SET reset_token = 'validtoken', reset_token_expires_at = ? WHERE id = ?`,
      [pastExpiry, user.id]
    )
    const res = await authApp.request('/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'validtoken', newPassword: 'newpassword123' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('Reset token invalid or expired')
  })

  test('success → 204; password hash updated; token fields cleared; new password works for login', async () => {
    await registerUser()
    const user = getUser('test@example.com')!
    prodSqlite.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [user.id])
    const futureExpiry = new Date(Date.now() + 3600000).toISOString()
    prodSqlite.run(
      `UPDATE users SET reset_token = 'myresettoken', reset_token_expires_at = ? WHERE id = ?`,
      [futureExpiry, user.id]
    )

    const res = await authApp.request('/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'myresettoken', newPassword: 'newpassword123' }),
    })
    expect(res.status).toBe(204)

    const updatedUser = getUser('test@example.com')!
    expect(updatedUser.reset_token).toBeNull()
    expect(updatedUser.reset_token_expires_at).toBeNull()
    expect(updatedUser.password_hash).not.toBe(user.password_hash)

    const loginRes = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'newpassword123' }),
    })
    expect(loginRes.status).toBe(200)
  })
})
