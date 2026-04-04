import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { computeOpacity, computeDaysAgo } from './AgingRow'

const BASE_DATE = new Date('2026-04-10T12:00:00').getTime()
const originalNow = Date.now
beforeAll(() => { Date.now = () => BASE_DATE })
afterAll(() => { Date.now = originalNow })

function daysAgo(n: number): string {
  return new Date(BASE_DATE - n * 86400000).toISOString().split('T')[0]
}

describe('computeOpacity', () => {
  test('null → 1.0', () => expect(computeOpacity(null)).toBe(1.0))
  test('0 days → 1.0', () => expect(computeOpacity(daysAgo(0))).toBe(1.0))
  test('7 days → 1.0', () => expect(computeOpacity(daysAgo(7))).toBe(1.0))
  test('8 days → 0.75', () => expect(computeOpacity(daysAgo(8))).toBe(0.75))
  test('14 days → 0.75', () => expect(computeOpacity(daysAgo(14))).toBe(0.75))
  test('15 days → 0.55', () => expect(computeOpacity(daysAgo(15))).toBe(0.55))
  test('21 days → 0.55', () => expect(computeOpacity(daysAgo(21))).toBe(0.55))
  test('22 days → 0.35', () => expect(computeOpacity(daysAgo(22))).toBe(0.35))
  test('60 days → 0.35', () => expect(computeOpacity(daysAgo(60))).toBe(0.35))
})

describe('computeDaysAgo', () => {
  test('7 days ago', () => expect(computeDaysAgo(daysAgo(7))).toBe(7))
})
