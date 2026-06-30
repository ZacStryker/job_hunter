process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'
import type { ProbeResult, HealthProbes } from './setup-health'
import type { SetupStatus } from '../../shared/schemas'

// Stable mock so the named binding captured by setup-health stays valid; swap the
// behavior per-test via mockImplementationOnce.
const getAccessTokenMock = mock(async (_refreshToken: string) => 'access-token')
mock.module('../lib/gmail-oauth', () => ({ getAccessToken: getAccessTokenMock }))

const { createSetupHealth, probeAnthropic, probeGmailToken } = await import('./setup-health')
const { encrypt } = await import('../lib/crypto')
const { db: prodDb } = await import('../../db/client')
const sqlite = (prodDb as unknown as { $client: Database }).$client

const DDL = [
  `CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )`,
  `CREATE TABLE IF NOT EXISTS inbox_folder_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder_path TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gmail_label_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
]

function addSecret(userId: number, keyName: string, value: string) {
  sqlite.run(
    'INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (?, ?, ?, ?)',
    [userId, keyName, encrypt(value), '2026-01-01T00:00:00.000Z'],
  )
}

const STUB_STATUS: SetupStatus = { tasks: [], ready: false }

type ProbeOutcome = ProbeResult | 'throw'
type ProbeMap = { apiKey?: ProbeOutcome; inboxConnect?: ProbeOutcome; inboxMapping?: ProbeOutcome }

function makeHealth(results: ProbeMap = {}) {
  const emits: Array<{ userId: number; status: SetupStatus }> = []
  const calls = { anthropic: 0, imap: 0, gmail: 0, mapping: 0 }
  const probes: HealthProbes = {
    probeAnthropic: async () => { calls.anthropic++; return resolve(results.apiKey) },
    probeImap: async () => { calls.imap++; return resolve(results.inboxConnect) },
    probeGmailToken: async () => { calls.gmail++; return resolve(results.inboxConnect) },
    probeInboxMapping: async () => { calls.mapping++; return resolve(results.inboxMapping) },
  }
  const health = createSetupHealth({
    probes,
    computeStatus: () => STUB_STATUS,
    emit: (userId, status) => emits.push({ userId, status }),
  })
  return { health, emits, calls }
}

function resolve(r: ProbeOutcome | undefined): ProbeResult {
  if (r === undefined) return 'inconclusive'
  if (r === 'throw') throw new Error('probe boom')
  return r
}

beforeAll(() => {
  for (const stmt of DDL) sqlite.run(stmt)
})

beforeEach(() => {
  sqlite.run('DELETE FROM user_secrets')
  sqlite.run('DELETE FROM inbox_folder_mappings')
  sqlite.run('DELETE FROM gmail_label_mappings')
})

describe('cache + transitions', () => {
  test('markBroken / markHealthy / getHealth / clear semantics', () => {
    const { health } = makeHealth()
    expect(health.getHealth(1, 'apiKey')).toBeNull()
    health.markBroken(1, 'apiKey')
    expect(health.getHealth(1, 'apiKey')).toBe('broken')
    health.markHealthy(1, 'apiKey')
    expect(health.getHealth(1, 'apiKey')).toBe('healthy')
    health.clear(1, 'apiKey')
    expect(health.getHealth(1, 'apiKey')).toBeNull()
  })

  test('a transition emits exactly once', () => {
    const { health, emits } = makeHealth()
    health.markBroken(1, 'apiKey')
    expect(emits).toHaveLength(1)
    expect(emits[0]).toEqual({ userId: 1, status: STUB_STATUS })
  })

  test('repeated same-state writes emit zero further events', () => {
    const { health, emits } = makeHealth()
    health.markBroken(1, 'apiKey')
    health.markBroken(1, 'apiKey')
    health.markBroken(1, 'apiKey')
    expect(emits).toHaveLength(1)
  })

  test('broken → healthy is a transition and emits', () => {
    const { health, emits } = makeHealth()
    health.markBroken(1, 'apiKey')
    health.markHealthy(1, 'apiKey')
    expect(emits).toHaveLength(2)
  })

  test('per-user isolation — user A broken never reaches user B', () => {
    const { health } = makeHealth()
    health.markBroken(1, 'apiKey')
    expect(health.getHealth(2, 'apiKey')).toBeNull()
  })
})

describe('checkUserHealth', () => {
  test('present credential + broken probe ⇒ cached broken', async () => {
    const { health, calls } = makeHealth({ apiKey: 'broken' })
    addSecret(1, 'anthropic_api_key', 'sk-test')
    await health.checkUserHealth(1)
    expect(calls.anthropic).toBe(1)
    expect(health.getHealth(1, 'apiKey')).toBe('broken')
  })

  test('present credential + healthy probe ⇒ cached healthy', async () => {
    const { health } = makeHealth({ apiKey: 'healthy' })
    addSecret(1, 'anthropic_api_key', 'sk-test')
    await health.checkUserHealth(1)
    expect(health.getHealth(1, 'apiKey')).toBe('healthy')
  })

  test('inconclusive probe leaves prior state untouched (no-flap)', async () => {
    const { health } = makeHealth({ apiKey: 'inconclusive' })
    addSecret(1, 'anthropic_api_key', 'sk-test')
    health.markBroken(1, 'apiKey')
    await health.checkUserHealth(1)
    expect(health.getHealth(1, 'apiKey')).toBe('broken')
  })

  test('absent credential clears any stale cache entry', async () => {
    const { health, calls } = makeHealth({ apiKey: 'healthy' })
    health.markBroken(1, 'apiKey')
    await health.checkUserHealth(1)
    expect(calls.anthropic).toBe(0)
    expect(health.getHealth(1, 'apiKey')).toBeNull()
  })

  test('one throwing probe does not abort the others', async () => {
    const { health } = makeHealth({ apiKey: 'throw', inboxConnect: 'healthy' })
    addSecret(1, 'anthropic_api_key', 'sk-test')
    addSecret(1, 'imap_host', 'imap.example.com')
    addSecret(1, 'imap_port', '993')
    addSecret(1, 'imap_user', 'me')
    addSecret(1, 'imap_pass', 'pw')
    await health.checkUserHealth(1)
    // apiKey probe returned an invalid value, but inboxConnect still resolved
    expect(health.getHealth(1, 'inboxConnect')).toBe('healthy')
  })

  test('inboxConnect probed via Gmail token when no IMAP creds', async () => {
    const { health, calls } = makeHealth({ inboxConnect: 'broken' })
    addSecret(1, 'gmail_refresh_token', 'refresh-xyz')
    await health.checkUserHealth(1)
    expect(calls.gmail).toBe(1)
    expect(calls.imap).toBe(0)
    expect(health.getHealth(1, 'inboxConnect')).toBe('broken')
  })

  test('per-user DB isolation — checking user 1 never reads user 2 secrets', async () => {
    const { health, calls } = makeHealth({ apiKey: 'broken' })
    addSecret(2, 'anthropic_api_key', 'sk-other')
    await health.checkUserHealth(1)
    expect(calls.anthropic).toBe(0)
    expect(health.getHealth(1, 'apiKey')).toBeNull()
    expect(health.getHealth(2, 'apiKey')).toBeNull()
  })
})

describe('probe classification (no real network)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  function stubFetch(impl: () => Promise<Response>) {
    globalThis.fetch = impl as unknown as typeof fetch
  }

  test('probeAnthropic: 401 ⇒ broken', async () => {
    stubFetch(async () => new Response('', { status: 401 }))
    expect(await probeAnthropic('sk-test')).toBe('broken')
  })

  test('probeAnthropic: 2xx ⇒ healthy', async () => {
    stubFetch(async () => new Response('{}', { status: 200 }))
    expect(await probeAnthropic('sk-test')).toBe('healthy')
  })

  test('probeAnthropic: 5xx ⇒ inconclusive (no-flap)', async () => {
    stubFetch(async () => new Response('', { status: 500 }))
    expect(await probeAnthropic('sk-test')).toBe('inconclusive')
  })

  test('probeAnthropic: a non-401 4xx (e.g. 403) ⇒ inconclusive', async () => {
    stubFetch(async () => new Response('', { status: 403 }))
    expect(await probeAnthropic('sk-test')).toBe('inconclusive')
  })

  test('probeAnthropic: a fetch throw (network/timeout) ⇒ inconclusive', async () => {
    stubFetch(async () => { throw new Error('network down') })
    expect(await probeAnthropic('sk-test')).toBe('inconclusive')
  })

  test('probeGmailToken: valid token ⇒ healthy', async () => {
    getAccessTokenMock.mockImplementationOnce(async () => 'fresh-token')
    expect(await probeGmailToken('refresh-xyz')).toBe('healthy')
  })

  test('probeGmailToken: invalid_grant ⇒ broken', async () => {
    getAccessTokenMock.mockImplementationOnce(async () => {
      throw new Error('invalid_grant: Token has been expired or revoked.')
    })
    expect(await probeGmailToken('refresh-xyz')).toBe('broken')
  })

  test('probeGmailToken: other network error ⇒ inconclusive (no-flap)', async () => {
    getAccessTokenMock.mockImplementationOnce(async () => {
      throw new Error('getaddrinfo ENOTFOUND oauth2.googleapis.com')
    })
    expect(await probeGmailToken('refresh-xyz')).toBe('inconclusive')
  })
})
