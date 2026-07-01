import { describe, test, expect } from 'bun:test'
import { initials, JUMP_LINKS } from './UserMenu'

describe('initials', () => {
  test('takes the first letter of the first two words, uppercased', () => {
    expect(initials('Zac Stryker')).toBe('ZS')
  })

  test('single word yields its first letter', () => {
    expect(initials('zac')).toBe('Z')
  })

  test('falls back to the email first character when name is empty', () => {
    expect(initials('', 'zac@x.com')).toBe('Z')
  })

  test('returns empty string when neither name nor email is resolvable', () => {
    expect(initials(null, null)).toBe('')
    expect(initials(undefined, undefined)).toBe('')
  })

  test('trims surrounding and collapses interior whitespace', () => {
    expect(initials('  Zac   Stryker  ')).toBe('ZS')
  })

  test('only the first two words count toward initials', () => {
    expect(initials('Zac Michael Stryker')).toBe('ZM')
  })
})

describe('JUMP_LINKS', () => {
  test('lists the five Config sections in order', () => {
    expect(JUMP_LINKS).toHaveLength(5)
    expect(JUMP_LINKS.map((l) => l.label)).toEqual(['Profile', 'Sources', 'Connections', 'Prompts', 'Logs'])
    expect(JUMP_LINKS.map((l) => l.to)).toEqual([
      '/config/profile',
      '/config/sources',
      '/config/connections',
      '/config/prompts',
      '/config/system/logs',
    ])
  })
})
