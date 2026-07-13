process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, mock, spyOn } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { ResumeData } from '../../shared/schemas'
import { Database } from 'bun:sqlite'

// Mock resume-service before any imports — prevents real Anthropic + Playwright calls.
//
// generateResume now RETURNS the validated JSON as well as the PDF — that is the whole point of G3,
// and the generate route persists it as a resumes row. A stub that omits `data` writes NULL into a
// NOT NULL column and 500s.
const RESUME_DATA: ResumeData = {
  first_name: 'Jane', last_name: 'Doe',
  title_01: 'Software Engineer', title_02: 'Platform Specialist',
  email: 'jane@example.com', website: '', linkedin: '', location: 'Amsterdam',
  summary: 'Experienced engineer building distributed systems.',
  skill_groups: [], education: [], projects: [],
  experience: [{
    company: 'Acme Corp', location: 'Amsterdam', dates: '2021-2024', role: 'Senior Engineer',
    bullets: ['Built an event pipeline processing 5M events/day.'],
  }],
}
let mockGenerateResume: () => Promise<{ data: ResumeData; pdf: Buffer; inputTokens: number; outputTokens: number }> =
  async () => ({ data: RESUME_DATA, pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })
// mock.module replaces the WHOLE module, so the edit/restore routes' renderResumePdf and the
// template route's readResumeTemplate must be stubbed too or they arrive as undefined.
let mockRenderResumePdf: () => Promise<Buffer> = async () => Buffer.from('%PDF-rendered')
// Counts real render attempts. `renderResumePdf` is the Playwright entry point, so asserting this
// stays at 0 is how we prove a rejected payload never reached chromium — the bounds in
// resumeDataSchema are what stand between a pasted 10 MB summary and a 15-second hang.
let renderCalls = 0
const TEMPLATE_STUB = '<html><script id="resume-data" type="application/json">{}</script></html>'
mock.module('../services/resume-service', () => ({
  generateResume: () => mockGenerateResume(),
  renderResumePdf: () => { renderCalls++; return mockRenderResumePdf() },
  readResumeTemplate: async () => TEMPLATE_STUB,
}))

// Mock node:fs — production code uses mkdirSync + renameSync; make them no-ops in tests.
// Tests that need real filesystem access use node:fs/promises or Bun.write directly.
mock.module('node:fs', () => ({
  mkdirSync: () => {},
  renameSync: () => {},
  unlinkSync: () => {},
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
    job_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'generated'
  )
`
// Must stay IDENTICAL, column for column, to schema.ts and to the copies in api-jobs.test.ts and
// api-admin.test.ts. One bun test process shares one in-memory DB, so whichever file's
// CREATE TABLE IF NOT EXISTS runs first defines `resumes` for the WHOLE suite — a divergent copy
// breaks OTHER files, and only in the full run.
const CREATE_RESUMES_TABLE = `
  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'generated'
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
  prodSqlite.run(CREATE_RESUMES_TABLE)
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM resumes')
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM profile')
  prodSqlite.run('DELETE FROM webhook_runs')
  mockGenerateResume = async () => ({ data: RESUME_DATA, pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })
  mockRenderResumePdf = async () => Buffer.from('%PDF-rendered')
  renderCalls = 0
  mockBunWrite.mockClear()
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

// ── G3: structured editing + version history ────────────────────────────────────────────────────

function seedJob(company: string, title: string, userId = 1, resumeGeneratedAt: string | null = null): number {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, job_description, user_id, resume_generated_at) VALUES (?, ?, 'Build things', ?, ?)`,
    [company, title, userId, resumeGeneratedAt]
  )
  const row = prodSqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }
  return row.id
}

// Select the id we actually inserted, never `LIMIT 1`: one bun test process shares one in-memory DB,
// so another file may already have seeded `jobs`.
function seedResume(
  jobId: number,
  userId: number,
  data: unknown,
  source: 'generated' | 'edited' = 'generated',
  createdAt = '2026-07-01T00:00:00.000Z',
): number {
  prodSqlite.run(
    `INSERT INTO resumes (job_id, user_id, data, created_at, source) VALUES (?, ?, ?, ?, ?)`,
    [jobId, userId, JSON.stringify(data), createdAt, source]
  )
  const row = prodSqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }
  return row.id
}

function resumeRows(jobId: number): Array<{ id: number; source: string; data: string }> {
  return prodSqlite.query('SELECT id, source, data FROM resumes WHERE job_id = ? ORDER BY id').all(jobId) as Array<{ id: number; source: string; data: string }>
}

function editedData(overrides: Record<string, unknown> = {}) {
  return { ...RESUME_DATA, ...overrides }
}

describe('POST /:id/generate-resume — persistence (G3)', () => {
  test('leaves a resumes row behind, tagged generated', async () => {
    const id = seedJob('Persist Co', 'Engineer')
    const res = await jobsApp.request(`/${id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(200)

    const rows = resumeRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('generated')
    expect(JSON.parse(rows[0].data).first_name).toBe('Jane')
  })

  test('resumeGeneratedAt actually moves on generate', async () => {
    const id = seedJob('Stamp Co', 'Engineer')
    const before = prodSqlite.query('SELECT resume_generated_at AS t FROM jobs WHERE id = ?').get(id) as { t: string | null }
    expect(before.t).toBeNull()

    await jobsApp.request(`/${id}/generate-resume`, { method: 'POST' })

    const after = prodSqlite.query('SELECT resume_generated_at AS t FROM jobs WHERE id = ?').get(id) as { t: string | null }
    expect(after.t).not.toBeNull()
  })

  // Regenerate used to be a one-way door: reroll a good resume and it was gone. It now APPENDS.
  test('a second Regenerate leaves the first version still present and still restorable', async () => {
    const id = seedJob('Reroll Co', 'Engineer')

    await jobsApp.request(`/${id}/generate-resume`, { method: 'POST' })
    const first = resumeRows(id)
    expect(first).toHaveLength(1)
    const firstId = first[0].id

    mockGenerateResume = async () => ({
      data: editedData({ summary: 'A totally different reroll.' }),
      pdf: Buffer.from('%PDF-mock2'), inputTokens: 1, outputTokens: 2,
    })
    await jobsApp.request(`/${id}/generate-resume`, { method: 'POST' })

    const after = resumeRows(id)
    expect(after).toHaveLength(2)
    // The pre-regeneration version is untouched and still in the list...
    expect(after.map(r => r.id)).toContain(firstId)
    expect(JSON.parse(after[0].data).summary).toBe(RESUME_DATA.summary)

    // ...and still restorable.
    const restore = await jobsApp.request(`/${id}/resume/versions/${firstId}/restore`, { method: 'POST' })
    expect(restore.status).toBe(200)
    expect(resumeRows(id)).toHaveLength(3)
  })
})

