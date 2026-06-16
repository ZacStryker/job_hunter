process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.APP_URL = 'http://localhost:3000'

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { OAuth2Client } from 'google-auth-library'

const { default: messagesRoute } = await import('./api-messages')
const { db: prodDb } = await import('../../db/client')
const { encrypt } = await import('../lib/crypto')
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
    message_id TEXT UNIQUE,
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

const CREATE_GMAIL_LABEL_MAPPINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS gmail_label_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_MESSAGES_TABLE)
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
  prodSqlite.run(CREATE_GMAIL_LABEL_MAPPINGS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM messages')
  prodSqlite.run('DELETE FROM user_secrets')
  prodSqlite.run('DELETE FROM gmail_label_mappings')
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

describe('POST /api/messages/sync (Gmail)', () => {
  const originalFetch = globalThis.fetch
  const originalGetAccessToken = OAuth2Client.prototype.getAccessToken

  let fromHeader = 'Acme HR <hr@acme.com>'
  let labelsCalled = false

  function installFetchMock() {
    labelsCalled = false
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      let payload: unknown
      if (url.includes('/labels')) {
        labelsCalled = true
        payload = { labels: [{ id: 'Label_1', name: 'Jobs' }] }
      } else if (url.includes('/messages/m1')) {
        payload = {
          internalDate: '1718409600000',
          payload: {
            headers: [
              { name: 'From', value: fromHeader },
              { name: 'Subject', value: 'Application received' },
              { name: 'Message-ID', value: '<abc@acme.com>' },
            ],
          },
        }
      } else if (url.includes('/messages?')) {
        payload = { messages: [{ id: 'm1' }] }
      } else {
        throw new Error(`Unexpected fetch to ${url}`)
      }
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
  }

  function mockAccessToken(resolve: boolean) {
    OAuth2Client.prototype.getAccessToken = (async () => {
      if (!resolve) throw new Error('invalid_grant')
      return { token: 'test-access-token' }
    }) as typeof OAuth2Client.prototype.getAccessToken
  }

  function seedGmailSecret() {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'gmail_refresh_token', ?, '2026-06-15T00:00:00.000Z')`,
      [encrypt('refresh-token')],
    )
  }

  function seedMapping(label = 'Jobs', jobStatus = 'Submitted') {
    prodSqlite.run(
      `INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (1, ?, ?, '2026-06-15T00:00:00.000Z')`,
      [label, jobStatus],
    )
  }

  beforeEach(() => {
    fromHeader = 'Acme HR <hr@acme.com>'
    installFetchMock()
    mockAccessToken(true)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    OAuth2Client.prototype.getAccessToken = originalGetAccessToken
  })

  test('happy path → 200 { added: 1 } and persists Gmail message', async () => {
    seedGmailSecret()
    seedMapping()
    const res = await messagesApp.request('/sync', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { added: number }
    expect(body.added).toBe(1)

    const row = prodSqlite.query('SELECT * FROM messages WHERE uid = ?').get('gmail:m1') as {
      type: string; from_address: string; message_id: string; received_at: string
    }
    expect(row.type).toBe('Submitted')
    expect(row.from_address).toBe('Acme HR <hr@acme.com>')
    expect(row.message_id).toBe('<abc@acme.com>')
    expect(typeof row.received_at).toBe('string')
    expect(row.received_at).toBe(new Date(1718409600000).toISOString())
  })

  test('dedup → second sync returns { added: 0 } and count stays 1', async () => {
    seedGmailSecret()
    seedMapping()
    await messagesApp.request('/sync', { method: 'POST' })
    const res = await messagesApp.request('/sync', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { added: number }
    expect(body.added).toBe(0)
    const count = prodSqlite.query('SELECT COUNT(*) AS n FROM messages').get() as { n: number }
    expect(count.n).toBe(1)
  })

  test('type-fill only when existing type is null', async () => {
    seedGmailSecret()
    seedMapping()
    prodSqlite.run(
      `INSERT INTO messages (uid, message_id, received_at, from_address, subject, type, user_id)
       VALUES ('old', '<abc@acme.com>', '2026-01-01T00:00:00.000Z', 'Acme HR <hr@acme.com>', 'Old', NULL, 1)`,
    )
    const res = await messagesApp.request('/sync', { method: 'POST' })
    const body = await res.json() as { added: number }
    expect(body.added).toBe(0)
    const row = prodSqlite.query('SELECT * FROM messages WHERE message_id = ?').get('<abc@acme.com>') as {
      type: string; uid: string
    }
    expect(row.type).toBe('Submitted')
    expect(row.uid).toBe('gmail:m1')

    // pre-set type must not be overwritten on a subsequent run
    prodSqlite.run(`UPDATE messages SET type = 'Rejected', uid = 'old2' WHERE message_id = '<abc@acme.com>'`)
    await messagesApp.request('/sync', { method: 'POST' })
    const row2 = prodSqlite.query('SELECT type FROM messages WHERE message_id = ?').get('<abc@acme.com>') as { type: string }
    expect(row2.type).toBe('Rejected')
  })

  test('blocked sender filtered → { added: 0 }, no row inserted', async () => {
    seedGmailSecret()
    seedMapping()
    fromHeader = 'Indeed <indeedapply@indeed.com>'
    const res = await messagesApp.request('/sync', { method: 'POST' })
    const body = await res.json() as { added: number }
    expect(body.added).toBe(0)
    const count = prodSqlite.query('SELECT COUNT(*) AS n FROM messages').get() as { n: number }
    expect(count.n).toBe(0)
  })

  test('Gmail wins when both Gmail and IMAP secrets present', async () => {
    seedGmailSecret()
    seedMapping()
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES
        (1, 'imap_host', ?, '2026-06-15T00:00:00.000Z'),
        (1, 'imap_user', ?, '2026-06-15T00:00:00.000Z'),
        (1, 'imap_pass', ?, '2026-06-15T00:00:00.000Z')`,
      [encrypt('imap.example.com'), encrypt('user'), encrypt('pass')],
    )
    const res = await messagesApp.request('/sync', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { added: number }
    expect(body.added).toBe(1)
    expect(labelsCalled).toBe(true)
  })

  test('no mappings → { added: 0 } without hitting Gmail labels endpoint', async () => {
    seedGmailSecret()
    const res = await messagesApp.request('/sync', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { added: number }
    expect(body.added).toBe(0)
    expect(labelsCalled).toBe(false)
  })

  test('revoked/expired token → 502 { error } mentioning reconnect, no token leaked', async () => {
    seedGmailSecret()
    seedMapping()
    mockAccessToken(false)
    const res = await messagesApp.request('/sync', { method: 'POST' })
    expect(res.status).toBe(502)
    const raw = await res.text()
    const body = JSON.parse(raw) as { error: string }
    expect(body.error).toContain('reconnect')
    expect((body as unknown as { message?: string }).message).toBeUndefined()
    expect(raw).not.toContain('refresh-token')
    expect(raw).not.toContain('test-access-token')
  })
})
