process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../../server/types'

const { default: blacklistRoute } = await import('./api-blacklist')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const blacklistApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', blacklistRoute)
  return w
})()

const { authMiddleware } = await import('../../server/middleware/auth-middleware')
const authApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', authMiddleware)
  w.route('/', blacklistRoute)
  return w
})()

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS company_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    company_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, company_name)
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM company_blacklist')
})

describe('GET /', () => {
  test('returns empty array when no entries', async () => {
    const res = await blacklistApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  test('returns only entries belonging to the requesting user', async () => {
    prodSqlite.run("INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'my corp', '2026-01-01T00:00:00.000Z')")
    prodSqlite.run("INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (2, 'other corp', '2026-01-01T00:00:00.000Z')")
    const res = await blacklistApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ companyName: string }>
    expect(body).toHaveLength(1)
    expect(body[0].companyName).toBe('my corp')
  })

  test('returns 401 when no session cookie', async () => {
    const res = await authApp.request('/', { method: 'GET' })
    expect(res.status).toBe(401)
  })
})

describe('POST /', () => {
  test('inserts entry and returns 201 with lowercased companyName', async () => {
    const res = await blacklistApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: 'Acme Corp' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { companyName: string; userId: number }
    expect(body.companyName).toBe('acme corp')
    expect(body.userId).toBe(1)
  })

  test('trims and lowercases input before storing', async () => {
    const res = await blacklistApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: '  Acme Corp  ' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { companyName: string }
    expect(body.companyName).toBe('acme corp')
  })

  test('returns 409 when company already in blacklist', async () => {
    await blacklistApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: 'Dupe Corp' }),
    })
    const res = await blacklistApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: 'Dupe Corp' }),
    })
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Company already blacklisted')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for empty companyName', async () => {
    const res = await blacklistApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: '' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })
})

describe('DELETE /:id', () => {
  test('removes entry and returns 204', async () => {
    const createRes = await blacklistApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: 'To Delete Corp' }),
    })
    const created = await createRes.json() as { id: number }
    const res = await blacklistApp.request(`/${created.id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
    const getRes = await blacklistApp.request('/', { method: 'GET' })
    const rows = await getRes.json() as unknown[]
    expect(rows).toHaveLength(0)
  })

  test('returns 404 when ID belongs to different user', async () => {
    prodSqlite.run("INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (2, 'other corp', '2026-01-01T00:00:00.000Z')")
    const row = prodSqlite.query('SELECT id FROM company_blacklist WHERE user_id = 2').get() as { id: number }
    const res = await blacklistApp.request(`/${row.id}`, { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Not found')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 for non-existent ID', async () => {
    const res = await blacklistApp.request('/99999', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Not found')
    expect(body).not.toHaveProperty('message')
  })
})
