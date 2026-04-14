process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { default: webhookRunsApp, recordRun } = await import('./api-webhook-runs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_WEBHOOK_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    run_at TEXT NOT NULL,
    success INTEGER NOT NULL,
    item_count INTEGER,
    error_message TEXT
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM webhook_runs')
})

describe('recordRun utility', () => {
  test('inserts a successful run with item count', () => {
    recordRun({ name: 'Discovery', success: true, itemCount: 5 })
    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      name: string; success: number; item_count: number | null; error_message: string | null
    }
    expect(row).toBeDefined()
    expect(row.name).toBe('Discovery')
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(5)
    expect(row.error_message).toBeNull()
  })

  test('inserts a failed run with error message', () => {
    recordRun({ name: 'Analysis', success: false, itemCount: null, errorMessage: 'HTTP 500' })
    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      name: string; success: number; item_count: number | null; error_message: string | null
    }
    expect(row).toBeDefined()
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()
    expect(row.error_message).toBe('HTTP 500')
  })

  test('defaults itemCount and errorMessage to null when omitted', () => {
    recordRun({ name: 'Test', success: true })
    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Test') as {
      item_count: number | null; error_message: string | null
    }
    expect(row.item_count).toBeNull()
    expect(row.error_message).toBeNull()
  })
})

describe('GET /api/webhook-runs', () => {
  test('returns 200 with empty runs array when no runs exist', async () => {
    const res = await webhookRunsApp.request('/')
    expect(res.status).toBe(200)
    const body = await res.json() as { runs: unknown[] }
    expect(body).toHaveProperty('runs')
    expect(body.runs).toEqual([])
  })

  test('returns runs ordered by runAt descending', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('First', '2026-04-10T10:00:00.000Z', 1)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Second', '2026-04-10T11:00:00.000Z', 1)`)

    const res = await webhookRunsApp.request('/')
    expect(res.status).toBe(200)
    const body = await res.json() as { runs: Array<{ name: string }> }
    expect(body.runs).toHaveLength(2)
    expect(body.runs[0].name).toBe('Second')
    expect(body.runs[1].name).toBe('First')
  })

  test('returns correct shape for each run', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, item_count) VALUES ('Discovery', '2026-04-10T10:00:00.000Z', 1, 3)`)

    const res = await webhookRunsApp.request('/')
    expect(res.status).toBe(200)
    const body = await res.json() as { runs: Array<Record<string, unknown>> }
    const run = body.runs[0]
    expect(run).toHaveProperty('id')
    expect(run).toHaveProperty('name', 'Discovery')
    expect(run).toHaveProperty('runAt')
    expect(run).toHaveProperty('success', true)
    expect(run).toHaveProperty('itemCount', 3)
    expect(run).toHaveProperty('errorMessage', null)
    expect(run).not.toHaveProperty('message')
  })
})
