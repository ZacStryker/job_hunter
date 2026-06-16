process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, test, expect, beforeAll, beforeEach, afterAll, spyOn } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { OAuth2Client } from 'google-auth-library'
import type { AppEnv } from '../types'

const { default: onboardingRoute } = await import('./api-onboarding')
const { db: prodDb } = await import('../../db/client')
const { encodeState } = await import('../lib/gmail-oauth')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const onboardingApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); c.set('sessionUserId', 1); return next() })
  w.route('/', onboardingRoute)
  return w
})()

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
    user_id INTEGER NOT NULL REFERENCES users(id),
    label TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
  prodSqlite.run(CREATE_GMAIL_LABEL_MAPPINGS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM user_secrets')
  prodSqlite.run('DELETE FROM gmail_label_mappings')
})

describe('GET /api/onboarding/status', () => {
  test('no secrets → all false', async () => {
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasAnthropicKey: boolean; hasImap: boolean; hasLinkedinAuth: boolean; onboardingComplete: boolean }
    expect(body.hasAnthropicKey).toBe(false)
    expect(body.hasImap).toBe(false)
    expect(body.hasLinkedinAuth).toBe(false)
    expect(body.onboardingComplete).toBe(false)
  })

  test('with anthropic_api_key → hasAnthropicKey true, onboardingComplete true', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'anthropic_api_key', 'cipher', '2026-04-30T00:00:00.000Z')`
    )
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasAnthropicKey: boolean; hasImap: boolean; hasLinkedinAuth: boolean; onboardingComplete: boolean }
    expect(body.hasAnthropicKey).toBe(true)
    expect(body.hasImap).toBe(false)
    expect(body.hasLinkedinAuth).toBe(false)
    expect(body.onboardingComplete).toBe(true)
  })

  test('with imap_host, imap_user, imap_pass → hasImap true, onboardingComplete false', async () => {
    prodSqlite.run(`
      INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES
        (1, 'imap_host', 'cipher', '2026-04-30T00:00:00.000Z'),
        (1, 'imap_user', 'cipher', '2026-04-30T00:00:00.000Z'),
        (1, 'imap_pass', 'cipher', '2026-04-30T00:00:00.000Z')
    `)
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasAnthropicKey: boolean; hasImap: boolean; hasLinkedinAuth: boolean; onboardingComplete: boolean }
    expect(body.hasAnthropicKey).toBe(false)
    expect(body.hasImap).toBe(true)
    expect(body.hasLinkedinAuth).toBe(false)
    expect(body.onboardingComplete).toBe(false)
  })

  test('with linkedin_storage_state → hasLinkedinAuth true', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', 'cipher', '2026-04-30T00:00:00.000Z')`
    )
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasLinkedinAuth: boolean }
    expect(body.hasLinkedinAuth).toBe(true)
  })

  test('with indeed_storage_state → hasIndeedAuth true', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'indeed_storage_state', 'cipher', '2026-04-30T00:00:00.000Z')`
    )
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasIndeedAuth: boolean }
    expect(body.hasIndeedAuth).toBe(true)
  })

  test('no indeed_storage_state → hasIndeedAuth false', async () => {
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasIndeedAuth: boolean }
    expect(body.hasIndeedAuth).toBe(false)
  })

  test('response never contains ciphertext or raw secret value', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'anthropic_api_key', 'supersecret', '2026-04-30T00:00:00.000Z')`
    )
    const res = await onboardingApp.request('/status', { method: 'GET' })
    const text = await res.text()
    expect(text).not.toContain('supersecret')
    expect(text).not.toContain('ciphertext')
  })
})

describe('PUT /api/onboarding/linkedin', () => {
  test('valid content → 200 { ok: true } and row stored', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{"cookies":[],"origins":[]}' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    const row = prodSqlite.prepare(
      `SELECT key_name FROM user_secrets WHERE user_id = 1 AND key_name = 'linkedin_storage_state'`
    ).get() as { key_name: string } | undefined
    expect(row?.key_name).toBe('linkedin_storage_state')
  })

  test('empty content → 400', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('missing content field → 400', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  test('invalid JSON body → 400', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
  })

  test('second PUT upserts — single row in user_secrets', async () => {
    await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{"cookies":[],"origins":[]}' }),
    })
    await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{"cookies":[{"new":"true"}],"origins":[]}' }),
    })
    const rows = prodSqlite.prepare(
      `SELECT * FROM user_secrets WHERE key_name = 'linkedin_storage_state'`
    ).all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
  })
})

