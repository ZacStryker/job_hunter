process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

const { default: onboardingRoute } = await import('./api-onboarding')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const onboardingApp = (() => {
  const w = new Hono()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
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

beforeAll(() => {
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM user_secrets')
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
