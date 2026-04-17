process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// Mock generate-pdf BEFORE importing resume-service to prevent real Playwright launch
let capturedHtml = ''
mock.module('../services/generate-pdf', () => ({
  generatePdf: async (html: string) => {
    capturedHtml = html
    return Buffer.from('%PDF-mock')
  },
}))

const { generateResume } = await import('../services/resume-service')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, phone TEXT, location TEXT,
    linkedin_url TEXT, github_url TEXT, summary TEXT,
    experience TEXT, skills TEXT, education TEXT
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
  id: 1, company: 'Acme Corp', jobTitle: 'Senior Engineer',
  jobDescription: 'Build great things at scale.', location: 'Amsterdam',
  fitScore: null, recommendation: null, roleFit: null, requirementsMet: null,
  requirementsMissed: null, redFlags: null, sourceUrl: null, dateScraped: null,
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

function mockAnthropicSuccess(text: string): void {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(
      JSON.stringify({ content: [{ type: 'text', text }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  ) as typeof globalThis.fetch
}

describe('generateResume() — fence stripping', () => {
  test('strips ```html fence before passing to generatePdf', async () => {
    mockAnthropicSuccess('```html\n<html><body>Resume</body></html>\n```')
    await generateResume(MOCK_JOB)
    expect(capturedHtml).toBe('<html><body>Resume</body></html>')
  })

  test('strips ``` fence (no language tag) before passing to generatePdf', async () => {
    mockAnthropicSuccess('```\n<html><body>Resume</body></html>\n```')
    await generateResume(MOCK_JOB)
    expect(capturedHtml).toBe('<html><body>Resume</body></html>')
  })

  test('passes clean HTML unchanged when no fences present', async () => {
    mockAnthropicSuccess('<html><body>Resume</body></html>')
    await generateResume(MOCK_JOB)
    expect(capturedHtml).toBe('<html><body>Resume</body></html>')
  })

  test('returns Buffer from generatePdf', async () => {
    mockAnthropicSuccess('<html><body>Resume</body></html>')
    const result = await generateResume(MOCK_JOB)
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('generateResume() — error handling', () => {
  test('throws when ANTHROPIC_API_KEY is absent', async () => {
    const orig = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('ANTHROPIC_API_KEY not configured')
    process.env.ANTHROPIC_API_KEY = orig
  })

  test('throws when Anthropic returns HTTP error', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 }))) as typeof globalThis.fetch
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('Anthropic error 500')
  })

  test('throws when Anthropic returns empty text', async () => {
    mockAnthropicSuccess('   ')
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('Anthropic returned empty resume')
  })
})
