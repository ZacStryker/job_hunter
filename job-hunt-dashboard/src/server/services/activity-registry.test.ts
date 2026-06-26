import { describe, test, expect, beforeEach } from 'bun:test'
import { createActivityRegistry, type ActivityListener } from './activity-registry'
import type { ActivityRun } from '../../shared/schemas'

const USER_A = 1
const USER_B = 2

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let registry: ReturnType<typeof createActivityRegistry>

beforeEach(() => {
  registry = createActivityRegistry()
})

describe('register', () => {
  test('creates a running run with a generated id, returned in snapshot', () => {
    const id = registry.register({ userId: USER_A, type: 'discovery', progress: { count: 0, total: null } })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)

    const runs = registry.snapshot(USER_A)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ id, type: 'discovery', state: 'running', progress: { count: 0, total: null } })
    expect(runs[0].startedAt).toBe(runs[0].updatedAt)
  })
})

describe('progress', () => {
  test('updates payload and bumps updatedAt, notifies subscriber', async () => {
    const seen: ActivityRun[][] = []
    const listener: ActivityListener = (runs) => seen.push(runs)
    registry.subscribe(USER_A, listener)

    const id = registry.register({ userId: USER_A, type: 'analysis', progress: { count: 1, total: 10 } })
    const before = registry.snapshot(USER_A)[0].updatedAt
    await wait(2)
    registry.progress(id, { count: 5, total: 10 })

    const run = registry.snapshot(USER_A)[0]
    expect(run.progress).toEqual({ count: 5, total: 10 })
    expect(run.updatedAt > before).toBe(true)

    // one emit on register + one on progress
    expect(seen).toHaveLength(2)
    expect(seen[1][0].progress).toEqual({ count: 5, total: 10 })
  })
})

describe('finalize', () => {
  test('done: sets state, notifies, and prunes after retention window', async () => {
    const seen: ActivityRun[][] = []
    registry.subscribe(USER_A, (runs) => seen.push(runs))

    const id = registry.register({ userId: USER_A, type: 'cover_letter', progress: { company: 'Acme', role: 'Engineer' } })
    registry.finalize(id, 'done', 20)

    // Immediately after finalize the run is still observable with state 'done'
    expect(registry.snapshot(USER_A)).toHaveLength(1)
    expect(registry.snapshot(USER_A)[0].state).toBe('done')

    await wait(40)

    // After the retention window the run is pruned and a drop is emitted
    expect(registry.snapshot(USER_A)).toHaveLength(0)
    expect(seen[seen.length - 1]).toHaveLength(0)
  })

  test('failed: sets state to failed and notifies', () => {
    const seen: ActivityRun[][] = []
    registry.subscribe(USER_A, (runs) => seen.push(runs))

    const id = registry.register({ userId: USER_A, type: 'resume', progress: { company: 'Acme', role: 'Engineer' } })
    registry.finalize(id, 'failed', 20)

    expect(registry.snapshot(USER_A)[0].state).toBe('failed')
    expect(seen[seen.length - 1][0].state).toBe('failed')
  })
})

describe('user isolation', () => {
  test('snapshot never returns another user\'s runs', () => {
    registry.register({ userId: USER_A, type: 'discovery', progress: { count: 0, total: null } })
    registry.register({ userId: USER_B, type: 'analysis', progress: { count: 0, total: 3 } })

    expect(registry.snapshot(USER_A)).toHaveLength(1)
    expect(registry.snapshot(USER_A)[0].type).toBe('discovery')
    expect(registry.snapshot(USER_B)).toHaveLength(1)
    expect(registry.snapshot(USER_B)[0].type).toBe('analysis')
  })

  test('a subscriber never fires for another user\'s activity', () => {
    const seenA: ActivityRun[][] = []
    registry.subscribe(USER_A, (runs) => seenA.push(runs))

    registry.register({ userId: USER_B, type: 'discovery', progress: { count: 0, total: null } })

    expect(seenA).toHaveLength(0)
  })

  test('unknown/empty user returns []', () => {
    expect(registry.snapshot(999)).toEqual([])
  })
})

describe('subscribe / unsubscribe', () => {
  test('after unsubscribe, the listener receives no further calls', () => {
    const seen: ActivityRun[][] = []
    const listener: ActivityListener = (runs) => seen.push(runs)
    registry.subscribe(USER_A, listener)

    const id = registry.register({ userId: USER_A, type: 'discovery', progress: { count: 0, total: null } })
    expect(seen).toHaveLength(1)

    registry.unsubscribe(USER_A, listener)
    registry.progress(id, { count: 1, total: null })

    expect(seen).toHaveLength(1)
  })
})

describe('unknown id', () => {
  test('progress and finalize on an unknown id are silent no-ops', () => {
    const seen: ActivityRun[][] = []
    registry.subscribe(USER_A, (runs) => seen.push(runs))

    expect(() => registry.progress('nope', { count: 1, total: null })).not.toThrow()
    expect(() => registry.finalize('nope', 'done', 20)).not.toThrow()

    expect(seen).toHaveLength(0)
    expect(registry.snapshot(USER_A)).toHaveLength(0)
  })
})

describe('user isolation during progress / finalize / prune', () => {
  test('user B subscriber stays silent through A\'s progress, finalize, and prune', async () => {
    const seenB: ActivityRun[][] = []
    registry.subscribe(USER_B, (runs) => seenB.push(runs))

    const id = registry.register({ userId: USER_A, type: 'analysis', progress: { count: 1, total: 10 } })
    registry.progress(id, { count: 5, total: 10 })
    registry.finalize(id, 'done', 20)
    await wait(40)

    // A's run is pruned; B never heard a thing
    expect(registry.snapshot(USER_A)).toHaveLength(0)
    expect(seenB).toHaveLength(0)
    expect(registry.snapshot(USER_B)).toHaveLength(0)
  })
})
