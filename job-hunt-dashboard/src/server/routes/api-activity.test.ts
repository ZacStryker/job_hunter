import { describe, test, expect, spyOn } from 'bun:test'
import { Hono } from 'hono'
import activityRoute, { KEEPALIVE_MS } from './api-activity'
import { activityRegistry } from '../services/activity-registry'
import { activityRunSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

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
