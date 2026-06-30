process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../../server/types'

const { default: setupStatusRoute } = await import('./api-setup-status')
const { db: prodDb } = await import('../../db/client')
const sqlite = (prodDb as unknown as { $client: Database }).$client

const app = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', setupStatusRoute)
  return w
})()

const { authMiddleware } = await import('../../server/middleware/auth-middleware')
const authApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', authMiddleware)
  w.route('/', setupStatusRoute)
  return w
})()

const DDL = [
  `CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )`,
  `CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    profile_data TEXT,
    UNIQUE(user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS inbox_folder_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder_path TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gmail_label_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS setup_dismissals (
    user_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, task_id)
  )`,
]

beforeAll(() => {
  for (const stmt of DDL) sqlite.run(stmt)
})

beforeEach(() => {
  sqlite.run('DELETE FROM user_secrets')
  sqlite.run('DELETE FROM profile')
  sqlite.run('DELETE FROM inbox_folder_mappings')
  sqlite.run('DELETE FROM gmail_label_mappings')
  sqlite.run('DELETE FROM setup_dismissals')
})

const jsonPost = (path: string, taskId: unknown) => app.request(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ taskId }),
})

describe('GET /', () => {
  test('returns setupStatus shape with 200', async () => {
    const res = await app.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { tasks: unknown[]; ready: boolean }
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.tasks).toHaveLength(5)
    expect(typeof body.ready).toBe('boolean')
  })

  test('unauthenticated request returns 401 with error and no message key', async () => {
    const res = await authApp.request('/', { method: 'GET' })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body).not.toHaveProperty('message')
  })

  test('one user never sees another user\'s status', async () => {
    sqlite.run("INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (2, 'linkedin_storage_state', 'CIPHER', '2026-01-01T00:00:00.000Z')")
    const res = await app.request('/', { method: 'GET' })
    const body = await res.json() as { tasks: Array<{ id: string; state: string }> }
    expect(body.tasks.find((t) => t.id === 'linkedin')!.state).toBe('notStarted')
  })

  test('no secret value ever appears in the response', async () => {
    sqlite.run("INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'anthropic_api_key', 'SUPER_SECRET_CIPHERTEXT', '2026-01-01T00:00:00.000Z')")
    const res = await app.request('/', { method: 'GET' })
    const raw = await res.text()
    expect(raw).not.toContain('SUPER_SECRET_CIPHERTEXT')
    expect(raw).not.toContain('ciphertext')
  })
})

describe('POST /dismiss', () => {
  test('dismissing an optional task sets dismissed:true', async () => {
    const res = await jsonPost('/dismiss', 'inboxConnect')
    expect(res.status).toBe(200)
    const body = await res.json() as { tasks: Array<{ id: string; dismissed: boolean }> }
    expect(body.tasks.find((t) => t.id === 'inboxConnect')!.dismissed).toBe(true)
  })

  test('dismissing a required task returns 400 and changes nothing', async () => {
    const res = await jsonPost('/dismiss', 'linkedin')
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body).not.toHaveProperty('message')
    const rows = sqlite.query('SELECT COUNT(*) AS n FROM setup_dismissals').get() as { n: number }
    expect(rows.n).toBe(0)
  })

  test('invalid taskId returns 400', async () => {
    const res = await jsonPost('/dismiss', 'nope')
    expect(res.status).toBe(400)
  })
})

describe('POST /undismiss', () => {
  test('undismiss restores dismissed:false', async () => {
    await jsonPost('/dismiss', 'inboxMapping')
    const res = await jsonPost('/undismiss', 'inboxMapping')
    expect(res.status).toBe(200)
    const body = await res.json() as { tasks: Array<{ id: string; dismissed: boolean }> }
    expect(body.tasks.find((t) => t.id === 'inboxMapping')!.dismissed).toBe(false)
  })
})
