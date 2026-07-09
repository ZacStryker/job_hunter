process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

let capturedHtml = ''
mock.module('../services/generate-pdf', () => ({
  generatePdf: async (html: string) => {
    capturedHtml = html
    return Buffer.from('%PDF-mock')
  },
}))

const { generateCoverLetter } = await import('./cover-letter-service')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    profile_data TEXT,
    UNIQUE(user_id)
  )
`

const CREATE_PROMPTS_TABLE = `
  CREATE TABLE IF NOT EXISTS prompts (
    flow TEXT PRIMARY KEY NOT NULL,
    system_prompt TEXT,
    user_message TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`

const MOCK_JOB = {
  id: 1,
  company: 'Acme Corp',
  jobTitle: 'Senior Engineer',
  location: 'Amsterdam',
  jobDescription: 'Build great things at scale.',
  fitScore: null, recommendation: null, jobReqsMet: null, jobReqsMissed: null,
  candidateReqsMet: null, candidateReqsMissed: null, sourceUrl: null, dateScraped: null,
  source: null, externalJobId: null, analysisStatus: null, salary: null,
  benefits: null, contactName: null, contactEmail: null, contactPhone: null,
  applied: false, status: null, statusOverride: null, coverLetterSentAt: null,
  dateApplied: null, archived: false,
} as import('../../shared/schemas').Job

let originalFetch: typeof globalThis.fetch

beforeAll(() => {
  originalFetch = globalThis.fetch
  prodSqlite.run(CREATE_PROFILE_TABLE)
  prodSqlite.run(CREATE_PROMPTS_TABLE)
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM profile')
  capturedHtml = ''
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockAnthropicSuccess(text = 'Dear Hiring Manager,\n\nI am excited.\n\nSincerely,\nZac'): void {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 200 } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  ) as unknown as typeof globalThis.fetch
}

describe('generateCoverLetter()', () => {
  test('happy path: returns cover letter text with token counts', async () => {
    mockAnthropicSuccess('Dear Hiring Manager,\n\nThis is a great role.')

    const result = await generateCoverLetter(MOCK_JOB)
    expect(result.content).toBe('Dear Hiring Manager,\n\nThis is a great role.')
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(200)
  })

  test('missing ANTHROPIC_API_KEY: throws before any fetch', async () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    await expect(generateCoverLetter(MOCK_JOB)).rejects.toThrow('ANTHROPIC_API_KEY not configured')

    process.env.ANTHROPIC_API_KEY = original
  })

  test('missing profile: proceeds with empty fields, returns text', async () => {
    mockAnthropicSuccess('Dear Hiring Manager,\n\nI apply.')

    const result = await generateCoverLetter(MOCK_JOB)
    expect(result.content).toBe('Dear Hiring Manager,\n\nI apply.')
  })

  test('Anthropic HTTP error: throws with status', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    ) as unknown as typeof globalThis.fetch

    await expect(generateCoverLetter(MOCK_JOB)).rejects.toThrow('Anthropic error 500')
  })

  test('passes HTML to generatePdf containing the cover letter content', async () => {
    mockAnthropicSuccess('Dear Hiring Manager,\n\nI am excited about this role.')
    await generateCoverLetter(MOCK_JOB)
    expect(capturedHtml).toContain('Dear Hiring Manager')
    expect(capturedHtml).toContain('<!DOCTYPE html')
  })

  test('returns pdf Buffer from generatePdf', async () => {
    mockAnthropicSuccess('Dear Hiring Manager,\n\nGreat role.')
    const result = await generateCoverLetter(MOCK_JOB)
    expect(result.pdf).toBeInstanceOf(Buffer)
    expect(result.pdf.length).toBeGreaterThan(0)
  })

  test('Anthropic returns empty text: throws', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: '   ' }], usage: { input_tokens: 10, output_tokens: 0 } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    ) as unknown as typeof globalThis.fetch

    await expect(generateCoverLetter(MOCK_JOB)).rejects.toThrow('Anthropic returned empty cover letter')
  })
})
