process.env.DB_PATH = ':memory:'

import { describe, test, expect, mock, beforeEach, afterEach, beforeAll } from 'bun:test'
import { Database } from 'bun:sqlite'

// --- mailparser mock setup ---
const mockSimpleParser = mock(async (_source: Buffer) => ({
  subject: '' as string | undefined,
  date: undefined as Date | undefined,
  text: '' as string | undefined,
}))

mock.module('mailparser', () => ({
  simpleParser: mockSimpleParser,
}))

// --- imapflow mock setup ---
const mockConnect = mock(async () => {})
const mockLogout = mock(async () => {})
const mockLockRelease = mock(() => {})
const mockGetMailboxLock = mock(async () => ({ release: mockLockRelease }))

// Mutable arrays — tests push messages before calling pollOnce
const mockUids: number[] = []
const mockMessages: Array<{ source: Buffer }> = []

const mockSearch = mock(async () => [...mockUids])
const mockFetch = mock(async function* () {
  for (const msg of mockMessages) yield msg
})

mock.module('imapflow', () => ({
  ImapFlow: mock(function () {
    return {
      connect: mockConnect,
      logout: mockLogout,
      getMailboxLock: mockGetMailboxLock,
      search: mockSearch,
      fetch: mockFetch,
    }
  }),
}))

// --- dynamic import after mock setup ---
const { pollOnce, startImapPoller, normalizeText, detectStatus, findMatchingJob } =
  await import('./imap-poller')
const { db } = await import('../../db/client')
const prodSqlite = (db as unknown as { $client: Database }).$client

// --- DB setup ---
const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    fit_score INTEGER,
    recommendation TEXT,
    role_fit TEXT,
    requirements_met TEXT,
    requirements_missed TEXT,
    red_flags TEXT,
    job_description TEXT,
    source_url TEXT,
    date_scraped TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_override TEXT,
    cover_letter_sent_at TEXT,
    date_applied TEXT,
    UNIQUE(company, job_title)
  )
