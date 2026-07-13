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

let capturedRequestBody = ''

beforeEach(() => {
  prodSqlite.run('DELETE FROM profile')
  capturedHtml = ''
  capturedRequestBody = ''
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockAnthropicSuccess(text = 'Dear Hiring Manager,\n\nI am excited.\n\nSincerely,\nZac'): void {
  globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
    capturedRequestBody = typeof init?.body === 'string' ? init.body : ''
    return Promise.resolve(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 200 } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  }) as unknown as typeof globalThis.fetch
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

  // generationContext rides the existing {{JOB_DETAILS}} placeholder — no new placeholder, so a
  // user-overridden prompt in the `prompts` table cannot silently drop it.
  test('generationContext is appended to JOB_DETAILS and reaches Anthropic', async () => {
    mockAnthropicSuccess()
    await generateCoverLetter({
      ...MOCK_JOB,
      generationContext: 'Sarah Chen referred me. Lead with the payments migration.',
    })
    expect(capturedRequestBody).toContain('Additional context from the candidate: Sarah Chen referred me. Lead with the payments migration.')
    // still carries the original job details
    expect(capturedRequestBody).toContain('Acme Corp')
  })

  test('no generationContext: no context label appears in the prompt', async () => {
    mockAnthropicSuccess()
    await generateCoverLetter({ ...MOCK_JOB, generationContext: null })
    expect(capturedRequestBody).toContain('Acme Corp') // anchor: the prompt WAS built and sent
    expect(capturedRequestBody).not.toContain('Additional context from the candidate')
  })

  test('whitespace-only generationContext: no context label appears in the prompt', async () => {
    mockAnthropicSuccess()
    await generateCoverLetter({ ...MOCK_JOB, generationContext: '   ' })
    expect(capturedRequestBody).toContain('Acme Corp') // anchor: the prompt WAS built and sent
    expect(capturedRequestBody).not.toContain('Additional context from the candidate')
  })

  // Regression: replaceAll(str, str) expands $$, $&, $` and $' in the REPLACEMENT. A note is
  // hand-typed, so "$" is common ("the $5k bonus"). Without the function-form replacement these
  // sequences splice surrounding prompt text into the job details instead of inserting literally.
  test('generationContext containing $ substitution patterns is inserted literally', async () => {
    mockAnthropicSuccess()
    const note = "Ask about the $5k bonus. Budget is $$$. Patterns: $& $` $' end."
    await generateCoverLetter({ ...MOCK_JOB, generationContext: note })

    const sent = JSON.parse(capturedRequestBody) as { messages: Array<{ content: string }> }
    const userMessage = sent.messages[0].content
    expect(userMessage).toContain('Additional context from the candidate: ' + note)
    expect(userMessage).not.toContain('{{JOB_DETAILS}}') // $& would re-emit the placeholder
  })

  // A <textarea> routinely produces quotes and newlines; assert via the parsed body, not a raw
  // substring, so JSON escaping cannot mask a real failure (or fake a passing one).
  test('generationContext with quotes and newlines survives into the prompt intact', async () => {
    mockAnthropicSuccess()
    const note = 'Referral: "Sarah Chen"\nAsk about the staff track.'
    await generateCoverLetter({ ...MOCK_JOB, generationContext: note })

    const sent = JSON.parse(capturedRequestBody) as { messages: Array<{ content: string }> }
    expect(sent.messages[0].content).toContain('Additional context from the candidate: ' + note)
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
