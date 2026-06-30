import { describe, test, expect } from 'bun:test'
import { parseSetupStatus, computeBadge } from './useSetupStatus'
import type { SetupStatus, SetupTask } from '@shared/schemas'

function task(partial: Partial<SetupTask> = {}): SetupTask {
  return {
    id: 'apiKey',
    state: 'complete',
    tier: 'required',
    dependsOn: null,
    dismissed: false,
    progress: null,
    ...partial,
  }
}

function status(partial: Partial<SetupStatus> = {}): SetupStatus {
  return { tasks: [], ready: false, ...partial }
}

describe('parseSetupStatus', () => {
  test('valid full snapshot string → deep-equals the object', () => {
    const snapshot = status({
      tasks: [task({ id: 'linkedin', tier: 'required', state: 'complete' })],
      ready: true,
    })
    expect(parseSetupStatus(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  test('malformed JSON → null', () => {
    expect(parseSetupStatus('{not json')).toBeNull()
  })

  test('schema-invalid object (incomplete task) → null', () => {
    expect(parseSetupStatus('{"tasks":[{"id":"x"}],"ready":true}')).toBeNull()
  })

  test('object missing ready → null', () => {
    expect(parseSetupStatus('{"tasks":[]}')).toBeNull()
  })

  test('non-object array → null', () => {
    expect(parseSetupStatus('[]')).toBeNull()
  })
})

describe('computeBadge', () => {
  test('undefined → none', () => {
    expect(computeBadge(undefined)).toBe('none')
  })

  test('ready:true → none', () => {
    expect(computeBadge(status({ ready: true }))).toBe('none')
  })

  test('a broken required task → alert', () => {
    expect(computeBadge(status({ tasks: [task({ tier: 'required', state: 'broken' })] }))).toBe('alert')
  })

  test('a broken optional task → alert (literal AC4 rule)', () => {
    expect(computeBadge(status({ tasks: [task({ id: 'inboxConnect', tier: 'optional', state: 'broken' })] }))).toBe('alert')
  })

  test('incomplete required task with no broken → alert', () => {
    expect(computeBadge(status({ tasks: [task({ tier: 'required', state: 'partial' })] }))).toBe('alert')
  })

  test('all required complete + pending undismissed optional + ready:false → dot', () => {
    expect(
      computeBadge(
        status({
          tasks: [
            task({ id: 'apiKey', tier: 'required', state: 'complete' }),
            task({ id: 'inboxConnect', tier: 'optional', state: 'partial', dismissed: false }),
          ],
        }),
      ),
    ).toBe('dot')
  })

  test('all required complete + only a dismissed pending optional + ready:false → dot (literal AC4: dismissed not excluded from dot)', () => {
    expect(
      computeBadge(
        status({
          tasks: [
            task({ id: 'apiKey', tier: 'required', state: 'complete' }),
            task({ id: 'inboxConnect', tier: 'optional', state: 'partial', dismissed: true }),
          ],
        }),
      ),
    ).toBe('dot')
  })
})
