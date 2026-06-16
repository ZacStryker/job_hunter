process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../types'

const { default: gmailMappingsRoute } = await import('./api-config-gmail-mappings')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const app = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', gmailMappingsRoute)
  return w
})()

const CREATE_GMAIL_LABEL_MAPPINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS gmail_label_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    label TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

type Mapping = { id: number; userId: number; label: string; jobStatus: string; createdAt: string }

async function put(body: unknown): Promise<Response> {
  return app.request('/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeAll(() => {
  prodSqlite.run(CREATE_GMAIL_LABEL_MAPPINGS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM gmail_label_mappings')
})

describe('GET /api/config/gmail-mappings', () => {
  test('no rows → 200 []', async () => {
    const res = await app.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as Mapping[]
    expect(body).toEqual([])
  })
})

describe('PUT /api/config/gmail-mappings', () => {
  test('valid mapping → 200 with saved row, then GET returns the same', async () => {
    const res = await put([{ label: 'Jobs', jobStatus: 'Interview' }])
    expect(res.status).toBe(200)
    const body = await res.json() as Mapping[]
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ userId: 1, label: 'Jobs', jobStatus: 'Interview' })
    expect(typeof body[0]!.id).toBe('number')
    expect(typeof body[0]!.createdAt).toBe('string')

    const getRes = await app.request('/', { method: 'GET' })
    const getBody = await getRes.json() as Mapping[]
    expect(getBody).toEqual(body)
  })

  test('full replace — second PUT replaces the first set entirely', async () => {
    await put([
      { label: 'Jobs', jobStatus: 'Interview' },
      { label: 'Recruiters', jobStatus: 'Screening' },
    ])
    const res = await put([{ label: 'Offers', jobStatus: 'Offer' }])
    expect(res.status).toBe(200)
    const body = await res.json() as Mapping[]
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ label: 'Offers', jobStatus: 'Offer' })
  })

  test('per-user scoping — another user\'s rows are untouched and unseen', async () => {
    prodSqlite.run(
      `INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (2, 'Other', 'Rejected', ?)`,
      [new Date().toISOString()]
    )
    const res = await put([{ label: 'Jobs', jobStatus: 'Interview' }])
    expect(res.status).toBe(200)
    const body = await res.json() as Mapping[]
    expect(body).toHaveLength(1)
    expect(body[0]!.userId).toBe(1)

    const user2 = prodSqlite.prepare(`SELECT * FROM gmail_label_mappings WHERE user_id = 2`).all()
    expect(user2).toHaveLength(1)
  })

  test('invalid jobStatus → 400, no rows mutated', async () => {
    prodSqlite.run(
      `INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (1, 'Existing', 'Interview', ?)`,
      [new Date().toISOString()]
    )
    const res = await put([{ label: 'Jobs', jobStatus: 'Bogus' }])
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
    const rows = prodSqlite.prepare(`SELECT * FROM gmail_label_mappings WHERE user_id = 1`).all() as Mapping[]
    expect(rows).toHaveLength(1)
  })

  test('duplicate labels in one payload → 400, no rows mutated', async () => {
    prodSqlite.run(
      `INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (1, 'Existing', 'Interview', ?)`,
      [new Date().toISOString()]
    )
    const res = await put([
      { label: 'Jobs', jobStatus: 'Interview' },
      { label: 'Jobs', jobStatus: 'Offer' },
    ])
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
    const rows = prodSqlite.prepare(`SELECT * FROM gmail_label_mappings WHERE user_id = 1`).all() as Mapping[]
    expect(rows).toHaveLength(1)
  })

  test('malformed JSON → 400, no rows mutated', async () => {
    prodSqlite.run(
      `INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (1, 'Existing', 'Interview', ?)`,
      [new Date().toISOString()]
    )
    const res = await put('not-json')
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
    const rows = prodSqlite.prepare(`SELECT * FROM gmail_label_mappings WHERE user_id = 1`).all() as Mapping[]
    expect(rows).toHaveLength(1)
  })

  test('empty label → 400, no rows mutated', async () => {
    prodSqlite.run(
      `INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (1, 'Existing', 'Interview', ?)`,
      [new Date().toISOString()]
    )
    const res = await put([{ label: '', jobStatus: 'Interview' }])
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
    const rows = prodSqlite.prepare(`SELECT * FROM gmail_label_mappings WHERE user_id = 1`).all() as Mapping[]
    expect(rows).toHaveLength(1)
  })
})
