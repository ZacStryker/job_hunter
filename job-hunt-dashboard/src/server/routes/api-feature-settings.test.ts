process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../types'

const { default: featureSettingsRoute } = await import('./api-feature-settings')
const { default: adminRoute } = await import('./api-admin')
const { emailFeaturesMiddleware } = await import('../middleware/email-features-middleware')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_FEATURE_SETTINGS = `
  CREATE TABLE IF NOT EXISTS feature_settings (
    feature TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0
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

const featureSettingsApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); c.set('sessionUserId', 1); return next() })
  w.route('/', featureSettingsRoute)
  return w
})()

const adminApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); c.set('sessionUserId', 1); return next() })
  w.route('/', adminRoute)
  return w
})()

const guardedApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); c.set('sessionUserId', 1); return next() })
  w.use('*', emailFeaturesMiddleware)
  w.get('/', (c) => c.json({ ok: true }))
  return w
})()

beforeAll(() => {
  prodSqlite.run(CREATE_FEATURE_SETTINGS)
  prodSqlite.run(CREATE_USERS)
  prodSqlite.run(CREATE_SESSIONS)
  prodSqlite.run(CREATE_INVITE_KEYS)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM feature_settings')
})

describe('GET /api/feature-settings', () => {
  test('defaults emailFeatures to false when no row exists', async () => {
    const res = await featureSettingsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ emailFeatures: false })
  })

  test('reflects an enabled row', async () => {
    prodSqlite.run("INSERT INTO feature_settings (feature, enabled) VALUES ('emailFeatures', 1)")
    const res = await featureSettingsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ emailFeatures: true })
  })

  test('reflects a disabled row', async () => {
    prodSqlite.run("INSERT INTO feature_settings (feature, enabled) VALUES ('emailFeatures', 0)")
    const res = await featureSettingsApp.request('/', { method: 'GET' })
    const body = await res.json()
    expect(body).toEqual({ emailFeatures: false })
  })
})

describe('PATCH /api/admin/feature-settings/:feature', () => {
  const headers = { 'Content-Type': 'application/json' }

  test('rejects an unknown feature key', async () => {
    const res = await adminApp.request('/feature-settings/bogus', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: true }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('rejects an invalid body', async () => {
    const res = await adminApp.request('/feature-settings/emailFeatures', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: 'nope' }),
    })
    expect(res.status).toBe(400)
  })

  test('inserts the flag on first toggle (upsert)', async () => {
    const res = await adminApp.request('/feature-settings/emailFeatures', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { feature: string; enabled: boolean }
    expect(body.feature).toBe('emailFeatures')
    expect(body.enabled).toBe(true)
    const row = prodSqlite.query('SELECT enabled FROM feature_settings WHERE feature = ?').get('emailFeatures') as { enabled: number }
    expect(row.enabled).toBe(1)
  })

  test('updates an existing flag', async () => {
    prodSqlite.run("INSERT INTO feature_settings (feature, enabled) VALUES ('emailFeatures', 1)")
    const res = await adminApp.request('/feature-settings/emailFeatures', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: false }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { enabled: boolean }
    expect(body.enabled).toBe(false)
  })
})

describe('emailFeaturesMiddleware', () => {
  test('blocks with 403 when no flag row exists', async () => {
    const res = await guardedApp.request('/', { method: 'GET' })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('blocks with 403 when flag is disabled', async () => {
    prodSqlite.run("INSERT INTO feature_settings (feature, enabled) VALUES ('emailFeatures', 0)")
    const res = await guardedApp.request('/', { method: 'GET' })
    expect(res.status).toBe(403)
  })

  test('passes through when flag is enabled', async () => {
    prodSqlite.run("INSERT INTO feature_settings (feature, enabled) VALUES ('emailFeatures', 1)")
    const res = await guardedApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })
})
