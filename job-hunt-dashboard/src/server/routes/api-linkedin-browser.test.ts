import { mock, describe, test, expect, beforeAll, beforeEach } from 'bun:test'

// Mock Playwright before any production imports
const mockPage = {
  goto: mock(async () => {}),
  on: mock(() => {}),
  screenshot: mock(async () => new Uint8Array([1, 2, 3])),
  mainFrame: mock(() => mockPage),
  mouse: { click: mock(async () => {}) },
  keyboard: { press: mock(async () => {}) },
}
const mockContext = {
  newPage: mock(async () => mockPage),
  storageState: mock(async () => ({ cookies: [], origins: [] })),
}
const mockBrowser = {
  newContext: mock(async () => mockContext),
  close: mock(async () => {}),
}
mock.module('playwright', () => ({
  chromium: { launch: mock(async () => mockBrowser) },
}))

process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.PORT = '3001'
process.env.APP_URL = 'http://localhost:3001'

import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users, sessions } from '../../db/schema'
import app from './api-linkedin-browser'

beforeAll(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
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
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    data TEXT,
    expires_at TEXT NOT NULL
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )`)

  db.insert(users).values({
    email: 'test@example.com',
    passwordHash: 'hash',
    role: 'standard',
    isActive: true,
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing().run()

  const userId = db.select({ id: users.id }).from(users).where(eq(users.email, 'test@example.com')).get()?.id ?? 1
  const expiresAt = new Date(Date.now() + 86400000).toISOString()
  db.insert(sessions).values({ id: 'test-session-id', userId, expiresAt }).onConflictDoNothing().run()
})

beforeEach(() => {
  mockBrowser.close.mockReset()
  mockPage.goto.mockReset()
  mockPage.on.mockReset()
  mockPage.goto.mockImplementation(async () => {})
  mockPage.on.mockImplementation(() => {})
})

// Inject userId via middleware simulation — use a wrapped app with userId set
import { Hono } from 'hono'
import type { AppEnv } from '../types'

const testApp = new Hono<AppEnv>()
testApp.use('/*', async (c, next) => {
  c.set('userId', 1)
  c.set('sessionUserId', 1)
  await next()
})
testApp.route('/', app)

const testApp2 = new Hono<AppEnv>()
testApp2.use('/*', async (c, next) => {
  c.set('userId', 2)
  c.set('sessionUserId', 2)
  await next()
})
testApp2.route('/', app)

describe('POST / — create LinkedIn browser session', () => {
  test('returns 200 with sessionId', async () => {
    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { sessionId: string }
    expect(typeof body.sessionId).toBe('string')
    expect(body.sessionId.length).toBeGreaterThan(0)

    // Cleanup: delete the session
    const deleteRes = await testApp.request(`/${body.sessionId}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)
  })
})

describe('DELETE /:id — cancel LinkedIn browser session', () => {
  test('returns 200 with ok:true for valid session owned by user', async () => {
    // Create a session first
    const createRes = await testApp.request('/', { method: 'POST' })
    expect(createRes.status).toBe(200)
    const { sessionId } = await createRes.json() as { sessionId: string }

    const res = await testApp.request(`/${sessionId}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 when session belongs to a different user', async () => {
    // Create session as user 1
    const createRes = await testApp.request('/', { method: 'POST' })
    expect(createRes.status).toBe(200)
    const { sessionId } = await createRes.json() as { sessionId: string }

    // Attempt delete as user 2
    const res = await testApp2.request(`/${sessionId}`, { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')

    // Cleanup: delete as user 1
    await testApp.request(`/${sessionId}`, { method: 'DELETE' })
  })

  test('returns 404 when session does not exist', async () => {
    const res = await testApp.request('/nonexistent-session-id', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})

// NOTE: The WebSocket upgrade path (/api/onboarding/linkedin/browser/:sessionId/ws)
// is handled in src/index.ts via Bun's server.upgrade() and is not testable via
// Hono's app.request(). WS upgrade auth and session validation require integration
// testing against a running Bun server.
