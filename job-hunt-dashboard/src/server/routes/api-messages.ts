import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, notLike, and, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { messages, userSecrets } from '../../db/schema'
import { MESSAGE_TYPES } from '../../shared/schemas'
import { fetchAndStoreEmails } from '../services/email-fetch-service'
import { decrypt } from '../lib/crypto'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

const messagePatchSchema = z.object({
  type: z.enum(MESSAGE_TYPES).nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
})

app.get('/', (c) => {
  const userId = c.get('userId')
  const all = db.select().from(messages)
    .where(and(
      notLike(messages.fromAddress, '%zac@zacstryker.com%'),
      notLike(messages.fromAddress, '%indeedapply@indeed.com%'),
      eq(messages.userId, userId),
    ))
    .orderBy(desc(messages.receivedAt)).all()
  return c.json({ messages: all })
})

app.post('/sync', async (c) => {
  const userId = c.get('userId')

  const rows = db.select({ keyName: userSecrets.keyName, ciphertext: userSecrets.ciphertext })
    .from(userSecrets)
    .where(and(
      eq(userSecrets.userId, userId),
      inArray(userSecrets.keyName, ['imap_host', 'imap_port', 'imap_user', 'imap_pass']),
    ))
    .all()
  const byKey = Object.fromEntries(rows.map((r) => [r.keyName, r.ciphertext]))

  if (!byKey['imap_host'] || !byKey['imap_user'] || !byKey['imap_pass']) {
    return c.json({ error: 'Email sync not configured — add IMAP credentials in settings' }, 503)
  }

  let host: string, port: number, user: string, pass: string
  try {
    host = decrypt(byKey['imap_host'])
    const rawPort = byKey['imap_port'] ? Number(decrypt(byKey['imap_port'])) : 993
    if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
      console.error('[messages/sync] Stored IMAP port is invalid:', rawPort)
      return c.json({ error: 'Failed to read email credentials' }, 500)
    }
    port = rawPort
    user = decrypt(byKey['imap_user'])
    pass = decrypt(byKey['imap_pass'])
  } catch (err) {
    console.error('[messages/sync] Failed to decrypt IMAP credentials:', err)
    return c.json({ error: 'Failed to read email credentials' }, 500)
  }

  try {
    const result = await fetchAndStoreEmails({ host, port, user, pass }, userId)
    return c.json({ added: result.added })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email sync failed'
    return c.json({ error: message }, 502)
  }
})

app.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid message id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid message id' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = messagePatchSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }

  const patch = parsed.data
  const hasFields = patch.type !== undefined || patch.company !== undefined || patch.jobTitle !== undefined
  if (!hasFields) {
    return c.json({ error: 'No updatable fields provided' }, 400)
  }

  const existing = db.select().from(messages).where(and(eq(messages.id, rawId), eq(messages.userId, userId))).get()
  if (!existing) {
    return c.json({ error: 'Message not found' }, 404)
  }

  const updateFields: Partial<typeof messages.$inferInsert> = {}
  if (patch.type !== undefined) updateFields.type = patch.type
  if (patch.company !== undefined) updateFields.company = patch.company
  if (patch.jobTitle !== undefined) updateFields.jobTitle = patch.jobTitle

  db.update(messages).set(updateFields).where(and(eq(messages.id, rawId), eq(messages.userId, userId))).run()

  const updated = db.select().from(messages).where(and(eq(messages.id, rawId), eq(messages.userId, userId))).get()
  if (!updated) return c.json({ error: 'Message not found' }, 404)
  return c.json({ message: updated })
})

export default app
