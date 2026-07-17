import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { jobInputSchema } from '../../../shared/schemas'
import { jsearchProvider, normalize } from './jsearch-provider'
import { JobSearchNotConfiguredError } from './provider'

const SAMPLE_JOB = {
  job_id: 'abc123',
  job_title: 'Senior React Developer',
  employer_name: 'Acme BV',
  job_description: 'Build things.',
  job_apply_link: 'https://apply.example.com/abc123',
  job_city: 'Amsterdam',
  job_state: null,
  job_country: 'NL',
  job_min_salary: 70000,
  job_max_salary: 90000,
  job_salary_period: 'YEAR',
}

let originalFetch: typeof globalThis.fetch
const originalKey = process.env.JSEARCH_API_KEY

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = mock((url: string, reqInit?: RequestInit) => {
    calls.push({ url, init: reqInit })
    return Promise.resolve({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: () => Promise.resolve(body),
    } as Response)
  }) as unknown as typeof globalThis.fetch
  return calls
}

beforeEach(() => {
  originalFetch = globalThis.fetch
  process.env.JSEARCH_API_KEY = 'test-key'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.JSEARCH_API_KEY
  else process.env.JSEARCH_API_KEY = originalKey
})

describe('normalize', () => {
  test('maps a JSearch item into a valid jobInputSchema record', () => {
    const job = normalize(SAMPLE_JOB)
    expect(jobInputSchema.safeParse(job).success).toBe(true)
    expect(job.company).toBe('Acme BV')
    expect(job.jobTitle).toBe('Senior React Developer')
    expect(job.sourceUrl).toBe('https://apply.example.com/abc123')
    expect(job.externalJobId).toBe('abc123')
    expect(job.source).toBe('jsearch')
    expect(job.analysisStatus).toBe('pending')
    expect(job.fitScore).toBeNull()
    expect(job.recommendation).toBeNull()
  })

  test('joins only the present location parts', () => {
    expect(normalize(SAMPLE_JOB).location).toBe('Amsterdam, NL')
    expect(normalize({ job_city: null, job_state: null, job_country: null }).location).toBeNull()
  })

  test('formats a salary range, and returns null when both bounds are absent', () => {
    expect(normalize(SAMPLE_JOB).salary).toBe('70000–90000 / year')
    expect(normalize({ job_min_salary: null, job_max_salary: null }).salary).toBeNull()
  })
})

describe('jsearchProvider.search', () => {
  test('sends key + host headers and returns normalized results', async () => {
    const calls = mockFetch({ status: 'OK', data: [SAMPLE_JOB] })
    const results = await jsearchProvider.search({ query: 'react developer', location: 'Amsterdam' })

    expect(results).toHaveLength(1)
    expect(jobInputSchema.safeParse(results[0]).success).toBe(true)

    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers['X-RapidAPI-Key']).toBe('test-key')
    expect(headers['X-RapidAPI-Host']).toBe('jsearch.p.rapidapi.com')
    expect(calls[0].url).toContain('jsearch.p.rapidapi.com/search')
    // location is folded into the query when set (URLSearchParams encodes spaces as +)
    expect(calls[0].url).toContain('query=react+developer+in+Amsterdam')
  })

  test('throws JobSearchNotConfiguredError and makes no request when the key is unset', async () => {
    delete process.env.JSEARCH_API_KEY
    const calls = mockFetch({ status: 'OK', data: [] })
    await expect(jsearchProvider.search({ query: 'x' })).rejects.toBeInstanceOf(
      JobSearchNotConfiguredError,
    )
    expect(calls).toHaveLength(0)
  })

  test('throws with the status on a non-2xx response', async () => {
    mockFetch({ message: 'rate limited' }, { ok: false, status: 429 })
    await expect(jsearchProvider.search({ query: 'x' })).rejects.toThrow('429')
  })

  test('returns an empty array when the feed has no data', async () => {
    mockFetch({ status: 'OK', data: [] })
    expect(await jsearchProvider.search({ query: 'x' })).toEqual([])
    mockFetch({ status: 'OK' }) // data field absent entirely
    expect(await jsearchProvider.search({ query: 'x' })).toEqual([])
  })
})
