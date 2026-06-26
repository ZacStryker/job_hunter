import { describe, test, expect } from 'bun:test'
import { parseRuns, computeIsActive } from './useActivityStream'
import type { ActivityRun } from '@shared/schemas'

function discoveryRun(state: ActivityRun['state'] = 'running'): ActivityRun {
  return {
    id: 'disc-1',
    type: 'discovery',
    state,
    startedAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:05.000Z',
    progress: { count: 3, total: 10 },
  }
}

function coverLetterRun(state: ActivityRun['state'] = 'running'): ActivityRun {
  return {
    id: 'cl-1',
    type: 'cover_letter',
    state,
    startedAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:05.000Z',
    progress: { company: 'Acme', role: 'Engineer' },
  }
}

describe('parseRuns', () => {
  test('valid running discovery run (count/total progress) → returns the array', () => {
    const run = discoveryRun()
    expect(parseRuns(JSON.stringify([run]))).toEqual([run])
  })

  test('valid cover_letter run (company/role progress) → returns it', () => {
    const run = coverLetterRun()
    expect(parseRuns(JSON.stringify([run]))).toEqual([run])
  })

  test('empty array → returns []', () => {
    expect(parseRuns('[]')).toEqual([])
  })

  test('malformed JSON → null', () => {
    expect(parseRuns('{not json')).toBeNull()
  })

  test('JSON that fails the schema (missing fields) → null', () => {
    expect(parseRuns('[{"id":"x"}]')).toBeNull()
  })

  test('JSON with invalid enum value → null', () => {
    const bad = { ...discoveryRun(), state: 'paused' }
    expect(parseRuns(JSON.stringify([bad]))).toBeNull()
  })

  test('non-array JSON object → null', () => {
    expect(parseRuns('{}')).toBeNull()
  })
})

describe('computeIsActive', () => {
  test('empty list → false', () => {
    expect(computeIsActive([])).toBe(false)
  })

  test('one running run → true', () => {
    expect(computeIsActive([discoveryRun('running')])).toBe(true)
  })

  test('only done/failed runs → false', () => {
    expect(computeIsActive([discoveryRun('done'), coverLetterRun('failed')])).toBe(false)
  })

  test('mixed running + done → true', () => {
    expect(computeIsActive([discoveryRun('done'), coverLetterRun('running')])).toBe(true)
  })
})
