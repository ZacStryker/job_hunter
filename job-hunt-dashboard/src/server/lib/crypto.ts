import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

export function encrypt(plaintext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error(`decrypt: malformed ciphertext (expected 3 segments, got ${parts.length})`)
  const [ivHex, encryptedHex, authTagHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
}
