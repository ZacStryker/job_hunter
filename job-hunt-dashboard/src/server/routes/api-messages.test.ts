process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { default: messagesApp } = await import('./api-messages')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL UNIQUE,
    received_at TEXT NOT NULL,
    from_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT,
    company TEXT,
    job_title TEXT
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_MESSAGES_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM messages')
})

describe('GET /api/messages', () => {
  test('returns empty array when no messages', async () => {
    const res = await messagesApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { messages: unknown[] }
    expect(body.messages).toEqual([])
  })

  test('returns messages ordered by received_at DESC', async () => {
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject) VALUES
        ('uid1', '2026-04-01T10:00:00.000Z', 'a@test.com', 'First'),
        ('uid2', '2026-04-03T10:00:00.000Z', 'b@test.com', 'Third'),
        ('uid3', '2026-04-02T10:00:00.000Z', 'c@test.com', 'Second')`
    )
    const res = await messagesApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { messages: Array<{ subject: string }> }
    expect(body.messages.map((m) => m.subject)).toEqual(['Third', 'Second', 'First'])
  })
})

describe('PATCH /api/messages/:id', () => {
  test('returns 200 with updated type', async () => {
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject) VALUES ('uid-t1', '2026-04-01T00:00:00.000Z', 'x@test.com', 'Subject')`
    )
    const row = prodSqlite.query('SELECT id FROM messages WHERE uid = ?').get('uid-t1') as { id: number }
    const res = await messagesApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Rejected' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { message: { type: string } }
    expect(body.message.type).toBe('Rejected')
  })

  test('returns 200 with updated company and jobTitle', async () => {
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject) VALUES ('uid-t2', '2026-04-01T00:00:00.000Z', 'x@test.com', 'Subject')`
    )
    const row = prodSqlite.query('SELECT id FROM messages WHERE uid = ?').get('uid-t2') as { id: number }
    const res = await messagesApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Acme', jobTitle: 'Engineer' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { message: { company: string; jobTitle: string } }
    expect(body.message.company).toBe('Acme')
    expect(body.message.jobTitle).toBe('Engineer')
  })

  test('returns 404 for non-existent message', async () => {
    const res = await messagesApp.request('/999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Rejected' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
    expect((body as unknown as { message?: string }).message).toBeUndefined()
  })

  test('returns 400 with error key (not message key) for empty patch', async () => {
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject) VALUES ('uid-t3', '2026-04-01T00:00:00.000Z', 'x@test.com', 'Subject')`
    )
    const row = prodSqlite.query('SELECT id FROM messages WHERE uid = ?').get('uid-t3') as { id: number }
    const res = await messagesApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
    expect((body as unknown as { message?: string }).message).toBeUndefined()
  })
})
