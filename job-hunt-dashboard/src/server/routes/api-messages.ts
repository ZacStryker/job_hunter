import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, notLike, and } from 'drizzle-orm'
import { db } from '../../db/client'
import { messages } from '../../db/schema'
import { MESSAGE_TYPES } from '../../shared/schemas'
import { fetchAndStoreEmails } from '../services/email-fetch-service'

const app = new Hono()

const messagePatchSchema = z.object({
  type: z.enum(MESSAGE_TYPES).nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
})

app.get('/', (c) => {
  const all = db.select().from(messages)
    .where(and(
      notLike(messages.fromAddress, '%zac@zacstryker.com%'),
      notLike(messages.fromAddress, '%indeedapply@indeed.com%'),
    ))
    .orderBy(desc(messages.receivedAt)).all()
  return c.json({ messages: all })
})

app.post('/sync', async (c) => {
  const { IMAP_HOST, IMAP_USER, IMAP_PASS } = process.env
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    return c.json({ error: 'Email sync not configured (IMAP credentials missing)' }, 503)
  }
  try {
    const result = await fetchAndStoreEmails({ host: IMAP_HOST, user: IMAP_USER, pass: IMAP_PASS })
    return c.json({ added: result.added })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email sync failed'
    return c.json({ error: message }, 502)
  }
})

app.patch('/:id', async (c) => {
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

  const existing = db.select().from(messages).where(eq(messages.id, rawId)).get()
  if (!existing) {
    return c.json({ error: 'Message not found' }, 404)
  }

  const updateFields: Partial<typeof messages.$inferInsert> = {}
  if (patch.type !== undefined) updateFields.type = patch.type
  if (patch.company !== undefined) updateFields.company = patch.company
  if (patch.jobTitle !== undefined) updateFields.jobTitle = patch.jobTitle

  db.update(messages).set(updateFields).where(eq(messages.id, rawId)).run()

  const updated = db.select().from(messages).where(eq(messages.id, rawId)).get()
  if (!updated) return c.json({ error: 'Message not found' }, 404)
  return c.json({ message: updated })
})

export default app
