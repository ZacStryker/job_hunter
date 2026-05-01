process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = '0'.repeat(64)
process.env.APP_URL = 'http://localhost:3000'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../types'

const { authMiddleware } = await import('./auth-middleware')
const { adminMiddleware } = await import('./admin-middleware')
const { db } = await import('../../db/client')
const prodSqlite = (db as unknown as { $client: Database }).$client

function makeApp() {
  const app = new Hono<AppEnv>()
  app.use('/*', authMiddleware)
  app.get('/test', (c) => c.json({ userId: c.get('userId') }))
  app.post('/test', (c) => c.json({ ok: true }))
  app.patch('/test', (c) => c.json({ ok: true }))
  app.delete('/test', (c) => c.json({ ok: true }))
  return app
}

function makeAdminApp() {
  const app = new Hono<AppEnv>()
  app.use('/*', authMiddleware)
  app.use('/*', adminMiddleware)
  app.get('/test', (c) => c.json({ ok: true }))
  return app
}

beforeAll(() => {
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
  prodSqlite.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    data TEXT,
    expires_at TEXT NOT NULL
  )`)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM sessions')
  prodSqlite.run('DELETE FROM users')
})

function insertUser(id = 1, role = 'standard') {
  prodSqlite.run(
    `INSERT INTO users (id, email, password_hash, role, is_active, created_at)
     VALUES (?, ?, 'hash', ?, 1, ?)`,
    [id, `user${id}@test.com`, role, new Date().toISOString()]
  )
}

function insertSession(sessionId: string, userId: number, expiresOffset = 3_600_000) {
  const expiresAt = new Date(Date.now() + expiresOffset).toISOString()
  prodSqlite.run(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sessionId, userId, expiresAt]
  )
}

describe('authMiddleware', () => {
  test('no session cookie → 401', async () => {
    const app = makeApp()
    const res = await app.request('/test', { method: 'GET' })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Unauthorized')
    expect(body).not.toHaveProperty('message')
  })

  test('expired session → 401', async () => {
    insertUser(1)
    insertSession('expired-session', 1, -1000)
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'GET',
      headers: { Cookie: 'session=expired-session' },
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Unauthorized')
  })

  test('invalid session ID → 401', async () => {
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'GET',
      headers: { Cookie: 'session=no-such-session' },
    })
    expect(res.status).toBe(401)
  })

  test('valid session GET → 200 with userId set on context', async () => {
    insertUser(1)
    insertSession('valid-session', 1)
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'GET',
      headers: { Cookie: 'session=valid-session' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { userId: number }
    expect(body.userId).toBe(1)
  })

  test('valid session POST with matching csrf → 200', async () => {
    insertUser(1)
    insertSession('valid-session', 1)
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'POST',
      headers: {
        Cookie: 'session=valid-session; csrf_token=mytoken',
        'x-csrf-token': 'mytoken',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
  })

  test('valid session POST with missing x-csrf-token header → 403', async () => {
    insertUser(1)
    insertSession('valid-session', 1)
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'POST',
      headers: {
        Cookie: 'session=valid-session; csrf_token=mytoken',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('CSRF token invalid')
  })

  test('valid session POST with mismatched x-csrf-token → 403', async () => {
    insertUser(1)
    insertSession('valid-session', 1)
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'POST',
      headers: {
        Cookie: 'session=valid-session; csrf_token=tokenA',
        'x-csrf-token': 'tokenB',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  })

  test('valid session DELETE with valid CSRF → 200', async () => {
    insertUser(1)
    insertSession('valid-session', 1)
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'DELETE',
      headers: {
        Cookie: 'session=valid-session; csrf_token=tok',
        'x-csrf-token': 'tok',
      },
    })
    expect(res.status).toBe(200)
  })

  test('valid session PATCH with valid CSRF → 200', async () => {
    insertUser(1)
    insertSession('valid-session', 1)
    const app = makeApp()
    const res = await app.request('/test', {
      method: 'PATCH',
      headers: {
        Cookie: 'session=valid-session; csrf_token=tok',
        'x-csrf-token': 'tok',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
  })
})

describe('adminMiddleware', () => {
  test('standard role → 403', async () => {
    insertUser(1, 'standard')
    insertSession('std-session', 1)
    const app = makeAdminApp()
    const res = await app.request('/test', {
      method: 'GET',
      headers: { Cookie: 'session=std-session' },
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Forbidden')
    expect(body).not.toHaveProperty('message')
  })

  test('admin role → 200', async () => {
    insertUser(1, 'admin')
    insertSession('admin-session', 1)
    const app = makeAdminApp()
    const res = await app.request('/test', {
      method: 'GET',
      headers: { Cookie: 'session=admin-session' },
    })
    expect(res.status).toBe(200)
  })
})

describe('authMiddleware — impersonation', () => {
  test('session with data.impersonating sets userId to impersonated user', async () => {
    insertUser(1, 'admin')
    insertUser(2)
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
    expect(body.userId).toBe(2)
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
