process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, test, expect, spyOn, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../types'

const { default: activityRoute, KEEPALIVE_MS } = await import('./api-activity')
const { activityRegistry } = await import('../services/activity-registry')
const { setupHealth } = await import('../services/setup-health')
const { activityRunSchema, setupStatusSchema } = await import('../../shared/schemas')
const { db: prodDb } = await import('../../db/client')
const sqlite = (prodDb as unknown as { $client: Database }).$client

const DDL = [
  `CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL, key_name TEXT NOT NULL, ciphertext TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name))`,
  `CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1, profile_data TEXT, UNIQUE(user_id))`,
  `CREATE TABLE IF NOT EXISTS inbox_folder_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, folder_path TEXT NOT NULL, job_status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS gmail_label_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, label TEXT NOT NULL, job_status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS setup_dismissals (
    user_id INTEGER NOT NULL, task_id TEXT NOT NULL, dismissed_at TEXT NOT NULL, PRIMARY KEY (user_id, task_id))`,
]

beforeAll(() => {
  for (const stmt of DDL) sqlite.run(stmt)
})

beforeEach(() => {
  // Clear everything the per-user health auto-check reads on stream open, so a
  // prior test file's leftover rows in the shared :memory: DB can't trigger a
  // stray setup-status emit that races our explicit markBroken below.
  sqlite.run('DELETE FROM user_secrets')
  sqlite.run('DELETE FROM inbox_folder_mappings')
  sqlite.run('DELETE FROM gmail_label_mappings')
  for (const id of ['apiKey', 'inboxConnect', 'inboxMapping', 'linkedin'] as const) {
    setupHealth.clear(1, id)
    setupHealth.clear(2, id)
  }
})

const makeApp = (userId: number) => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', userId); return next() })
  w.route('/api/activity', activityRoute)
  return w
}

type ReadResult = { done: boolean; value?: Uint8Array }

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (buf: string) => boolean,
  ms = 1000,
): Promise<string | null> {
  const decoder = new TextDecoder()
  let buf = ''
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    const chunk = (await Promise.race([
      reader.read(),
      new Promise<ReadResult>((res) => setTimeout(() => res({ done: false }), remaining)),
    ])) as ReadResult
    if (chunk.done) break
    if (!chunk.value) break
    buf += decoder.decode(chunk.value)
    if (predicate(buf)) return buf
  }
  return null
}

const dataFor = (buf: string, event: string): unknown => {
  const match = buf.match(new RegExp(`event: ${event}\\ndata: (.+)\\n`))
  if (!match) throw new Error(`no ${event} event in buffer: ${JSON.stringify(buf)}`)
  return JSON.parse(match[1])
}

