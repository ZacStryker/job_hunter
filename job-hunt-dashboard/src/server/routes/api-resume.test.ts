process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, mock, spyOn } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { Database } from 'bun:sqlite'

// Mock resume-service before any imports — prevents real Anthropic + Playwright calls
let mockGenerateResume: () => Promise<{ pdf: Buffer; inputTokens: number; outputTokens: number }> =
  async () => ({ pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })
mock.module('../services/resume-service', () => ({
  generateResume: () => mockGenerateResume(),
}))

// Mock node:fs — production code uses mkdirSync + renameSync; make them no-ops in tests.
// Tests that need real filesystem access use node:fs/promises or Bun.write directly.
mock.module('node:fs', () => ({
  mkdirSync: () => {},
  renameSync: () => {},
}))

// Mock Bun.write to avoid writing real files in tests
const mockBunWrite = spyOn(Bun, 'write').mockResolvedValue(0)

const { default: jobsRoute } = await import('./api-jobs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const jobsApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', jobsRoute)
  return w
})()

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL, job_title TEXT NOT NULL,
    fit_score INTEGER, recommendation TEXT, job_reqs_met TEXT,
    candidate_reqs_met TEXT, candidate_reqs_missed TEXT, job_reqs_missed TEXT,
    job_description TEXT, source_url TEXT, date_scraped TEXT, source TEXT,
    location TEXT, external_job_id TEXT, relevance_score REAL, analysis_status TEXT, salary TEXT,
    benefits TEXT, contact_name TEXT, contact_email TEXT, contact_phone TEXT,
    applied INTEGER NOT NULL DEFAULT 0, status TEXT, status_override TEXT,
    cover_letter_sent_at TEXT, generation_context TEXT, date_applied TEXT, applied_at TEXT, archived INTEGER NOT NULL DEFAULT 0,
    resume_generated_at TEXT, user_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(company, job_title, user_id)
  )
`
const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    profile_data TEXT,
    UNIQUE(user_id)
  )
`
const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL, status TEXT NOT NULL,
    timestamp TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual'
  )
`
const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL, message_id TEXT,
    received_at TEXT NOT NULL, from_address TEXT NOT NULL, subject TEXT NOT NULL,
    type TEXT, company TEXT, job_title TEXT,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`
const CREATE_COVER_LETTERS_TABLE = `
  CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
  )
`
const CREATE_WEBHOOK_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, run_at TEXT NOT NULL,
    success INTEGER NOT NULL, item_count INTEGER, error_message TEXT,
    duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL,
    matched_count INTEGER, archived_count INTEGER, source_breakdown TEXT,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_PROFILE_TABLE)
  prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)
  prodSqlite.run(CREATE_MESSAGES_TABLE)
  prodSqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS messages_uid_user_id_idx ON messages (uid, user_id)`)
  prodSqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS messages_message_id_user_id_idx ON messages (message_id, user_id)`)
  prodSqlite.run(CREATE_COVER_LETTERS_TABLE)
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM profile')
  prodSqlite.run('DELETE FROM webhook_runs')
  mockGenerateResume = async () => ({ pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })
  mockBunWrite.mockResolvedValue(0)
})

describe('POST /:id/generate-resume', () => {
  test('returns 200 with application/pdf when generation succeeds', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build things')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('.pdf')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(0)
  })

  test('filename includes candidate name when profile exists', async () => {
    prodSqlite.run(`INSERT INTO profile (profile_data) VALUES ('{"personal":{"fullName":"Jane Doe","email":"jane@example.com","phone":null,"location":null,"summary":null,"websites":[]},"experience":{"jobs":[],"education":[],"projects":[],"certifications":[],"licences":[],"awards":[]}}')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, job_description) VALUES ('Corp', 'PM', 'Lead product')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(200)
    const cd = res.headers.get('content-disposition') ?? ''
    expect(cd).toContain('Jane Doe')
    expect(cd).toContain('Corp')
    expect(cd).toContain('PM')
  })

  test('returns 503 when ANTHROPIC_API_KEY is not configured', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build things')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    mockGenerateResume = async () => { throw new Error('ANTHROPIC_API_KEY not configured') }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 for unknown job id', async () => {
    const res = await jobsApp.request('/999/generate-resume', { method: 'POST' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/generate-resume', { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })

  test('returns 400 when job has no job description', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Nodesc', 'Engineer')`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Nodesc') as { id: number }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })

  test('sets resumeGeneratedAt on job after successful generation', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, job_description) VALUES ('Persist Co', 'Dev', 'Do stuff')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(200)
    const updated = prodSqlite.query('SELECT resume_generated_at FROM jobs WHERE id = ?').get(row.id) as { resume_generated_at: string | null }
    expect(updated.resume_generated_at).not.toBeNull()
    expect(updated.resume_generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('GET /:id/resume', () => {
  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/resume', { method: 'GET' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 when job does not exist', async () => {
    const res = await jobsApp.request('/999/resume', { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 when resume file does not exist on disk', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('FileTest', 'Tester')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/resume`, { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Resume not found')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 with application/pdf and inline content-disposition when file exists', async () => {
    // Use node:fs/promises — bypasses both the mocked node:fs module and mocked Bun.write
    const { join } = await import('node:path')
    const { mkdir, writeFile, unlink } = await import('node:fs/promises')
    const resumesDir = join(process.cwd(), 'data', 'resumes')
    await mkdir(resumesDir, { recursive: true })

    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Inline Co', 'Viewer')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const filePath = join(resumesDir, `${row.id}.pdf`)
    await writeFile(filePath, Buffer.from('%PDF-1.4 test'))

    try {
      const res = await jobsApp.request(`/${row.id}/resume`, { method: 'GET' })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/pdf')
      const cd = res.headers.get('content-disposition') ?? ''
      expect(cd).toContain('inline')
      expect(cd).toContain('.pdf')
    } finally {
      await unlink(filePath).catch(() => {})
    }
  })
})