describe('PUT /api/onboarding/anthropic — input validation', () => {
  test('missing apiKey field → 400', async () => {
    const res = await onboardingApp.request('/anthropic', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('empty string apiKey → 400', async () => {
    const res = await onboardingApp.request('/anthropic', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('invalid JSON body → 400', async () => {
    const res = await onboardingApp.request('/anthropic', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })
})

describe('PUT /api/onboarding/indeed', () => {
  test('valid session file → 200 { ok: true } and row stored', async () => {
    const res = await onboardingApp.request('/indeed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: [{ name: 'sess', value: 'abc' }], origins: [] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    const row = prodSqlite.prepare(
      `SELECT key_name FROM user_secrets WHERE user_id = 1 AND key_name = 'indeed_storage_state'`
    ).get() as { key_name: string } | undefined
    expect(row?.key_name).toBe('indeed_storage_state')
  })

  test('missing cookies field → 400', async () => {
    const res = await onboardingApp.request('/indeed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origins: [] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('cookies is not an array → 400', async () => {
    const res = await onboardingApp.request('/indeed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: 'bad' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('invalid JSON body → 400', async () => {
    const res = await onboardingApp.request('/indeed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('second PUT upserts — single row in user_secrets', async () => {
    await onboardingApp.request('/indeed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: [], origins: [] }),
    })
    await onboardingApp.request('/indeed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: [{ name: 'new' }], origins: [] }),
    })
    const rows = prodSqlite.prepare(
      `SELECT * FROM user_secrets WHERE key_name = 'indeed_storage_state'`
    ).all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
  })
})

describe('PUT /api/onboarding/imap — input validation', () => {
  test('missing required fields → 400', async () => {
    const res = await onboardingApp.request('/imap', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'imap.example.com' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('port out of range → 400', async () => {
    const res = await onboardingApp.request('/imap', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'imap.example.com', port: 99999, user: 'u', pass: 'p' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('invalid JSON body → 400', async () => {
    const res = await onboardingApp.request('/imap', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })
})

describe('GET /api/onboarding/gmail/connect', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.APP_URL = 'http://localhost:3000'
  })

  test('configured → 200 with Google consent url (gmail.metadata only, offline, consent, state)', async () => {
    const res = await onboardingApp.request('/gmail/connect', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { url: string }
    expect(body.url).toContain('gmail.metadata')
    expect(body.url).not.toContain('userinfo.email')
    expect(body.url).not.toContain('openid')
    expect(body.url).toContain('access_type=offline')
    expect(body.url).toContain('prompt=consent')
    const state = new URL(body.url).searchParams.get('state')
    expect(state).toBeTruthy()
    expect(state!.length).toBeGreaterThan(0)
  })

  test('not configured → 503 with error key and no message key', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    const res = await onboardingApp.request('/gmail/connect', { method: 'GET' })
    expect(res.status).toBe(503)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
  })
})

describe('GET /api/onboarding/gmail/callback', () => {
  let getTokenSpy: ReturnType<typeof spyOn>
  let revokeSpy: ReturnType<typeof spyOn>
  const originalFetch = globalThis.fetch

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.APP_URL = 'http://localhost:3000'
    getTokenSpy = spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({
      tokens: { refresh_token: 'refresh-xyz', access_token: 'access-abc' },
    } as never)
    revokeSpy = spyOn(OAuth2Client.prototype, 'revokeToken').mockResolvedValue({} as never)
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('gmail/v1/users/me/profile')) {
        return new Response(JSON.stringify({ emailAddress: 'jobseeker@gmail.com' }), { status: 200 })
      }
      return originalFetch(input)
    }) as typeof fetch
  })

  afterAll(() => {
    getTokenSpy.mockRestore()
    revokeSpy.mockRestore()
    globalThis.fetch = originalFetch
  })

  test('missing state → 403, no token exchange, no rows written', async () => {
    const res = await onboardingApp.request('/gmail/callback?code=abc', { method: 'GET' })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
    const rows = prodSqlite.prepare(`SELECT * FROM user_secrets WHERE user_id = 1`).all()
    expect(rows).toHaveLength(0)
  })

  test('invalid/garbage state → 403, no token exchange, no rows written', async () => {
    getTokenSpy.mockClear()
    const res = await onboardingApp.request('/gmail/callback?code=abc&state=not-valid-ciphertext', { method: 'GET' })
    expect(res.status).toBe(403)
    expect(getTokenSpy).not.toHaveBeenCalled()
    const rows = prodSqlite.prepare(`SELECT * FROM user_secrets WHERE user_id = 1`).all()
    expect(rows).toHaveLength(0)
  })

  test('valid state → 302 with ?gmail=connected and two encrypted rows upserted', async () => {
    const state = encodeState({ uid: 1, ret: 'config' })
    const res = await onboardingApp.request(`/gmail/callback?code=abc&state=${encodeURIComponent(state)}`, { method: 'GET' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/config/profile/inbox-mapping?gmail=connected')

    const rows = prodSqlite.prepare(
      `SELECT key_name, ciphertext FROM user_secrets WHERE user_id = 1 ORDER BY key_name`
    ).all() as Array<{ key_name: string; ciphertext: string }>
    expect(rows.map((r) => r.key_name)).toEqual(['gmail_address', 'gmail_refresh_token'])
    const tokenRow = rows.find((r) => r.key_name === 'gmail_refresh_token')!
    expect(tokenRow.ciphertext).not.toBe('refresh-xyz')
    expect(tokenRow.ciphertext).toContain(':')
  })

  test('valid state with ret=onboarding → redirects to /onboarding', async () => {
    const state = encodeState({ uid: 1, ret: 'onboarding' })
    const res = await onboardingApp.request(`/gmail/callback?code=abc&state=${encodeURIComponent(state)}`, { method: 'GET' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/onboarding?gmail=connected')
  })

  test('Google returns error (user denied) → redirects to surface with ?gmail=error', async () => {
    const state = encodeState({ uid: 1, ret: 'config' })
    const res = await onboardingApp.request(`/gmail/callback?error=access_denied&state=${encodeURIComponent(state)}`, { method: 'GET' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/config/profile/inbox-mapping?gmail=error')
  })
})

describe('GET /api/onboarding/status — hasGmail', () => {
  test('with gmail_refresh_token row → hasGmail true', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'gmail_refresh_token', 'cipher', '2026-06-15T00:00:00.000Z')`
    )
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasGmail: boolean }
    expect(body.hasGmail).toBe(true)
  })

  test('no gmail_refresh_token row → hasGmail false', async () => {
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasGmail: boolean }
    expect(body.hasGmail).toBe(false)
  })
})

describe('GET /api/onboarding/status — gmailAddress', () => {
  test('connected (gmail_refresh_token + gmail_address) → hasGmail true and decrypted gmailAddress', async () => {
    const now = new Date().toISOString()
    const { encrypt } = await import('../lib/crypto')
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'gmail_refresh_token', ?, ?), (1, 'gmail_address', ?, ?)`,
      [encrypt('refresh-xyz'), now, encrypt('jobseeker@gmail.com'), now]
    )
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasGmail: boolean; gmailAddress: string | null }
    expect(body.hasGmail).toBe(true)
    expect(body.gmailAddress).toBe('jobseeker@gmail.com')
  })

  test('not connected → hasGmail false, gmailAddress null', async () => {
    const res = await onboardingApp.request('/status', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { hasGmail: boolean; gmailAddress: string | null }
    expect(body.hasGmail).toBe(false)
    expect(body.gmailAddress).toBeNull()
  })
})

describe('GET /api/onboarding/gmail/labels', () => {
  let getAccessTokenSpy: ReturnType<typeof spyOn>
  const originalFetch = globalThis.fetch

  beforeAll(() => {
    process.env.APP_URL = 'http://localhost:3000'
    getAccessTokenSpy = spyOn(OAuth2Client.prototype, 'getAccessToken').mockResolvedValue({ token: 'access-token' } as never)
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('gmail/v1/users/me/labels')) {
        return new Response(JSON.stringify({ labels: [{ id: 'Label_1', name: 'Jobs', type: 'user' }] }), { status: 200 })
      }
      return originalFetch(input)
    }) as typeof fetch
  })

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    getAccessTokenSpy.mockClear()
  })

  afterAll(() => {
    getAccessTokenSpy.mockRestore()
    globalThis.fetch = originalFetch
  })

  async function seedRefreshToken(): Promise<void> {
    const { encrypt } = await import('../lib/crypto')
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'gmail_refresh_token', ?, ?)`,
      [encrypt('refresh-xyz'), new Date().toISOString()]
    )
  }

  test('configured + connected → 200 with [{ id, name }] array', async () => {
    await seedRefreshToken()
    const res = await onboardingApp.request('/gmail/labels', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ id: string; name: string }>
    expect(body).toEqual([{ id: 'Label_1', name: 'Jobs' }])
  })

  test('connected but labels fetch fails → 502 with error key', async () => {
    await seedRefreshToken()
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('gmail/v1/users/me/labels')) return new Response('nope', { status: 401 })
      return originalFetch(input)
    }) as typeof fetch
    const res = await onboardingApp.request('/gmail/labels', { method: 'GET' })
    expect(res.status).toBe(502)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('gmail/v1/users/me/labels')) {
        return new Response(JSON.stringify({ labels: [{ id: 'Label_1', name: 'Jobs', type: 'user' }] }), { status: 200 })
      }
      return originalFetch(input)
    }) as typeof fetch
  })

  test('connected but refresh token revoked (getAccessToken rejects) → 502 with error key', async () => {
    await seedRefreshToken()
    getAccessTokenSpy.mockRejectedValueOnce(new Error('invalid_grant') as never)
    const res = await onboardingApp.request('/gmail/labels', { method: 'GET' })
    expect(res.status).toBe(502)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
  })

  test('not connected (no refresh-token row) → 503 with error key', async () => {
    const res = await onboardingApp.request('/gmail/labels', { method: 'GET' })
    expect(res.status).toBe(503)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
  })

  test('not configured → 503, no token refresh or fetch', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    let fetchCalled = false
    const guardedFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalled = true
      return guardedFetch(input)
    }) as typeof fetch
    await seedRefreshToken()
    const res = await onboardingApp.request('/gmail/labels', { method: 'GET' })
    expect(res.status).toBe(503)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect(body.message).toBeUndefined()
    expect(getAccessTokenSpy).not.toHaveBeenCalled()
    expect(fetchCalled).toBe(false)
    globalThis.fetch = guardedFetch
  })
})

describe('DELETE /api/onboarding/gmail', () => {
  let revokeSpy: ReturnType<typeof spyOn>

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.APP_URL = 'http://localhost:3000'
  })

  afterAll(() => {
    revokeSpy?.mockRestore()
  })

  test('removes both gmail_* rows and returns { ok: true }', async () => {
    const now = new Date().toISOString()
    const { encrypt } = await import('../lib/crypto')
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'gmail_refresh_token', ?, ?), (1, 'gmail_address', ?, ?)`,
      [encrypt('refresh-xyz'), now, encrypt('me@gmail.com'), now]
    )
    revokeSpy = spyOn(OAuth2Client.prototype, 'revokeToken').mockResolvedValue({} as never)

    const res = await onboardingApp.request('/gmail', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const rows = prodSqlite.prepare(`SELECT * FROM user_secrets WHERE user_id = 1`).all()
    expect(rows).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledTimes(1)
    revokeSpy.mockRestore()
  })

  test('tolerates revoke failure — still removes rows and returns { ok: true }', async () => {
    const now = new Date().toISOString()
    const { encrypt } = await import('../lib/crypto')
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'gmail_refresh_token', ?, ?)`,
      [encrypt('refresh-xyz'), now]
    )
    revokeSpy = spyOn(OAuth2Client.prototype, 'revokeToken').mockRejectedValue(new Error('network down') as never)

    const res = await onboardingApp.request('/gmail', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    const rows = prodSqlite.prepare(`SELECT * FROM user_secrets WHERE user_id = 1`).all()
    expect(rows).toHaveLength(0)
    revokeSpy.mockRestore()
  })

  test('no gmail row present → returns { ok: true } without revoke', async () => {
    const res = await onboardingApp.request('/gmail', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  test('also deletes the user\'s gmail_label_mappings rows', async () => {
    const now = new Date().toISOString()
    const { encrypt } = await import('../lib/crypto')
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'gmail_refresh_token', ?, ?)`,
      [encrypt('refresh-xyz'), now]
    )
    prodSqlite.run(
      `INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (1, 'Jobs', 'Interview', ?)`,
      [now]
    )
    revokeSpy = spyOn(OAuth2Client.prototype, 'revokeToken').mockResolvedValue({} as never)

    const res = await onboardingApp.request('/gmail', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const mappings = prodSqlite.prepare(`SELECT * FROM gmail_label_mappings WHERE user_id = 1`).all()
    expect(mappings).toHaveLength(0)
    revokeSpy.mockRestore()
  })
})