describe('GET /api/activity/stream', () => {
  test('responds with text/event-stream and a snapshot of current runs (AC1, AC2)', async () => {
    const userId = 9001
    const id = activityRegistry.register({ userId, type: 'discovery', progress: { count: 0, total: 5 } })

    const res = await makeApp(userId).request('/api/activity/stream')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toStartWith('text/event-stream')

    const reader = res.body!.getReader()
    const buf = await readUntil(reader, (b) => b.includes('event: snapshot'))
    expect(buf).not.toBeNull()
    expect(buf).toContain(id)

    const runs = dataFor(buf!, 'snapshot')
    expect(activityRunSchema.array().parse(runs)).toHaveLength(1)

    await reader.cancel()
  })

  test('pushes an update when the registry changes for that user (AC3)', async () => {
    const userId = 9002
    const res = await makeApp(userId).request('/api/activity/stream')
    const reader = res.body!.getReader()

    const snap = await readUntil(reader, (b) => b.includes('event: snapshot'))
    expect(snap).not.toBeNull()
    expect(activityRunSchema.array().parse(dataFor(snap!, 'snapshot'))).toHaveLength(0)

    const id = activityRegistry.register({ userId, type: 'analysis', progress: { count: 3, total: 10 } })

    const buf = await readUntil(reader, (b) => b.includes('event: update'))
    expect(buf).not.toBeNull()
    const runs = activityRunSchema.array().parse(dataFor(buf!, 'update'))
    expect(runs).toHaveLength(1)
    expect(runs[0].id).toBe(id)
    expect(runs[0].progress).toEqual({ count: 3, total: 10 })

    await reader.cancel()
  })

  test('does not deliver another user\'s runs (AC3 cross-user isolation)', async () => {
    const userA = 9003
    const userB = 9004
    const res = await makeApp(userA).request('/api/activity/stream')
    const reader = res.body!.getReader()

    const snap = await readUntil(reader, (b) => b.includes('event: snapshot'))
    expect(snap).not.toBeNull()

    activityRegistry.register({ userId: userB, type: 'discovery', progress: { count: 1, total: 1 } })

    const leaked = await readUntil(reader, (b) => b.includes('event: update'), 250)
    expect(leaked).toBeNull()

    await reader.cancel()
  })

  test('unsubscribes its listener on client disconnect (AC5 teardown)', async () => {
    const userId = 9005
    const unsubSpy = spyOn(activityRegistry, 'unsubscribe')
    try {
      const res = await makeApp(userId).request('/api/activity/stream')
      const reader = res.body!.getReader()

      const snap = await readUntil(reader, (b) => b.includes('event: snapshot'))
      expect(snap).not.toBeNull()

      await reader.cancel()
      await new Promise((r) => setTimeout(r, 50))

      expect(unsubSpy.mock.calls.some(([uid]) => uid === userId)).toBe(true)
    } finally {
      unsubSpy.mockRestore()
    }
  })

  test('schedules the heartbeat with KEEPALIVE_MS and clears it on disconnect (AC4, AC5)', async () => {
    const userId = 9006
    const setSpy = spyOn(global, 'setInterval')
    const clearSpy = spyOn(global, 'clearInterval')
    try {
      const res = await makeApp(userId).request('/api/activity/stream')
      const reader = res.body!.getReader()
      const snap = await readUntil(reader, (b) => b.includes('event: snapshot'))
      expect(snap).not.toBeNull()

      const idx = setSpy.mock.calls.findIndex(([, ms]) => ms === KEEPALIVE_MS)
      expect(idx).toBeGreaterThanOrEqual(0)
      const handle = setSpy.mock.results[idx]?.value

      await reader.cancel()
      await new Promise((r) => setTimeout(r, 50))

      expect(clearSpy.mock.calls.some(([h]) => h === handle)).toBe(true)
    } finally {
      setSpy.mockRestore()
      clearSpy.mockRestore()
    }
  })
})

describe('GET /api/activity/stream — setup-status channel', () => {
  test('delivers a schema-valid setup-status event on a health transition, with no secret leaked', async () => {
    const userId = 1
    const res = await makeApp(userId).request('/api/activity/stream')
    const reader = res.body!.getReader()

    const snap = await readUntil(reader, (b) => b.includes('event: snapshot'))
    expect(snap).not.toBeNull()

    // Present (complete) Anthropic credential for this user.
    const SECRET = 'sk-ant-do-not-leak-9f8e7d'
    sqlite.run(
      'INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, ?, ?, ?)',
      ['anthropic_api_key', SECRET, '2026-01-01T00:00:00.000Z'],
    )

    setupHealth.markBroken(userId, 'apiKey')

    const buf = await readUntil(reader, (b) => b.includes('event: setup-status'))
    expect(buf).not.toBeNull()
    const status = setupStatusSchema.parse(dataFor(buf!, 'setup-status'))
    expect(status.tasks.find((t) => t.id === 'apiKey')!.state).toBe('broken')
    expect(status.ready).toBe(false)
    expect(buf!).not.toContain(SECRET)

    await reader.cancel()
  })

  test('does not deliver another user\'s setup-status event', async () => {
    const res = await makeApp(2).request('/api/activity/stream')
    const reader = res.body!.getReader()

    const snap = await readUntil(reader, (b) => b.includes('event: snapshot'))
    expect(snap).not.toBeNull()

    setupHealth.markBroken(1, 'apiKey')

    const leaked = await readUntil(reader, (b) => b.includes('event: setup-status'), 250)
    expect(leaked).toBeNull()

    await reader.cancel()
  })

  test('starts and stops the per-user health interval on subscribe/disconnect', async () => {
    const userId = 1
    const startSpy = spyOn(setupHealth, 'startForUser')
    const stopSpy = spyOn(setupHealth, 'stopForUser')
    try {
      const res = await makeApp(userId).request('/api/activity/stream')
      const reader = res.body!.getReader()
      const snap = await readUntil(reader, (b) => b.includes('event: snapshot'))
      expect(snap).not.toBeNull()
      expect(startSpy.mock.calls.some(([uid]) => uid === userId)).toBe(true)

      await reader.cancel()
      await new Promise((r) => setTimeout(r, 50))

      expect(stopSpy.mock.calls.some(([uid]) => uid === userId)).toBe(true)
    } finally {
      startSpy.mockRestore()
      stopSpy.mockRestore()
    }
  })
})
