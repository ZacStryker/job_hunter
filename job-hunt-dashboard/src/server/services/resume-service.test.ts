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

// generateResume now takes a REQUIRED userId, so the no-API-key path falls through to the
// per-user encrypted key lookup instead of short-circuiting on `userId === undefined`. Without this
// table that lookup would throw `no such table: user_secrets` rather than the expected error — and
// relying on another test file to have created it first is exactly the cross-file DDL trap this
// repo has been bitten by. Matches schema.ts.
const CREATE_USER_SECRETS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )
`

const TEST_USER_ID = 1

const MOCK_JOB = {
  id: 1, company: 'Acme Corp', jobTitle: 'Senior Engineer',
  jobDescription: 'Build great things at scale.', location: 'Amsterdam',
  fitScore: null, recommendation: null, jobReqsMet: null, jobReqsMissed: null,
  candidateReqsMet: null, candidateReqsMissed: null, sourceUrl: null, dateScraped: null,
  source: null, externalJobId: null, analysisStatus: null, salary: null,
  benefits: null, contactName: null, contactEmail: null, contactPhone: null,
  applied: false, status: null, statusOverride: null, coverLetterSentAt: null,
  dateApplied: null, archived: false,
} as import('../../shared/schemas').Job

const VALID_RESUME_JSON = {
  first_name: 'Jane', last_name: 'Doe',
  title_01: 'Software Engineer', title_02: 'Platform Specialist',
  email: 'jane@example.com', website: 'https://jane.dev',
  linkedin: 'linkedin.com/in/janedoe', location: 'Amsterdam, NL',
  summary: 'Experienced engineer with 8 years building distributed systems.',
  skill_groups: [{ label: 'Languages', skills: ['TypeScript', 'Python', 'Go'] }],
  education: [{ school: 'TU Delft', degree: 'BSc Computer Science', year: '2016' }],
  projects: [],
  experience: [{
    company: 'Acme Corp', location: 'Amsterdam', dates: '2021–2024',
    role: 'Senior Engineer',
    bullets: ['Built scalable pipeline processing 10M events/day.'],
  }],
}

let originalFetch: typeof globalThis.fetch

beforeAll(() => {
  originalFetch = globalThis.fetch
  prodSqlite.run(CREATE_PROFILE_TABLE)
  prodSqlite.run(CREATE_PROMPTS_TABLE)
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

let capturedRequestBody = ''

beforeEach(() => {
  prodSqlite.run('DELETE FROM profile')
  capturedHtml = ''
  capturedRequestBody = ''
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockAnthropicSuccess(text: string): void {
  globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
    capturedRequestBody = typeof init?.body === 'string' ? init.body : ''
    return Promise.resolve(new Response(
      JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 200 } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  }) as unknown as typeof globalThis.fetch
}

describe('generateResume() — JSON pipeline', () => {
  test('parses valid JSON, injects into template, passes to generatePdf', async () => {
    mockAnthropicSuccess(JSON.stringify(VALID_RESUME_JSON))
    const result = await generateResume(MOCK_JOB, TEST_USER_ID)
    expect(result.pdf).toBeInstanceOf(Buffer)
    expect(result.pdf.length).toBeGreaterThan(0)
    expect(capturedHtml).toContain('<script id="resume-data" type="application/json">')
    expect(capturedHtml).toContain('"first_name": "Jane"')
  })

  test('returns correct token counts', async () => {
    mockAnthropicSuccess(JSON.stringify(VALID_RESUME_JSON))
    const result = await generateResume(MOCK_JOB, TEST_USER_ID)
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(200)
  })

  // One note per job, shared by both documents — the resume reads the same jobs.generationContext.
  test('generationContext is appended to JOB_DETAILS and reaches Anthropic', async () => {
    mockAnthropicSuccess(JSON.stringify(VALID_RESUME_JSON))
    await generateResume({
      ...MOCK_JOB,
      generationContext: 'Sarah Chen referred me. Lead with the payments migration.',
    }, TEST_USER_ID)
    expect(capturedRequestBody).toContain('Additional context from the candidate: Sarah Chen referred me. Lead with the payments migration.')
  })

  test('no generationContext: no context label appears in the prompt', async () => {
    mockAnthropicSuccess(JSON.stringify(VALID_RESUME_JSON))
    await generateResume({ ...MOCK_JOB, generationContext: null }, TEST_USER_ID)
    expect(capturedRequestBody).toContain('Acme Corp') // anchor: the prompt WAS built and sent
    expect(capturedRequestBody).not.toContain('Additional context from the candidate')
  })

  // Regression: replace(regex, str) expands $$, $&, $` and $' in the REPLACEMENT — same hazard as
  // the cover letter, and the note is the first hand-typed field routed through it.
  test('generationContext containing $ substitution patterns is inserted literally', async () => {
    mockAnthropicSuccess(JSON.stringify(VALID_RESUME_JSON))
    const note = "Ask about the $5k bonus. Patterns: $& $` $' end."
    await generateResume({ ...MOCK_JOB, generationContext: note }, TEST_USER_ID)

    const sent = JSON.parse(capturedRequestBody) as { messages: Array<{ content: string }> }
    const userMessage = sent.messages[0].content
    expect(userMessage).toContain('Additional context from the candidate: ' + note)
    expect(userMessage).not.toContain('{{JOB_DETAILS}}')
  })

  test('strips code fences from JSON response if present', async () => {
    mockAnthropicSuccess('```json\n' + JSON.stringify(VALID_RESUME_JSON) + '\n```')
    const result = await generateResume(MOCK_JOB, TEST_USER_ID)
    expect(result.pdf).toBeInstanceOf(Buffer)
  })
})

