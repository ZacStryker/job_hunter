import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { companyBlacklist } from '../../db/schema'
import { blacklistEntryInputSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/', (c) => {
  const userId = c.get('userId')
  const rows = db.select().from(companyBlacklist).where(eq(companyBlacklist.userId, userId)).all()
  return c.json(rows)
})

app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = blacklistEntryInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }
  const companyName = parsed.data.companyName.trim().toLowerCase()
  let result
  try {
    result = db.transaction((tx) => {
      const existing = tx.select({ id: companyBlacklist.id })
        .from(companyBlacklist)
        .where(and(eq(companyBlacklist.userId, userId), eq(companyBlacklist.companyName, companyName)))
        .get()
      if (existing) return null
      return tx.insert(companyBlacklist).values({
        userId,
        companyName,
        createdAt: new Date().toISOString(),
      }).returning().get()
    })
  } catch {
    return c.json({ error: 'Company already blacklisted' }, 409)
  }
  if (!result) {
    return c.json({ error: 'Company already blacklisted' }, 409)
  }
  return c.json(result, 201)
})

app.delete('/:id', (c) => {
  const userId = c.get('userId')
  const rawId = Number(c.req.param('id'))
  if (!Number.isInteger(rawId) || rawId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  const entry = db.select().from(companyBlacklist).where(eq(companyBlacklist.id, rawId)).get()
  if (!entry || entry.userId !== userId) {
    return c.json({ error: 'Not found' }, 404)
  }
  db.delete(companyBlacklist).where(eq(companyBlacklist.id, rawId)).run()
  return c.body(null, 204)
})

export default app
