import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { gmailLabelMappings } from '../../db/schema'
import { gmailLabelMappingInputSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/', (c) => {
  const userId = c.get('userId')
  const rows = db.select().from(gmailLabelMappings).where(eq(gmailLabelMappings.userId, userId)).all()
  return c.json(rows)
})

app.put('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = gmailLabelMappingInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  const now = new Date().toISOString()
  try {
    db.transaction((tx) => {
      tx.delete(gmailLabelMappings).where(eq(gmailLabelMappings.userId, userId)).run()
      for (const row of parsed.data) {
        tx.insert(gmailLabelMappings).values({ userId, label: row.label, jobStatus: row.jobStatus, createdAt: now }).run()
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save mappings'
    return c.json({ error: msg }, 500)
  }
  const result = db.select().from(gmailLabelMappings).where(eq(gmailLabelMappings.userId, userId)).all()
  return c.json(result)
})

export default app