describe('GET /:id/resume-data', () => {
  test('returns the most recent version', async () => {
    const id = seedJob('Read Co', 'Engineer')
    seedResume(id, 1, editedData({ summary: 'older' }), 'generated', '2026-07-01T00:00:00.000Z')
    seedResume(id, 1, editedData({ summary: 'newest' }), 'edited', '2026-07-02T00:00:00.000Z')

    const res = await jobsApp.request(`/${id}/resume-data`, { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { resume: { source: string; data: { summary: string } } }
    expect(body.resume.data.summary).toBe('newest')
    expect(body.resume.source).toBe('edited')
  })

  test('404 when the job has no resume row', async () => {
    const id = seedJob('Empty Co', 'Engineer')
    const res = await jobsApp.request(`/${id}/resume-data`, { method: 'GET' })
    expect(res.status).toBe(404)
  })
})

describe('PUT /:id/resume', () => {
  test('INSERTs a new version rather than mutating, and the prior version stays restorable', async () => {
    const id = seedJob('Edit Co', 'Engineer')
    const v1 = seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editedData({ summary: 'Edited by the user.' }) }),
    })
    expect(res.status).toBe(200)

    const rows = resumeRows(id)
    expect(rows).toHaveLength(2)
    // The original row is byte-for-byte untouched — append-only means nothing is destroyed.
    const original = rows.find(r => r.id === v1)!
    expect(JSON.parse(original.data).summary).toBe(RESUME_DATA.summary)
    expect(original.source).toBe('generated')

    const created = rows.find(r => r.id !== v1)!
    expect(created.source).toBe('edited')
    expect(JSON.parse(created.data).summary).toBe('Edited by the user.')

    const restore = await jobsApp.request(`/${id}/resume/versions/${v1}/restore`, { method: 'POST' })
    expect(restore.status).toBe(200)
  })

  test('bumps resumeGeneratedAt — the cache-buster must move or the user is served the stale PDF', async () => {
    const id = seedJob('Bump Co', 'Engineer', 1, '2026-01-01T00:00:00.000Z')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editedData({ summary: 'Moved.' }) }),
    })
    expect(res.status).toBe(200)

    const after = prodSqlite.query('SELECT resume_generated_at AS t FROM jobs WHERE id = ?').get(id) as { t: string }
    expect(after.t).not.toBe('2026-01-01T00:00:00.000Z')
  })

  // PUT EDITS; it does not create. Otherwise it would mint a first resume tagged 'edited' that was
  // never generated.
  test('404 on a never-generated job', async () => {
    const id = seedJob('Nothing Co', 'Engineer')
    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: RESUME_DATA }),
    })
    expect(res.status).toBe(404)
    expect(resumeRows(id)).toHaveLength(0)
  })

  test('400 when title_02 contains "and" — a template rendering rule binds the user too', async () => {
    const id = seedJob('Title Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editedData({ title_02: 'Design and Research' }) }),
    })
    expect(res.status).toBe(400)
    expect(resumeRows(id)).toHaveLength(1)
    expect(renderCalls).toBe(0)
  })

  test('400 on a blank first_name — a blank resume is not a resume', async () => {
    const id = seedJob('Blank Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editedData({ first_name: '   ' }) }),
    })
    expect(res.status).toBe(400)
    expect(resumeRows(id)).toHaveLength(1)
  })

  test('400 on a blank bullet — .min(1) bounds array LENGTH, not the content of its strings', async () => {
    const id = seedJob('Blank Bullet Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: editedData({ experience: [{ ...RESUME_DATA.experience[0], bullets: ['  '] }] }),
      }),
    })
    expect(res.status).toBe(400)
    expect(resumeRows(id)).toHaveLength(1)
  })

  // The bounds exist to stop Save being a self-inflicted DoS. Rejecting is not enough — it must
  // reject BEFORE chromium launches.
  test('400 on an oversized summary, without ever launching Playwright', async () => {
    const id = seedJob('Huge Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editedData({ summary: 'x'.repeat(2_000_000) }) }),
    })
    expect(res.status).toBe(400)
    expect(renderCalls).toBe(0)
    expect(mockBunWrite).not.toHaveBeenCalled()
    expect(resumeRows(id)).toHaveLength(1)
  })

  test('400 on 5,000 experience entries, without ever launching Playwright', async () => {
    const id = seedJob('Many Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: editedData({ experience: Array.from({ length: 5000 }, () => RESUME_DATA.experience[0]) }),
      }),
    })
    expect(res.status).toBe(400)
    expect(renderCalls).toBe(0)
  })

  // Enforced at the ROUTE, not merely disabled in the form. The form is not the security boundary.
  test('400 on an emptied experience array', async () => {
    const id = seedJob('NoExp Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editedData({ experience: [] }) }),
    })
    expect(res.status).toBe(400)
    expect(resumeRows(id)).toHaveLength(1)
  })

  test('400 on an experience entry with zero bullets', async () => {
    const id = seedJob('NoBullets Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA)

    const res = await jobsApp.request(`/${id}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: editedData({ experience: [{ ...RESUME_DATA.experience[0], bullets: [] }] }),
      }),
    })
    expect(res.status).toBe(400)
    expect(resumeRows(id)).toHaveLength(1)
  })
})

describe('GET /:id/resume/versions', () => {
  test('returns [] — not a 404 — when the job has never been generated', async () => {
    const id = seedJob('NoVersions Co', 'Engineer')
    const res = await jobsApp.request(`/${id}/resume/versions`, { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as { versions: unknown[] }
    expect(body.versions).toEqual([])
  })

  test('newest first', async () => {
    const id = seedJob('Ordered Co', 'Engineer')
    seedResume(id, 1, RESUME_DATA, 'generated', '2026-07-01T00:00:00.000Z')
    seedResume(id, 1, RESUME_DATA, 'edited', '2026-07-05T00:00:00.000Z')

    const res = await jobsApp.request(`/${id}/resume/versions`, { method: 'GET' })
    const body = await res.json() as { versions: Array<{ source: string; createdAt: string }> }
    expect(body.versions).toHaveLength(2)
    expect(body.versions[0].createdAt).toBe('2026-07-05T00:00:00.000Z')
    expect(body.versions[0].source).toBe('edited')
  })
})

describe('POST /:id/resume/versions/:versionId/restore', () => {
  test('copies the version forward into a NEW row and deletes nothing', async () => {
    const id = seedJob('Restore Co', 'Engineer')
    const v1 = seedResume(id, 1, editedData({ summary: 'the original' }), 'generated', '2026-07-01T00:00:00.000Z')
    seedResume(id, 1, editedData({ summary: 'the edit' }), 'edited', '2026-07-02T00:00:00.000Z')

    const res = await jobsApp.request(`/${id}/resume/versions/${v1}/restore`, { method: 'POST' })
    expect(res.status).toBe(200)

    const rows = resumeRows(id)
    expect(rows).toHaveLength(3)
    // Nothing deleted — v1 and the edit are both still there.
    expect(rows.map(r => r.id)).toContain(v1)
    // And the newest row carries v1's data.
    const newest = rows[rows.length - 1]
    expect(JSON.parse(newest.data).summary).toBe('the original')
  })

  test('404 for a versionId belonging to a DIFFERENT job of the same user', async () => {
    const jobA = seedJob('A Co', 'Engineer')
    const jobB = seedJob('B Co', 'Engineer')
    const vB = seedResume(jobB, 1, RESUME_DATA)
    seedResume(jobA, 1, RESUME_DATA)

    // Scoped on BOTH userId and jobId — userId alone would leak one job's history into another's.
    const res = await jobsApp.request(`/${jobA}/resume/versions/${vB}/restore`, { method: 'POST' })
    expect(res.status).toBe(404)
    expect(resumeRows(jobA)).toHaveLength(1)
    expect(resumeRows(jobB)).toHaveLength(1)
  })

  // Stored rows were validated against resumeDataSchema AS IT EXISTED WHEN WRITTEN, and this change
  // tightened it. Rendering a non-conforming row would produce a garbled PDF.
  test('422 for a stored version that no longer validates', async () => {
    const id = seedJob('Legacy Co', 'Engineer')
    const stale = seedResume(id, 1, { ...RESUME_DATA, first_name: '' })

    const res = await jobsApp.request(`/${id}/resume/versions/${stale}/restore`, { method: 'POST' })
    expect(res.status).toBe(422)
    expect(renderCalls).toBe(0)
    expect(resumeRows(id)).toHaveLength(1)
  })
})

// Proven, not assumed: seed as user 2, act as user 1 (jobsApp is always userId 1), and assert BOTH
// the 404 and that user 2's rows and PDF are untouched.
describe('resume routes — tenant isolation', () => {
  test("user 1 cannot read, edit, list or restore user 2's resume", async () => {
    const foreignJob = seedJob('Foreign Co', 'Engineer', 2, '2026-01-01T00:00:00.000Z')
    const foreignVersion = seedResume(foreignJob, 2, editedData({ summary: "user 2's resume" }))

    const readRes = await jobsApp.request(`/${foreignJob}/resume-data`, { method: 'GET' })
    expect(readRes.status).toBe(404)

    const putRes = await jobsApp.request(`/${foreignJob}/resume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editedData({ summary: 'overwritten by user 1' }) }),
    })
    expect(putRes.status).toBe(404)

    const versionsRes = await jobsApp.request(`/${foreignJob}/resume/versions`, { method: 'GET' })
    expect(versionsRes.status).toBe(404)

    const restoreRes = await jobsApp.request(`/${foreignJob}/resume/versions/${foreignVersion}/restore`, { method: 'POST' })
    expect(restoreRes.status).toBe(404)

    // User 2's rows are unchanged...
    const rows = resumeRows(foreignJob)
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].data).summary).toBe("user 2's resume")

    // ...their cache-buster never moved...
    const job = prodSqlite.query('SELECT resume_generated_at AS t FROM jobs WHERE id = ?').get(foreignJob) as { t: string }
    expect(job.t).toBe('2026-01-01T00:00:00.000Z')

    // ...and their PDF was never rewritten.
    expect(renderCalls).toBe(0)
    expect(mockBunWrite).not.toHaveBeenCalled()
  })

  test("user 1 cannot restore a version row owned by user 2 even by guessing its id", async () => {
    const ownJob = seedJob('Own Co', 'Engineer')
    seedResume(ownJob, 1, RESUME_DATA)
    const foreignJob = seedJob('Their Co', 'Engineer', 2)
    const foreignVersion = seedResume(foreignJob, 2, RESUME_DATA)

    // Their version id, aimed at the caller's OWN job: must still 404 (scoped on userId AND jobId).
    const res = await jobsApp.request(`/${ownJob}/resume/versions/${foreignVersion}/restore`, { method: 'POST' })
    expect(res.status).toBe(404)
    expect(resumeRows(ownJob)).toHaveLength(1)
    expect(resumeRows(foreignJob)).toHaveLength(1)
  })
})
