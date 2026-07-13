process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { db } = await import('./client')
const { userEmbeddings } = await import('./schema')
const { eq } = await import('drizzle-orm')

const prodSqlite = (db as unknown as { $client: Database }).$client

const CREATE_USERS_TABLE = `
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

const CREATE_USER_EMBEDDINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_embeddings (
    user_id INTEGER PRIMARY KEY NOT NULL,
    embedding TEXT NOT NULL,
    profile_hash TEXT NOT NULL
  )
`

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    fit_score INTEGER,
    recommendation TEXT,
    job_reqs_met TEXT,
    candidate_reqs_met TEXT,
    candidate_reqs_missed TEXT,
    job_reqs_missed TEXT,
    job_description TEXT,
    source_url TEXT,
    date_scraped TEXT,
    source TEXT,
    location TEXT,
    external_job_id TEXT,
    relevance_score REAL,
    analysis_status TEXT,
    date_analyzed TEXT,
    salary TEXT,
    benefits TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_override TEXT,
    cover_letter_sent_at TEXT,
    generation_context TEXT,
    date_applied TEXT,
    applied_at TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    resume_generated_at TEXT,
    user_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(company, job_title, user_id)
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_USERS_TABLE)
  prodSqlite.run(CREATE_USER_EMBEDDINGS_TABLE)
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(`INSERT OR IGNORE INTO users (email, password_hash, created_at) VALUES ('test@example.com', 'hash', '2026-01-01T00:00:00.000Z')`)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM user_embeddings')
})

describe('user_embeddings upsert', () => {
  test('inserts a row and retrieves it', async () => {
    db.insert(userEmbeddings).values({ userId: 1, embedding: '[1,2,3]', profileHash: 'abc' }).run()
    const row = db.select().from(userEmbeddings).where(eq(userEmbeddings.userId, 1)).get()
    expect(row).not.toBeNull()
    expect(row!.embedding).toBe('[1,2,3]')
    expect(row!.profileHash).toBe('abc')
  })

  test('upsert on same userId replaces embedding and profileHash', async () => {
    db.insert(userEmbeddings).values({ userId: 1, embedding: '[1,2,3]', profileHash: 'abc' }).run()
    db.insert(userEmbeddings)
      .values({ userId: 1, embedding: '[4,5,6]', profileHash: 'def' })
      .onConflictDoUpdate({
        target: [userEmbeddings.userId],
        set: { embedding: '[4,5,6]', profileHash: 'def' },
      })
      .run()

    const rows = db.select().from(userEmbeddings).where(eq(userEmbeddings.userId, 1)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].embedding).toBe('[4,5,6]')
    expect(rows[0].profileHash).toBe('def')
  })

  test('upsert leaves other users unaffected', async () => {
    prodSqlite.run(`INSERT OR IGNORE INTO users (email, password_hash, created_at) VALUES ('other@example.com', 'hash', '2026-01-01T00:00:00.000Z')`)
    const otherUser = prodSqlite.query('SELECT id FROM users WHERE email = ?').get('other@example.com') as { id: number }

    db.insert(userEmbeddings).values({ userId: 1, embedding: '[1,2,3]', profileHash: 'abc' }).run()
    db.insert(userEmbeddings).values({ userId: otherUser.id, embedding: '[7,8,9]', profileHash: 'xyz' }).run()

    db.insert(userEmbeddings)
      .values({ userId: 1, embedding: '[4,5,6]', profileHash: 'def' })
      .onConflictDoUpdate({
        target: [userEmbeddings.userId],
        set: { embedding: '[4,5,6]', profileHash: 'def' },
      })
      .run()

    const allRows = db.select().from(userEmbeddings).all()
    expect(allRows).toHaveLength(2)

    const user1Row = allRows.find((r) => r.userId === 1)!
    expect(user1Row.embedding).toBe('[4,5,6]')
    expect(user1Row.profileHash).toBe('def')

    const otherRow = allRows.find((r) => r.userId === otherUser.id)!
    expect(otherRow.embedding).toBe('[7,8,9]')
    expect(otherRow.profileHash).toBe('xyz')
  })
})
