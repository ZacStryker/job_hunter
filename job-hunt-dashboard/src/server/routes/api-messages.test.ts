process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

const { default: messagesRoute } = await import('./api-messages')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const messagesApp = (() => {
  const w = new Hono()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', messagesRoute)
  return w
})()

const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL UNIQUE,
    received_at TEXT NOT NULL,
    from_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT,
    company TEXT,
    job_title TEXT,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`

const CREATE_USER_SECRETS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_MESSAGES_TABLE)
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM messages')
  prodSqlite.run('DELETE FROM user_secrets')
})

describe('POST /api/messages/sync', () => {
  test('no user_secrets → 503 with not configured message', async () => {
    const res = await messagesApp.request('/sync', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('not configured')
  })

  test('corrupt/invalid ciphertext → 500 with failed to read message', async () => {
    prodSqlite.run(`
      INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES
        (1, 'imap_host', 'not-valid-ciphertext', '2026-04-30T00:00:00.000Z'),
        (1, 'imap_user', 'not-valid-ciphertext', '2026-04-30T00:00:00.000Z'),
        (1, 'imap_pass', 'not-valid-ciphertext', '2026-04-30T00:00:00.000Z')
    `)
    const res = await messagesApp.request('/sync', { method: 'POST' })
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Failed to read email credentials')
  })
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
