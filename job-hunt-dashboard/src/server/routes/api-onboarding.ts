import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { ImapFlow } from 'imapflow'
import { db } from '../../db/client'
import { userSecrets, gmailLabelMappings } from '../../db/schema'
import { encrypt, decrypt } from '../lib/crypto'
import { GMAIL_SCOPES, isGmailConfigured, getOAuthClient, getAccessToken, encodeState, decodeState } from '../lib/gmail-oauth'
import { setupHealth } from '../services/setup-health'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/status', (c) => {
  const userId = c.get('userId')
  const rows = db.select({ keyName: userSecrets.keyName, ciphertext: userSecrets.ciphertext })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .all()
  const keys = new Set(rows.map((r) => r.keyName))
  const hasAnthropicKey = keys.has('anthropic_api_key')
  const hasImap = keys.has('imap_host') && keys.has('imap_user') && keys.has('imap_pass')
  const hasLinkedinAuth = keys.has('linkedin_storage_state')
  const hasIndeedAuth = keys.has('indeed_storage_state')
  const hasGmail = keys.has('gmail_refresh_token')
  const onboardingComplete = hasAnthropicKey

  let gmailAddress: string | null = null
  const addressRow = rows.find((r) => r.keyName === 'gmail_address')
  if (addressRow) {
    try { gmailAddress = decrypt(addressRow.ciphertext) } catch { gmailAddress = null }
  }

  return c.json({ hasAnthropicKey, hasImap, hasLinkedinAuth, hasIndeedAuth, hasGmail, gmailAddress, onboardingComplete })
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
    return c.json({ error: 'Invalid key — verify at platform.claude.com' }, 400)
  }
  if (res.status >= 500) {
    return c.json({ error: 'Server error — try again in a moment' }, 400)
  }
  if (!res.ok) {
    return c.json({ error: 'Invalid key — verify at platform.claude.com' }, 400)
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

  setupHealth.markHealthy(userId, 'apiKey')

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

  setupHealth.markHealthy(userId, 'inboxConnect')

  return c.json({ ok: true })
})

const indeedSessionSchema = z.object({ cookies: z.array(z.unknown()).min(1) }).passthrough()

app.put('/indeed', async (c) => {
  const userId = c.get('userId')

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = indeedSessionSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)

  const now = new Date().toISOString()
  const ciphertext = encrypt(JSON.stringify(parsed.data))
  db.insert(userSecrets)
    .values({ userId, keyName: 'indeed_storage_state', ciphertext, updatedAt: now })
    .onConflictDoUpdate({
      target: [userSecrets.userId, userSecrets.keyName],
      set: { ciphertext, updatedAt: now },
    })
    .run()

  return c.json({ ok: true })
})

app.get('/gmail/connect', (c) => {
  if (!isGmailConfigured()) {
    return c.json({ error: 'Gmail not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' }, 503)
  }
  const ret = c.req.query('return') === 'onboarding' ? 'onboarding' : 'config'
  const state = encodeState({ uid: c.get('sessionUserId'), ret })
  const url = getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
  })
  return c.json({ url })
})

app.get('/gmail/callback', async (c) => {
  const rawState = c.req.query('state')
  const parsed = rawState ? decodeState(rawState) : null
  const surface = parsed?.ret === 'onboarding' ? '/onboarding' : '/config/connections/inbox'

  if (c.req.query('error')) return c.redirect(`${surface}?gmail=error`)

  if (!parsed || parsed.uid !== c.get('sessionUserId')) {
    return c.json({ error: 'Invalid state' }, 403)
  }

  const code = c.req.query('code')
  if (!code) return c.redirect(`${surface}?gmail=error`)

  try {
    const { tokens } = await getOAuthClient().getToken(code)
    if (!tokens.refresh_token || !tokens.access_token) {
      return c.redirect(`${surface}?gmail=error`)
    }

    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!profileRes.ok) return c.redirect(`${surface}?gmail=error`)
    const { emailAddress } = await profileRes.json() as { emailAddress?: string }
    if (!emailAddress) return c.redirect(`${surface}?gmail=error`)

    const userId = c.get('userId')
    const now = new Date().toISOString()
    const secrets = [
      { keyName: 'gmail_refresh_token', value: tokens.refresh_token },
      { keyName: 'gmail_address', value: emailAddress },
    ]
    db.transaction((tx) => {
      for (const { keyName, value } of secrets) {
        const ciphertext = encrypt(value)
        tx.insert(userSecrets)
          .values({ userId, keyName, ciphertext, updatedAt: now })
          .onConflictDoUpdate({
            target: [userSecrets.userId, userSecrets.keyName],
            set: { ciphertext, updatedAt: now },
          })
          .run()
      }
    })
    setupHealth.markHealthy(userId, 'inboxConnect')
  } catch {
    return c.redirect(`${surface}?gmail=error`)
  }

  return c.redirect(`${surface}?gmail=connected`)
})

app.get('/gmail/labels', async (c) => {
  if (!isGmailConfigured()) {
    return c.json({ error: 'Gmail not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' }, 503)
  }
  const userId = c.get('userId')
  const row = db.select({ ciphertext: userSecrets.ciphertext })
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'gmail_refresh_token')))
    .get()
  if (!row) return c.json({ error: 'Gmail not connected' }, 503)

  let res: Response
  try {
    const accessToken = await getAccessToken(decrypt(row.ciphertext))
    res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    return c.json({ error: 'Failed to fetch Gmail labels — reconnect Gmail and try again' }, 502)
  }
  if (!res.ok) return c.json({ error: 'Failed to fetch Gmail labels — reconnect Gmail and try again' }, 502)
  const { labels } = await res.json() as { labels?: Array<{ id: string; name: string }> }
  return c.json((labels ?? []).map((l) => ({ id: l.id, name: l.name })))
})

app.delete('/gmail', async (c) => {
  const userId = c.get('userId')

  const row = db.select({ ciphertext: userSecrets.ciphertext })
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'gmail_refresh_token')))
    .get()
  if (row) {
    try {
      await getOAuthClient().revokeToken(decrypt(row.ciphertext))
    } catch (err) {
      console.error('[gmail] revoke failed:', (err as Error).message)
    }
  }

  db.transaction((tx) => {
    tx.delete(userSecrets)
      .where(and(eq(userSecrets.userId, userId), inArray(userSecrets.keyName, ['gmail_refresh_token', 'gmail_address'])))
      .run()
    tx.delete(gmailLabelMappings).where(eq(gmailLabelMappings.userId, userId)).run()
  })

  setupHealth.clear(userId, 'inboxConnect')

  return c.json({ ok: true })
})

export default app
