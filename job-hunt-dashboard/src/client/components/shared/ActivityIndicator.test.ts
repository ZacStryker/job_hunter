import { describe, test, expect } from 'bun:test'
import { runTitle, runStatusLine } from './ActivityIndicator'
import type { ActivityRun } from '@shared/schemas'

function run(partial: Pick<ActivityRun, 'type' | 'progress'>): ActivityRun {
  return {
    id: 'r1',
    state: 'running',
    startedAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
    ...partial,
  }
}

describe('runTitle', () => {
  test('discovery', () => expect(runTitle('discovery')).toBe('Discovery'))
  test('analysis', () => expect(runTitle('analysis')).toBe('Analysis'))
  test('cover_letter', () => expect(runTitle('cover_letter')).toBe('Cover Letter'))
  test('resume', () => expect(runTitle('resume')).toBe('Resume'))
})

describe('runStatusLine', () => {
  test('discovery → count', () =>
    expect(runStatusLine(run({ type: 'discovery', progress: { count: 7, total: 40 } })))
      .toBe('7 jobs discovered so far'))

  test('analysis → count', () =>
    expect(runStatusLine(run({ type: 'analysis', progress: { count: 3, total: 10 } })))
      .toBe('3 jobs analyzed so far'))

  test('cover_letter → company · role', () =>
    expect(runStatusLine(run({ type: 'cover_letter', progress: { company: 'Acme', role: 'SWE' } })))
      .toBe('Generating cover letter — Acme · SWE'))

  test('resume → company · role', () =>
    expect(runStatusLine(run({ type: 'resume', progress: { company: 'Globex', role: 'PM' } })))
      .toBe('Generating resume — Globex · PM'))
})
