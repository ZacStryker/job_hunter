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
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    summary TEXT,
    experience TEXT,
    skills TEXT,
    education TEXT,
    UNIQUE(user_id)
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_PROFILE_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM profile')
})

describe('getProfile (business logic)', () => {
  test('returns null-filled profile when DB is empty', () => {
    const { db } = require('../../db/client')
    const { profile } = require('../../db/schema')
    const rows = db.select().from(profile).limit(1).all()
    expect(rows).toHaveLength(0)
  })

  test('returns stored profile after upsert', () => {
    prodSqlite.run(
      `INSERT INTO profile (user_id, name, email) VALUES (1, 'Alice', 'alice@example.com')`
    )
    const { db } = require('../../db/client')
    const { profile } = require('../../db/schema')
    const rows = db.select().from(profile).limit(1).all()
    expect(rows[0].name).toBe('Alice')
    expect(rows[0].email).toBe('alice@example.com')
  })

  test('second upsert updates row via PUT handler', async () => {
    prodSqlite.run(`INSERT INTO profile (user_id, name) VALUES (1, 'Alice')`)
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: null, phone: null, location: null, linkedinUrl: null, githubUrl: null, summary: null, experience: null, skills: null, education: null }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Bob')
    const { db } = require('../../db/client')
    const { profile } = require('../../db/schema')
    const rows = db.select().from(profile).limit(1).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Bob')
  })
})

describe('GET /api/profile (HTTP contract)', () => {
  test('returns 200 with null-filled profile when DB is empty', async () => {
    const res = await profileApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBeNull()
    expect(body.name).toBeNull()
    expect(body.email).toBeNull()
    expect(body.phone).toBeNull()
    expect(body.location).toBeNull()
    expect(body.linkedinUrl).toBeNull()
    expect(body.githubUrl).toBeNull()
    expect(body.summary).toBeNull()
    expect(body.experience).toBeNull()
    expect(body.skills).toBeNull()
    expect(body.education).toBeNull()
  })

  test('returns 200 with stored profile data', async () => {
    prodSqlite.run(
      `INSERT INTO profile (user_id, name, email, phone) VALUES (1, 'Alice', 'alice@example.com', '555-1234')`
    )
    const res = await profileApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Alice')
    expect(body.email).toBe('alice@example.com')
    expect(body.phone).toBe('555-1234')
  })
})

describe('PUT /api/profile (HTTP contract)', () => {
  test('creates profile row when none exists and returns 200 with updated profile', async () => {
    const payload = {
      name: 'Alice',
      email: 'alice@example.com',
      phone: '555-1234',
      location: 'Remote',
      linkedinUrl: 'https://linkedin.com/in/alice',
      githubUrl: 'https://github.com/alice',
      summary: 'A great engineer.',
      experience: '5 years at Acme.',
      skills: 'TypeScript, React',
      education: 'BS Computer Science',
    }
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Alice')
    expect(body.email).toBe('alice@example.com')
    expect(body.linkedinUrl).toBe('https://linkedin.com/in/alice')
  })

  test('second PUT updates existing row', async () => {
    prodSqlite.run(`INSERT INTO profile (user_id, name) VALUES (1, 'Alice')`)
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: null, phone: null, location: null, linkedinUrl: null, githubUrl: null, summary: null, experience: null, skills: null, education: null }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Bob')
    expect(body.id).toBeDefined()
  })

  test('returns 400 with error key for invalid payload', async () => {
    const res = await profileApp.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123 }),
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
  })
})
