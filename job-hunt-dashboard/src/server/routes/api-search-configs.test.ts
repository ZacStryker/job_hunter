process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

const { default: searchConfigsRoute } = await import('./api-search-configs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const searchConfigsApp = (() => {
  const w = new Hono()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', searchConfigsRoute)
  return w
})()

const CREATE_SEARCH_CONFIGS_TABLE = `
  CREATE TABLE IF NOT EXISTS search_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    query TEXT NOT NULL,
    location TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_SEARCH_CONFIGS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM search_configs')
})

describe('GET /api/search-configs', () => {
  test('returns empty array when table is empty', async () => {
    const res = await searchConfigsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  test('returns inserted rows', async () => {
    prodSqlite.run(
      "INSERT INTO search_configs (source, query, location) VALUES ('linkedin', 'genai ml', 'Amsterdam')"
    )
    const res = await searchConfigsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ source: string; query: string; location: string }>
    expect(body).toHaveLength(1)
    expect(body[0].source).toBe('linkedin')
    expect(body[0].query).toBe('genai ml')
    expect(body[0].location).toBe('Amsterdam')
  })
})

describe('POST /api/search-configs', () => {
  test('inserts a valid row and returns 201 with created object', async () => {
    const res = await searchConfigsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'indeed', query: 'python developer', location: 'remote' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: number; source: string; query: string; location: string; enabled: boolean }
    expect(body.source).toBe('indeed')
    expect(body.query).toBe('python developer')
    expect(body.location).toBe('remote')
    expect(body.enabled).toBe(true)
    expect(typeof body.id).toBe('number')
  })

  test('accepts null location', async () => {
    const res = await searchConfigsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'arc', query: 'full stack', location: null }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { location: null }
    expect(body.location).toBeNull()
  })

  test('returns 400 for invalid source enum', async () => {
    const res = await searchConfigsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'invalid_source', query: 'test', location: null }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for empty query', async () => {
    const res = await searchConfigsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'linkedin', query: '', location: null }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })

  test('returns 400 for invalid JSON', async () => {
    const res = await searchConfigsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})

describe('DELETE /api/search-configs/:id', () => {
  test('deletes an existing row and returns { id }', async () => {
    const insertResult = prodSqlite.run(
      "INSERT INTO search_configs (source, query, location) VALUES ('linkedin', 'test query', null)"
    )
    const id = insertResult.lastInsertRowid

    const res = await searchConfigsApp.request(`/${id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { id: number }
    expect(body).toEqual({ id: Number(id) })

    const rows = prodSqlite.query('SELECT * FROM search_configs').all()
    expect(rows).toHaveLength(0)
  })

  test('returns 404 for non-existent id', async () => {
    const res = await searchConfigsApp.request('/9999', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for non-numeric id', async () => {
    const res = await searchConfigsApp.request('/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})
