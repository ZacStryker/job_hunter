process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { default: promptsApp } = await import('./api-prompts')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_PROMPTS_TABLE = `
  CREATE TABLE IF NOT EXISTS prompts (
    flow TEXT PRIMARY KEY NOT NULL,
    system_prompt TEXT,
    user_message TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_PROMPTS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM prompts')
})

describe('GET /api/prompts', () => {
  test('returns 3 items with isCustom: false when table is empty', async () => {
    const res = await promptsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toHaveLength(3)
    for (const item of body as Array<{ isCustom: boolean; updatedAt: unknown }>) {
      expect(item.isCustom).toBe(false)
      expect(item.updatedAt).toBeNull()
    }
  })

  test('returns flows in order: analysis, cover_letter, resume', async () => {
    const res = await promptsApp.request('/', { method: 'GET' })
    const body = await res.json() as Array<{ flow: string }>
    expect(body.map((b) => b.flow)).toEqual(['analysis', 'cover_letter', 'resume'])
  })
})

describe('PUT /api/prompts/:flow', () => {
  test('saves custom prompt and returns isCustom: true', async () => {
    const res = await promptsApp.request('/analysis', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: null, userMessage: 'Custom analysis prompt {{CANDIDATE_PROFILE_JSON}}' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { isCustom: boolean; flow: string }
    expect(body.isCustom).toBe(true)
    expect(body.flow).toBe('analysis')
  })

  test('subsequent GET returns custom values for saved flow', async () => {
    await promptsApp.request('/analysis', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: null, userMessage: 'My custom prompt' }),
    })
    const res = await promptsApp.request('/', { method: 'GET' })
    const body = await res.json() as Array<{ flow: string; userMessage: string; isCustom: boolean }>
    const analysisItem = body.find((b) => b.flow === 'analysis')!
    expect(analysisItem.userMessage).toBe('My custom prompt')
    expect(analysisItem.isCustom).toBe(true)
  })

  test('returns 404 for unknown flow', async () => {
    const res = await promptsApp.request('/invalid-flow', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: null, userMessage: 'test' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 when userMessage is empty', async () => {
    const res = await promptsApp.request('/analysis', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: null, userMessage: '' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})

describe('DELETE /api/prompts/:flow', () => {
  test('deletes custom prompt and returns default with isCustom: false', async () => {
    // First save a custom prompt
    await promptsApp.request('/analysis', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: null, userMessage: 'Custom' }),
    })
    // Then delete
    const res = await promptsApp.request('/analysis', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { isCustom: boolean; updatedAt: unknown }
    expect(body.isCustom).toBe(false)
    expect(body.updatedAt).toBeNull()
  })

  test('returns 404 for unknown flow', async () => {
    const res = await promptsApp.request('/unknown', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})
