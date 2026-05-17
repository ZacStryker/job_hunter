process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../types'

const { default: sourceSettingsRoute } = await import('./api-source-settings')
const { default: adminRoute } = await import('./api-admin')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_SOURCE_SETTINGS = `
  CREATE TABLE IF NOT EXISTS source_settings (
    source TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`

const CREATE_USERS = `
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
`

const CREATE_SESSIONS = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    data TEXT,
    expires_at TEXT NOT NULL
  )
`

const CREATE_INVITE_KEYS = `
  CREATE TABLE IF NOT EXISTS invite_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    used_by_user_id INTEGER,
    used_at TEXT
  )
`

const sourceSettingsApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); c.set('sessionUserId', 1); return next() })
  w.route('/', sourceSettingsRoute)
  return w
})()

const adminApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); c.set('sessionUserId', 1); return next() })
  w.route('/', adminRoute)
  return w
})()

beforeAll(() => {
  prodSqlite.run(CREATE_SOURCE_SETTINGS)
  prodSqlite.run(CREATE_USERS)
  prodSqlite.run(CREATE_SESSIONS)
  prodSqlite.run(CREATE_INVITE_KEYS)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM source_settings')
})

describe('GET /api/source-settings', () => {
  test('returns empty array when no rows', async () => {
    const res = await sourceSettingsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  test('returns seeded rows', async () => {
    prodSqlite.run("INSERT INTO source_settings (source, enabled) VALUES ('linkedin', 1), ('indeed', 0)")
    const res = await sourceSettingsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { source: string; enabled: boolean }[]
    expect(body).toHaveLength(2)
    const linkedin = body.find((r) => r.source === 'linkedin')
    expect(linkedin?.enabled).toBe(true)
    const indeed = body.find((r) => r.source === 'indeed')
    expect(indeed?.enabled).toBe(false)
  })
})

describe('GET /api/admin/source-settings', () => {
  test('returns all source settings rows', async () => {
    prodSqlite.run("INSERT INTO source_settings (source, enabled) VALUES ('linkedin', 1), ('arc', 0)")
    const res = await adminApp.request('/source-settings', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toHaveLength(2)
  })
})

describe('PATCH /api/admin/source-settings/:source', () => {
  const headers = { 'Content-Type': 'application/json', 'x-csrf-token': 'test' }

  test('rejects invalid source', async () => {
    const res = await adminApp.request('/source-settings/notasource', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: false }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('rejects invalid body', async () => {
    prodSqlite.run("INSERT INTO source_settings (source, enabled) VALUES ('linkedin', 1)")
    const res = await adminApp.request('/source-settings/linkedin', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: 'notabool' }),
    })
    expect(res.status).toBe(400)
  })

  test('upserts and disables a source', async () => {
    prodSqlite.run("INSERT INTO source_settings (source, enabled) VALUES ('linkedin', 1)")
    const res = await adminApp.request('/source-settings/linkedin', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: false }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { source: string; enabled: boolean }
    expect(body.source).toBe('linkedin')
    expect(body.enabled).toBe(false)
    const row = prodSqlite.query('SELECT enabled FROM source_settings WHERE source = ?').get('linkedin') as { enabled: number }
    expect(row.enabled).toBe(0)
  })

  test('upserts and re-enables a source', async () => {
    prodSqlite.run("INSERT INTO source_settings (source, enabled) VALUES ('indeed', 0)")
    const res = await adminApp.request('/source-settings/indeed', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { source: string; enabled: boolean }
    expect(body.enabled).toBe(true)
  })

  test('inserts row if not pre-existing (upsert)', async () => {
    const res = await adminApp.request('/source-settings/arc', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: false }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { source: string; enabled: boolean }
    expect(body.source).toBe('arc')
    expect(body.enabled).toBe(false)
  })
})
