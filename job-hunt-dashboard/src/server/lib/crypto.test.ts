// Set env BEFORE any imports — project convention for test isolation
process.env.ENCRYPTION_KEY = '0'.repeat(64) // 32 zero-bytes; valid AES-256 key for testing

import { describe, test, expect } from 'bun:test'
import { encrypt, decrypt } from './crypto'

describe('crypto', () => {
  test('roundtrip: decrypt(encrypt(x)) === x', () => {
    const plaintext = 'super-secret-api-key-123'
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  test('output format is iv:ciphertext:authTag (3 hex segments)', () => {
    const parts = encrypt('hello').split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toHaveLength(24)  // 12-byte IV = 24 hex chars
    expect(parts[2]).toHaveLength(32)  // 16-byte GCM auth tag = 32 hex chars
  })

  test('random IV: same plaintext produces different ciphertexts', () => {
    const ct1 = encrypt('same-value')
    const ct2 = encrypt('same-value')
    expect(ct1).not.toBe(ct2)
    // But both decrypt to the same value
    expect(decrypt(ct1)).toBe('same-value')
    expect(decrypt(ct2)).toBe('same-value')
  })
})
