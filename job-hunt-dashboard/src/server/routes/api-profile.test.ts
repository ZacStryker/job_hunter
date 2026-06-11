process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

const { default: profileRoute } = await import('./api-profile')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const profileApp = (() => {
  const w = new Hono()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', profileRoute)
  return w
})()

const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    profile_data TEXT,
    UNIQUE(user_id)
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_PROFILE_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM profile')
})

describe('GET /api/profile', () => {
  test('returns EMPTY_PROFILE_DATA when no row exists', async () => {
    const res = await profileApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('')
    expect(body.personal.email).toBe('')
    expect(body.personal.phone).toBeNull()
    expect(body.personal.location).toBeNull()
    expect(body.personal.summary).toBeNull()
    expect(body.personal.websites).toEqual([])
    expect(body.experience.jobs).toEqual([])
    expect(body.experience.education).toEqual([])
    expect(body.experience.projects).toEqual([])
    expect(body.experience.certifications).toEqual([])
    expect(body.experience.licences).toEqual([])
    expect(body.experience.awards).toEqual([])
  })

  test('returns EMPTY_PROFILE_DATA when row exists but profile_data is null', async () => {
    prodSqlite.run(`INSERT INTO profile (user_id) VALUES (1)`)
    const res = await profileApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('')
    expect(body.personal.email).toBe('')
    expect(body.experience.jobs).toEqual([])
  })

  test('returns parsed ProfileData from profile_data column', async () => {
    const profileData = {
      personal: { fullName: 'Alice', email: 'alice@example.com', phone: null, location: null, summary: null, websites: [] },
      experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] },
    }
    prodSqlite.run(`INSERT INTO profile (user_id, profile_data) VALUES (1, ?)`, [JSON.stringify(profileData)])
    const res = await profileApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('Alice')
    expect(body.personal.email).toBe('alice@example.com')
    expect(body.experience.jobs).toEqual([])
  })
})

describe('PUT /api/profile', () => {
  test('creates row and returns ProfileData', async () => {
    const payload = {
      personal: { fullName: 'Alice', email: 'alice@example.com', phone: null, location: null, summary: null, websites: [] },
      experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] },
    }
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('Alice')
    expect(body.personal.email).toBe('alice@example.com')
    expect(body.experience.jobs).toEqual([])
  })

  test('upserts existing row and returns updated ProfileData', async () => {
    const initial = {
      personal: { fullName: 'Alice', email: 'alice@example.com', phone: null, location: null, summary: null, websites: [] },
      experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] },
    }
    prodSqlite.run(`INSERT INTO profile (user_id, profile_data) VALUES (1, ?)`, [JSON.stringify(initial)])
    const updated = {
      personal: { fullName: 'Bob', email: 'bob@example.com', phone: '555-9999', location: 'NYC', summary: 'Dev', websites: [] },
      experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] },
    }
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('Bob')
    expect(body.personal.email).toBe('bob@example.com')
  })

  test('returns 400 with error key when personal.email missing', async () => {
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personal: { fullName: 'x' }, experience: {} }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for invalid JSON body', async () => {
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('stores JSON in profile_data column', async () => {
    const payload = {
      personal: { fullName: 'Carol', email: 'carol@example.com', phone: null, location: null, summary: null, websites: [] },
      experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] },
    }
    await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const row = prodSqlite.query('SELECT profile_data FROM profile WHERE user_id = 1').get() as { profile_data: string }
    expect(row.profile_data).toBeDefined()
    const parsed = JSON.parse(row.profile_data)
    expect(parsed.personal.fullName).toBe('Carol')
    expect(parsed.personal.email).toBe('carol@example.com')
  })
})
