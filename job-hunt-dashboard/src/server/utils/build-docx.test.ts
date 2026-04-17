import { describe, test, expect } from 'bun:test'
import { buildDocx } from './build-docx'

const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04])

describe('buildDocx()', () => {
  test('returns a non-empty Buffer', () => {
    const result = buildDocx('Hello world.')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })

  test('starts with ZIP magic bytes (PK\\x03\\x04)', () => {
    const result = buildDocx('Hello world.')
    expect(result.subarray(0, 4)).toEqual(ZIP_MAGIC)
  })

  test('contains word/document.xml entry', () => {
    const result = buildDocx('Hello world.')
    const str = result.toString('binary')
    expect(str).toContain('word/document.xml')
  })

  test('contains [Content_Types].xml entry', () => {
    const result = buildDocx('Hello world.')
    const str = result.toString('binary')
    expect(str).toContain('[Content_Types].xml')
  })

  test('empty string produces valid ZIP without throwing', () => {
    expect(() => buildDocx('')).not.toThrow()
  })

  test('multi-line text produces valid ZIP', () => {
    const result = buildDocx('Line 1\n\nLine 2\nLine 3')
    expect(result.subarray(0, 4)).toEqual(ZIP_MAGIC)
  })
})
