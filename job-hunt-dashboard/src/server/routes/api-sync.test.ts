// Set DB_PATH before any production modules are dynamically loaded (mirrors api-ingest.test.ts pattern)
process.env.DB_PATH = ':memory:'

import { mock, test, expect, describe, afterEach } from 'bun:test'
import { Hono } from 'hono'
import type { JobInput } from '../../shared/schemas'

// Import real ingestJobs BEFORE mocking so the default mock delegates to the real
// implementation — prevents mock.module() from bleeding into api-ingest.ts tests
const { ingestJobs: realIngestJobs } = await import('../services/ingest-service')

// Mutable mock functions — reassign per test for different behaviors
let mockFetchJobs: () => Promise<JobInput[]> = () => Promise.resolve([])
let mockIngestJobs: (rows: JobInput[]) => { added: number; updated: number } = realIngestJobs

mock.module('../services/sheets-sync', () => ({
  fetchJobsFromSheets: () => mockFetchJobs(),
}))
mock.module('../services/ingest-service', () => ({
  ingestJobs: (rows: JobInput[]) => mockIngestJobs(rows),
}))

// Import AFTER mock.module() calls
const { default: syncRoute } = await import('./api-sync')
const { errorHandler } = await import('../middleware/error-handler')

// Test app with error handler — matches production setup
const testApp = new Hono()
testApp.route('/', syncRoute)
testApp.onError(errorHandler)

describe('POST /api/sync', () => {
  afterEach(() => {
    // Reset to real implementations after each test to prevent state from bleeding
    // into other test files (api-ingest.test.ts) that use the real ingest logic
    mockFetchJobs = () => Promise.resolve([])
    mockIngestJobs = realIngestJobs
  })

  test('returns 200 with sync result on success', async () => {
    mockFetchJobs = () => Promise.resolve([
      {
        company: 'Acme',
        jobTitle: 'Engineer',
        fitScore: 85,
        recommendation: 'apply',
        roleFit: null,
        requirementsMet: null,
        requirementsMissed: null,
        redFlags: null,
        jobDescription: null,
        sourceUrl: null,
        dateScraped: null,
      },
      {
        company: 'Beta',
        jobTitle: 'Designer',
        fitScore: 70,
        recommendation: 'investigate',
        roleFit: null,
        requirementsMet: null,
        requirementsMissed: null,
        redFlags: null,
        jobDescription: null,
        sourceUrl: null,
        dateScraped: null,
      },
    ])
    mockIngestJobs = () => ({ added: 2, updated: 1 })

    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json() as { added: number; updated: number }
    expect(data).toEqual({ added: 2, updated: 1 })
  })

  test('propagates OAuth error as 500 { error: string }', async () => {
    mockFetchJobs = () => Promise.reject(new Error('OAuth token expired or invalid'))

    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(500)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
    expect(data.error).toBe('OAuth token expired or invalid')
  })

  test('returns { added: 0, updated: 0 } for empty spreadsheet', async () => {
    mockFetchJobs = () => Promise.resolve([])
    mockIngestJobs = () => ({ added: 0, updated: 0 })

    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ added: 0, updated: 0 })
  })

  test('propagates DB write error as 500 { error: string }', async () => {
    mockFetchJobs = () => Promise.resolve([])
    mockIngestJobs = () => { throw new Error('SQLITE_BUSY: database is locked') }

    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(500)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
    expect(data.error).toBe('SQLITE_BUSY: database is locked')
  })
})
