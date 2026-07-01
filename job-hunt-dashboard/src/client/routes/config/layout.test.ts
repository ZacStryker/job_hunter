import { describe, test, expect } from 'bun:test'
import type { SetupTask, SetupTaskId, SetupTaskState, SetupTaskTier } from '@shared/schemas'
import {
  taskNeedsAttention,
  childNeedsAttention,
  sectionNeedsAttention,
  SECTIONS,
  type Section,
} from './layout'

function task(
  id: SetupTaskId,
  state: SetupTaskState,
  tier: SetupTaskTier,
  dependsOn: SetupTaskId | null = null,
): SetupTask {
  return { id, state, tier, dependsOn, dismissed: false, progress: null }
}

const connections = SECTIONS.find((s) => s.label === 'Connections') as Section

describe('taskNeedsAttention', () => {
  test('broken needs attention regardless of tier', () => {
    expect(taskNeedsAttention(task('linkedin', 'broken', 'required'))).toBe(true)
    expect(taskNeedsAttention(task('inboxConnect', 'broken', 'optional'))).toBe(true)
  })

  test('required incomplete needs attention', () => {
    expect(taskNeedsAttention(task('profile', 'notStarted', 'required'))).toBe(true)
    expect(taskNeedsAttention(task('profile', 'partial', 'required'))).toBe(true)
  })

  test('required complete does not need attention', () => {
    expect(taskNeedsAttention(task('profile', 'complete', 'required'))).toBe(false)
  })

  test('optional incomplete does not need attention', () => {
    expect(taskNeedsAttention(task('inboxConnect', 'notStarted', 'optional'))).toBe(false)
    expect(taskNeedsAttention(task('inboxConnect', 'partial', 'optional'))).toBe(false)
  })

  test('dismissed task never needs attention even when broken', () => {
    expect(taskNeedsAttention({ ...task('inboxConnect', 'broken', 'optional'), dismissed: true })).toBe(false)
    expect(taskNeedsAttention({ ...task('profile', 'notStarted', 'required'), dismissed: true })).toBe(false)
  })
})

describe('childNeedsAttention', () => {
  test('linkedin child dots when linkedin task broken', () => {
    const tasks = [task('linkedin', 'broken', 'required')]
    expect(childNeedsAttention('/config/connections/linkedin', tasks)).toBe(true)
  })

  test('inbox child dots when either inbox task broken', () => {
    expect(
      childNeedsAttention('/config/connections/inbox', [task('inboxConnect', 'broken', 'optional')]),
    ).toBe(true)
    expect(
      childNeedsAttention('/config/connections/inbox', [
        task('inboxMapping', 'broken', 'optional', 'inboxConnect'),
      ]),
    ).toBe(true)
  })

  test('inbox child does not dot when both inbox tasks healthy', () => {
    const tasks = [
      task('inboxConnect', 'complete', 'optional'),
      task('inboxMapping', 'complete', 'optional', 'inboxConnect'),
    ]
    expect(childNeedsAttention('/config/connections/inbox', tasks)).toBe(false)
  })

  test('unmapped path never dots', () => {
    const tasks = [task('linkedin', 'broken', 'required')]
    expect(childNeedsAttention('/config/sources/searches', tasks)).toBe(false)
  })
})

describe('sectionNeedsAttention', () => {
  test('true when a mapped visible child needs attention', () => {
    const tasks = [task('linkedin', 'broken', 'required')]
    expect(sectionNeedsAttention(connections, tasks, true)).toBe(true)
  })

  test('false when all children healthy', () => {
    const tasks = [
      task('linkedin', 'complete', 'required'),
      task('apiKey', 'complete', 'required'),
      task('inboxConnect', 'complete', 'optional'),
      task('inboxMapping', 'complete', 'optional', 'inboxConnect'),
    ]
    expect(sectionNeedsAttention(connections, tasks, true)).toBe(false)
  })

  test('hidden inbox child does not roll up when email features off', () => {
    const tasks = [task('inboxConnect', 'broken', 'optional')]
    expect(sectionNeedsAttention(connections, tasks, false)).toBe(false)
    expect(sectionNeedsAttention(connections, tasks, true)).toBe(true)
  })
})