describe('generateResume() — validation', () => {
  test('throws when LLM output is missing required fields', async () => {
    const invalid = { ...VALID_RESUME_JSON }
    delete (invalid as unknown as { experience: unknown }).experience
    mockAnthropicSuccess(JSON.stringify(invalid))
    await expect(generateResume(MOCK_JOB, TEST_USER_ID)).rejects.toThrow('Resume generation failed: LLM output did not conform to schema')
  })

  test('sanitizes title_02 instead of failing when it contains "and"', async () => {
    const bad = { ...VALID_RESUME_JSON, title_02: 'Systems Engineer and Architect' }
    mockAnthropicSuccess(JSON.stringify(bad))
    const result = await generateResume(MOCK_JOB, TEST_USER_ID)
    expect(result.data.title_02).toBe('Systems Engineer')
  })

  test('sanitizes title_02 instead of failing when it contains "&"', async () => {
    const bad = { ...VALID_RESUME_JSON, title_02: 'Platform & Infrastructure' }
    mockAnthropicSuccess(JSON.stringify(bad))
    const result = await generateResume(MOCK_JOB, TEST_USER_ID)
    expect(result.data.title_02).toBe('Platform')
  })

  test('throws when LLM output is not valid JSON', async () => {
    mockAnthropicSuccess('This is not JSON at all')
    await expect(generateResume(MOCK_JOB, TEST_USER_ID)).rejects.toThrow('Resume generation failed: LLM output was not valid JSON')
  })
})

describe('generateResume() — error handling', () => {
  test('throws when ANTHROPIC_API_KEY is absent', async () => {
    const orig = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateResume(MOCK_JOB, TEST_USER_ID)).rejects.toThrow('ANTHROPIC_API_KEY not configured')
    process.env.ANTHROPIC_API_KEY = orig
  })

  test('throws when Anthropic returns HTTP error', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 }))) as unknown as typeof globalThis.fetch
    await expect(generateResume(MOCK_JOB, TEST_USER_ID)).rejects.toThrow('Anthropic error 500')
  })

  test('throws when Anthropic returns empty text', async () => {
    mockAnthropicSuccess('   ')
    await expect(generateResume(MOCK_JOB, TEST_USER_ID)).rejects.toThrow('Anthropic returned empty resume')
  })
})
