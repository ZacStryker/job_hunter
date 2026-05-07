import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ImapFlow } from 'imapflow'
import { db } from '../../db/client'
import { userSecrets } from '../../db/schema'
import { encrypt } from '../lib/crypto'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/status', (c) => {
  const userId = c.get('userId')
  const rows = db.select({ keyName: userSecrets.keyName })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .all()
  const keys = new Set(rows.map((r) => r.keyName))
  const hasAnthropicKey = keys.has('anthropic_api_key')
  const hasImap = keys.has('imap_host') && keys.has('imap_user') && keys.has('imap_pass')
  const hasLinkedinAuth = keys.has('linkedin_storage_state')
  const onboardingComplete = hasAnthropicKey
  return c.json({ hasAnthropicKey, hasImap, hasLinkedinAuth, onboardingComplete })
})

const anthropicSchema = z.object({ apiKey: z.string().min(1) })

app.put('/anthropic', async (c) => {
  const userId = c.get('userId')

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = anthropicSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': parsed.data.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    const e = err as Error
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return c.json({ error: 'Connection timed out — check your network and try again' }, 400)
    }
    return c.json({ error: 'Server error — try again in a moment' }, 400)
  }

  if (res.status === 401) {
    return c.json({ error: 'Invalid key — verify at console.anthropic.com' }, 400)
  }
  if (res.status >= 500) {
    return c.json({ error: 'Server error — try again in a moment' }, 400)
  }
  if (!res.ok) {
    return c.json({ error: 'Invalid key — verify at console.anthropic.com' }, 400)
  }

  const now = new Date().toISOString()
  const ciphertext = encrypt(parsed.data.apiKey)
  db.insert(userSecrets)
    .values({ userId, keyName: 'anthropic_api_key', ciphertext, updatedAt: now })
    .onConflictDoUpdate({
      target: [userSecrets.userId, userSecrets.keyName],
      set: { ciphertext, updatedAt: now },
    })
    .run()

  return c.json({ ok: true })
})

const linkedinSchema = z.object({ content: z.string().min(1) })

app.put('/linkedin', async (c) => {
  const userId = c.get('userId')

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = linkedinSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)

  const now = new Date().toISOString()
  const ciphertext = encrypt(parsed.data.content)
  db.insert(userSecrets)
    .values({ userId, keyName: 'linkedin_storage_state', ciphertext, updatedAt: now })
    .onConflictDoUpdate({
      target: [userSecrets.userId, userSecrets.keyName],
      set: { ciphertext, updatedAt: now },
    })
    .run()

  return c.json({ ok: true })
})

const imapSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  pass: z.string().min(1),
})

app.put('/imap', async (c) => {
  const userId = c.get('userId')

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = imapSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)

  const client = new ImapFlow({
    host: parsed.data.host,
    port: parsed.data.port,
    secure: true,
    auth: { user: parsed.data.user, pass: parsed.data.pass },
    logger: false,
  })

  let connected = false
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(Object.assign(new Error('IMAP timeout'), { name: 'TimeoutError' })), 10000)
  )

  try {
    await Promise.race([client.connect(), timeoutPromise])
    connected = true
    await client.logout()
  } catch (err) {
    if (connected) {
      // logout error after successful connect — ignore and proceed
    } else {
      const e = err as Error
      if (e.name === 'TimeoutError') {
        return c.json({ error: 'Connection timed out — check your network and try again' }, 400)
      }
      const msg = e.message?.toLowerCase() ?? ''
      if (msg.includes('auth') || msg.includes('authentication') || msg.includes('login') || msg.includes('credentials')) {
        return c.json({ error: 'Authentication failed — check username and password' }, 400)
      }
      return c.json({ error: 'Cannot reach host — verify server address and port' }, 400)
    }
  }

  const now = new Date().toISOString()
  const secrets = [
    { keyName: 'imap_host', value: parsed.data.host },
    { keyName: 'imap_port', value: String(parsed.data.port) },
    { keyName: 'imap_user', value: parsed.data.user },
    { keyName: 'imap_pass', value: parsed.data.pass },
  ]
  for (const { keyName, value } of secrets) {
    const ciphertext = encrypt(value)
    db.insert(userSecrets)
      .values({ userId, keyName, ciphertext, updatedAt: now })
      .onConflictDoUpdate({
        target: [userSecrets.userId, userSecrets.keyName],
        set: { ciphertext, updatedAt: now },
      })
      .run()
  }

  return c.json({ ok: true })
})

export default app
