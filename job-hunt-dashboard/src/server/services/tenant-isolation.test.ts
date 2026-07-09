process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.APP_URL = 'http://localhost:3000'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { and, eq } from 'drizzle-orm'
import type { AppEnv } from '../types'

const { default: messagesRoute } = await import('../routes/api-messages')
const { db: prodDb } = await import('../../db/client')
const { messages } = await import('../../db/schema')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const USER_A = 1
const USER_B = 2

// Mirrors src/db/schema.ts after migration 0039: uniqueness on (uid, user_id) and
// (message_id, user_id), never on the columns alone.
const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    message_id TEXT,
    received_at TEXT NOT NULL,
    from_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT,
    company TEXT,
    job_title TEXT,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`
const CREATE_UID_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS messages_uid_user_id_idx ON messages (uid, user_id)`
const CREATE_MSGID_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS messages_message_id_user_id_idx ON messages (message_id, user_id)`

/** Mounts the real route with `userId` pinned, standing in for auth middleware. */
function appActingAs(userId: number) {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', userId); return next() })
  w.route('/', messagesRoute)
  return w
}

function insertMessage(userId: number, uid: string, messageId: string | null) {
  return prodDb.insert(messages)
    .values({
      uid,
      messageId,
      receivedAt: '2026-07-01T00:00:00.000Z',
      fromAddress: `sender-${userId}@example.com`,
      subject: `subject for user ${userId}`,
      type: 'Submitted',
      userId,
    })
    .onConflictDoNothing()
    .run()
}

beforeAll(() => {
  prodSqlite.run(CREATE_MESSAGES_TABLE)
  prodSqlite.run(CREATE_UID_INDEX)
  prodSqlite.run(CREATE_MSGID_INDEX)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM messages')
})

describe('messages uniqueness is per-tenant, not global', () => {
  test('two tenants may hold the same IMAP UID', () => {
    insertMessage(USER_A, 'INBOX:1', '<a@example.com>')
    insertMessage(USER_B, 'INBOX:1', '<b@example.com>')

    const rows = prodDb.select().from(messages).where(eq(messages.uid, 'INBOX:1')).all()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.userId).sort()).toEqual([USER_A, USER_B])
  })

  test('two tenants may hold the same RFC-2822 Message-ID', () => {
    const shared = '<broadcast@jobboard.example>'
    insertMessage(USER_A, 'INBOX:10', shared)
    insertMessage(USER_B, 'INBOX:20', shared)

    const rows = prodDb.select().from(messages).where(eq(messages.messageId, shared)).all()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.userId).sort()).toEqual([USER_A, USER_B])
  })

  test('the same tenant still cannot duplicate a UID', () => {
    insertMessage(USER_A, 'INBOX:1', '<a@example.com>')
    insertMessage(USER_A, 'INBOX:1', '<duplicate@example.com>')

    const rows = prodDb.select().from(messages).where(eq(messages.userId, USER_A)).all()
    expect(rows).toHaveLength(1)
  })

  test('one tenant may hold many messages with a null Message-ID', () => {
    insertMessage(USER_A, 'INBOX:1', null)
    insertMessage(USER_A, 'INBOX:2', null)

    const rows = prodDb.select().from(messages).where(eq(messages.userId, USER_A)).all()
    expect(rows).toHaveLength(2)
  })
})

describe("user B cannot see or mutate user A's rows", () => {
  beforeEach(() => {
    // Seed as user A. Same uid and message_id user B will later use, to prove the
    // isolation holds precisely where the old global unique index would have collided.
    insertMessage(USER_A, 'INBOX:1', '<shared@example.com>')
  })

  test('a userId-scoped select as B returns none of A\'s rows', () => {
    const rows = prodDb.select().from(messages).where(eq(messages.userId, USER_B)).all()
    expect(rows).toHaveLength(0)
  })

  test('GET / acting as B returns only B\'s rows', async () => {
    insertMessage(USER_B, 'INBOX:1', '<shared@example.com>')

    const res = await appActingAs(USER_B).request('/')
    expect(res.status).toBe(200)

    const body = (await res.json()) as { messages: Array<{ userId: number; subject: string }> }
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].userId).toBe(USER_B)
    expect(body.messages[0].subject).toBe(`subject for user ${USER_B}`)
  })

  test("GET / acting as B is empty when only A has rows", async () => {
    const res = await appActingAs(USER_B).request('/')
    const body = (await res.json()) as { messages: unknown[] }
    expect(body.messages).toHaveLength(0)
  })

  test("PATCH acting as B cannot mutate A's row", async () => {
    const aRow = prodDb.select().from(messages).where(eq(messages.userId, USER_A)).get()
    expect(aRow).toBeDefined()

    const res = await appActingAs(USER_B).request(`/${aRow!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company: 'Hijacked' }),
    })
    expect(res.status).toBe(404)

    const after = prodDb.select().from(messages)
      .where(and(eq(messages.id, aRow!.id), eq(messages.userId, USER_A))).get()
    expect(after!.company).toBeNull()
  })
})