`
const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM status_events')
  prodSqlite.run('DELETE FROM jobs')
  mockConnect.mockReset()
  mockLogout.mockReset()
  mockGetMailboxLock.mockReset()
  mockGetMailboxLock.mockImplementation(async () => ({ release: mockLockRelease }))
  mockSearch.mockReset()
  mockSearch.mockImplementation(async () => [...mockUids])
  mockFetch.mockReset()
  mockFetch.mockImplementation(async function* () {
    for (const msg of mockMessages) yield msg
  })
  mockSimpleParser.mockReset()
  mockSimpleParser.mockImplementation(async () => ({ subject: '', date: undefined, text: '' }))
  mockUids.length = 0
  mockMessages.length = 0
})

// --- Unit tests for pure functions ---
describe('normalizeText', () => {
  test('lowercases and removes punctuation', () => {
    expect(normalizeText('Senior Engineer!')).toBe('senior engineer')
  })
  test('expands abbreviations', () => {
    expect(normalizeText('Sr Eng')).toBe('senior engineer')
  })
  test('collapses multiple spaces', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world')
  })
})

describe('detectStatus', () => {
  test('returns Interview for interview keyword', () => {
    expect(detectStatus('We would like to invite you for an interview')).toBe('Interview')
  })
  test('returns Rejected for rejection keywords', () => {
    expect(detectStatus('Unfortunately we have decided not to move forward')).toBe('Rejected')
  })
  test('returns Offer for offer keyword', () => {
    expect(detectStatus('Congratulations, we are pleased to offer you')).toBe('Offer')
  })
  test('returns null for non-job email', () => {
    expect(detectStatus('Your package has been shipped')).toBeNull()
  })
  test('returns Applied for thank-you-for-applying keywords', () => {
    expect(detectStatus('Thank you for applying to Acme Corp')).toBe('Applied')
  })
  test('returns Applied for application received keywords', () => {
    expect(detectStatus('We have received your application')).toBe('Applied')
  })
})

describe('findMatchingJob', () => {
  const job = { id: 1, jobTitle: 'Senior Engineer', dateApplied: '2026-04-01' }

  test('matches when title tokens found in email and date within ±3 days', () => {
    const date = new Date('2026-04-02T10:00:00Z')
    const result = findMatchingJob('We want to interview a senior engineer at Acme', date, [job])
    expect(result?.id).toBe(1)
  })

  test('no match when date is outside ±3 days', () => {
    const date = new Date('2026-04-10T10:00:00Z')
    const result = findMatchingJob('Interview for senior engineer role', date, [job])
    expect(result).toBeNull()
  })

  test('no match when title tokens do not appear in email', () => {
    const date = new Date('2026-04-02T10:00:00Z')
    const result = findMatchingJob('Thank you for applying to Acme Corp', date, [job])
    expect(result).toBeNull()
  })
})

// --- Integration tests for pollOnce ---
describe('pollOnce (integration)', () => {
  const credentials = { host: 'imap.example.com', user: 'u', pass: 'p' }

  test('returns early without connecting when no applied jobs with dateApplied', async () => {
    await pollOnce(credentials)
    expect(mockConnect).not.toHaveBeenCalled()
  })

  test('updates job status and inserts status_events row on confident match', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Acme', 'Senior Engineer', 1, '2026-04-01')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }

    mockUids.push(1)
    mockMessages.push({ source: Buffer.alloc(0) })
    mockSimpleParser.mockImplementation(async () => ({
      subject: 'Interview invitation for Senior Engineer',
      date: new Date('2026-04-02T10:00:00Z'),
      text: 'We would like to schedule an interview',
    }))

    await pollOnce(credentials)

    const job = prodSqlite.query('SELECT status FROM jobs WHERE id = ?').get(row.id) as { status: string }
    expect(job.status).toBe('Interview')

    const event = prodSqlite.query('SELECT * FROM status_events WHERE job_id = ?').get(row.id) as {
      status: string
      source: string
      timestamp: string
    }
    expect(event).not.toBeNull()
    expect(event.status).toBe('Interview')
    expect(event.source).toBe('email')
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('makes no DB writes when message has no status keywords', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Beta', 'Developer', 1, '2026-04-01')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Beta') as { id: number }

    mockUids.push(1)
    mockMessages.push({ source: Buffer.alloc(0) })
    mockSimpleParser.mockImplementation(async () => ({
      subject: 'Thank you for applying',
      date: new Date('2026-04-02T10:00:00Z'),
      text: 'We received your application',
    }))

    await pollOnce(credentials)

    const count = prodSqlite
      .query('SELECT COUNT(*) as n FROM status_events WHERE job_id = ?')
      .get(row.id) as { n: number }
    expect(count.n).toBe(0)
  })

  test('sets status to Applied on thank-you email match', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('TY Corp', 'Engineer', 1, '2026-04-05')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('TY Corp') as { id: number }

    mockUids.push(1)
    mockMessages.push({ source: Buffer.alloc(0) })
    mockSimpleParser.mockImplementation(async () => ({
      subject: 'Thank you for applying to TY Corp',
      date: new Date('2026-04-05T14:00:00Z'),
      text: 'We have received your application for the Engineer position.',
    }))

    await pollOnce(credentials)

    const job = prodSqlite.query('SELECT status FROM jobs WHERE id = ?').get(row.id) as { status: string }
    expect(job.status).toBe('Applied')

    const event = prodSqlite.query('SELECT status, source FROM status_events WHERE job_id = ?').get(row.id) as {
      status: string; source: string
    }
    expect(event.status).toBe('Applied')
    expect(event.source).toBe('email')
  })

  test('skips DB write when job already has the detected status', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, applied, date_applied, status) VALUES ('Dupe', 'Engineer', 1, '2026-04-01', 'Interview')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Dupe') as { id: number }

    mockUids.push(1)
    mockMessages.push({ source: Buffer.alloc(0) })
    mockSimpleParser.mockImplementation(async () => ({
      subject: 'Interview invitation for Engineer',
      date: new Date('2026-04-02T10:00:00Z'),
      text: 'We would like to interview you',
    }))

    await pollOnce(credentials)

    const count = prodSqlite
      .query('SELECT COUNT(*) as n FROM status_events WHERE job_id = ?')
      .get(row.id) as { n: number }
    expect(count.n).toBe(0)
  })
})

describe('startImapPoller', () => {
  const origEnv = { ...process.env }

  afterEach(() => {
    Object.assign(process.env, origEnv)
    if (!origEnv.IMAP_HOST) delete process.env.IMAP_HOST
    if (!origEnv.IMAP_USER) delete process.env.IMAP_USER
    if (!origEnv.IMAP_PASS) delete process.env.IMAP_PASS
  })

  test('warns and does not throw when credentials missing', () => {
    const warns: unknown[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => warns.push(args)

    delete process.env.IMAP_HOST
    delete process.env.IMAP_USER
    delete process.env.IMAP_PASS

    try {
      expect(() => startImapPoller()).not.toThrow()
    } finally {
      console.warn = origWarn
    }

    expect(warns.length).toBeGreaterThan(0)
    expect(String(warns[0])).toContain('email polling disabled')
  })

  test('warns when only some credentials are missing', () => {
    const warns: unknown[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => warns.push(args)

    process.env.IMAP_HOST = 'imap.example.com'
    delete process.env.IMAP_USER
    delete process.env.IMAP_PASS

    try {
      startImapPoller()
    } finally {
      console.warn = origWarn
    }

    expect(warns.length).toBeGreaterThan(0)
  })

  test('registers polling interval when all credentials are present', () => {
    process.env.IMAP_HOST = 'imap.example.com'
    process.env.IMAP_USER = 'user@example.com'
    process.env.IMAP_PASS = 'secret'

    let intervalRegistered = false
    const registeredIds: ReturnType<typeof setInterval>[] = []
    const origSetInterval = globalThis.setInterval
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).setInterval = (fn: () => void, ms: number) => {
      intervalRegistered = true
      const id = origSetInterval(fn, ms)
      registeredIds.push(id)
      return id
    }

    try {
      startImapPoller()
    } finally {
      globalThis.setInterval = origSetInterval
      registeredIds.forEach((id) => clearInterval(id))
    }

    expect(intervalRegistered).toBe(true)
  })
})
