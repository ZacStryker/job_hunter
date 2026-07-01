import { describe, test, expect } from 'bun:test'
import { ROW_META, rowMeta, rowVerb, isLocked, progressMeter } from './NotificationsDropdown'
import type { SetupTask } from '@shared/schemas'

function task(partial: Partial<SetupTask> = {}): SetupTask {
  return {
    id: 'apiKey',
    state: 'notStarted',
    tier: 'required',
    dependsOn: null,
    dismissed: false,
    progress: null,
    ...partial,
  }
}

describe('rowMeta / ROW_META', () => {
  test('every task id maps to its label, verb and deep-link target', () => {
    expect(rowMeta('linkedin')).toEqual({ label: 'LinkedIn', verb: 'Connect', to: '/config/connections/linkedin' })
    expect(rowMeta('apiKey')).toEqual({ label: 'API key', verb: 'Add', to: '/config/connections/api-key' })
    expect(rowMeta('profile')).toEqual({ label: 'Profile', verb: 'Complete', to: '/config/profile' })
    expect(rowMeta('inboxConnect')).toEqual({ label: 'Inbox', verb: 'Connect', to: '/config/connections/inbox' })
    expect(rowMeta('inboxMapping')).toEqual({ label: 'Inbox mapping', verb: 'Map', to: '/config/connections/inbox' })
  })

  test('rowMeta reads from the same ROW_META record', () => {
    expect(rowMeta('profile')).toBe(ROW_META.profile)
  })
})

describe('rowVerb', () => {
  test('uses the static verb for non-broken tasks', () => {
    expect(rowVerb(task({ id: 'inboxConnect', tier: 'optional', state: 'partial' }))).toBe('Connect')
  })

  test('overrides to Reconnect for a broken task regardless of id', () => {
    expect(rowVerb(task({ id: 'apiKey', state: 'broken' }))).toBe('Reconnect')
    expect(rowVerb(task({ id: 'inboxConnect', tier: 'optional', state: 'broken' }))).toBe('Reconnect')
  })
})

describe('isLocked', () => {
  test('inboxMapping is locked when inboxConnect is not complete', () => {
    const tasks = [
      task({ id: 'inboxConnect', tier: 'optional', state: 'partial' }),
      task({ id: 'inboxMapping', tier: 'optional', state: 'notStarted', dependsOn: 'inboxConnect' }),
    ]
    expect(isLocked(tasks[1]!, tasks)).toBe(true)
  })

  test('inboxMapping is unlocked once inboxConnect is complete', () => {
    const tasks = [
      task({ id: 'inboxConnect', tier: 'optional', state: 'complete' }),
      task({ id: 'inboxMapping', tier: 'optional', state: 'notStarted', dependsOn: 'inboxConnect' }),
    ]
    expect(isLocked(tasks[1]!, tasks)).toBe(false)
  })

  test('a task with no dependency is never locked', () => {
    expect(isLocked(task({ id: 'linkedin', dependsOn: null }), [])).toBe(false)
  })

  test('not locked when the dependency is absent from the task list', () => {
    const mapping = task({ id: 'inboxMapping', tier: 'optional', dependsOn: 'inboxConnect' })
    expect(isLocked(mapping, [mapping])).toBe(false)
  })
})

describe('progressMeter', () => {
  test('shows 2/3 when two of three required tasks are complete and nothing is broken', () => {
    const tasks = [
      task({ id: 'linkedin', tier: 'required', state: 'complete' }),
      task({ id: 'apiKey', tier: 'required', state: 'complete' }),
      task({ id: 'profile', tier: 'required', state: 'notStarted' }),
    ]
    expect(progressMeter(tasks)).toEqual({ show: true, done: 2, total: 3 })
  })

  test('is hidden when a broken task is present even if required tasks are pending', () => {
    const tasks = [
      task({ id: 'linkedin', tier: 'required', state: 'complete' }),
      task({ id: 'apiKey', tier: 'required', state: 'notStarted' }),
      task({ id: 'profile', tier: 'required', state: 'complete' }),
      task({ id: 'inboxConnect', tier: 'optional', state: 'broken' }),
    ]
    expect(progressMeter(tasks)).toEqual({ show: false, done: 2, total: 3 })
  })

  test('is hidden once all required tasks are complete', () => {
    const tasks = [
      task({ id: 'linkedin', tier: 'required', state: 'complete' }),
      task({ id: 'apiKey', tier: 'required', state: 'complete' }),
      task({ id: 'profile', tier: 'required', state: 'complete' }),
    ]
    expect(progressMeter(tasks)).toEqual({ show: false, done: 3, total: 3 })
  })

  test('counts only required tasks toward the denominator', () => {
    const tasks = [
      task({ id: 'linkedin', tier: 'required', state: 'complete' }),
      task({ id: 'apiKey', tier: 'required', state: 'notStarted' }),
      task({ id: 'profile', tier: 'required', state: 'notStarted' }),
      task({ id: 'inboxConnect', tier: 'optional', state: 'complete' }),
      task({ id: 'inboxMapping', tier: 'optional', state: 'notStarted', dependsOn: 'inboxConnect' }),
    ]
    expect(progressMeter(tasks)).toEqual({ show: true, done: 1, total: 3 })
  })
})
