process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// --- cosineSimilarity unit tests (no mock needed, no DB needed) ---
const { cosineSimilarity } = await import('./embedding-service')

describe('cosineSimilarity', () => {
  test('identical normalized vectors return >= 0.999', () => {
    const a = new Array(384).fill(0)
    a[0] = 1  // unit vector [1, 0, 0, ...]
    expect(cosineSimilarity(a, a)).toBeGreaterThanOrEqual(0.999)
  })

  test('orthogonal unit vectors return ~0.0', () => {
    const a = new Array(384).fill(0); a[0] = 1
    const b = new Array(384).fill(0); b[1] = 1
    expect(Math.abs(cosineSimilarity(a, b))).toBeLessThan(1e-10)
  })

  test('pre-normalized 2D vectors return ~1.0 for identical', () => {
    // [0.6, 0.8] has magnitude 1.0 (already normalized)
    const v = [0.6, 0.8]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10)
  })
})

// --- Integration test: real model ---
describe('embed (real model)', () => {
  test('returns number[] of length 384', async () => {
    const { embed } = await import('./embedding-service')
    const result = await embed('test')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(384)
    expect(typeof result[0]).toBe('number')
  }, 60_000)  // model load can be slow — 60s timeout
})

// --- getOrComputeResumeEmbedding tests (embed mocked) ---
const mockEmbedFn = mock(async (_text: string) => new Array(384).fill(0.1))

mock.module('./embedding-service', () => ({
  embed: mockEmbedFn,
  cosineSimilarity,
}))

// Import after mock.module so resume-embedding-cache picks up the mock
const { getOrComputeResumeEmbedding } = await import('./resume-embedding-cache')
const { db } = await import('../../db/client')
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

beforeAll(() => {
  prodSqlite.run(CREATE_USERS_TABLE)
  prodSqlite.run(CREATE_USER_EMBEDDINGS_TABLE)
  prodSqlite.run(`INSERT OR IGNORE INTO users (email, password_hash, created_at) VALUES ('test@example.com', 'hash', '2026-01-01T00:00:00.000Z')`)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM user_embeddings')
  mockEmbedFn.mockReset()
  mockEmbedFn.mockImplementation(async (_text: string) => new Array(384).fill(0.1))
})

describe('getOrComputeResumeEmbedding', () => {
  test('cache miss: calls embed and writes to user_embeddings', async () => {
    const result = await getOrComputeResumeEmbedding(1, 'resume text', 'hash-abc')
    expect(mockEmbedFn).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(384)
    const row = prodSqlite.prepare('SELECT * FROM user_embeddings WHERE user_id = 1').get() as { embedding: string; profile_hash: string }
    expect(row).not.toBeNull()
    expect(row.profile_hash).toBe('hash-abc')
    expect(JSON.parse(row.embedding)).toHaveLength(384)
  })

  test('cache hit (same profileHash): returns cached embedding, embed not called', async () => {
    // Pre-populate cache
    const cachedEmbedding = new Array(384).fill(0.5)
    prodSqlite.prepare('INSERT INTO user_embeddings (user_id, embedding, profile_hash) VALUES (?, ?, ?)').run(1, JSON.stringify(cachedEmbedding), 'hash-abc')

    const result = await getOrComputeResumeEmbedding(1, 'resume text', 'hash-abc')
    expect(mockEmbedFn).not.toHaveBeenCalled()
    expect(result[0]).toBeCloseTo(0.5)
  })

  test('stale cache (different profileHash): recomputes and replaces row', async () => {
    prodSqlite.run(`INSERT INTO user_embeddings (user_id, embedding, profile_hash) VALUES (1, '[0.1]', 'old-hash')`)

    await getOrComputeResumeEmbedding(1, 'updated resume', 'new-hash')
    expect(mockEmbedFn).toHaveBeenCalledTimes(1)
    const rows = prodSqlite.prepare('SELECT * FROM user_embeddings WHERE user_id = 1').all() as Array<{ profile_hash: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].profile_hash).toBe('new-hash')
  })
})
