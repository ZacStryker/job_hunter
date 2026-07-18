import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { searchConfigs } from '../../db/schema'
import { searchConfigInputSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/', (c) => {
  const userId = c.get('userId')
  const rows = db.select().from(searchConfigs).where(eq(searchConfigs.userId, userId)).all()
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
  const parsed = searchConfigInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }
  const { source, query, location } = parsed.data
  const country = parsed.data.country ?? null
  const city = parsed.data.city ?? null
  const result = db.insert(searchConfigs).values({ source, query, location, country, city, userId }).returning().get()
  return c.json(result, 201)
})

app.put('/:id', async (c) => {
  const userId = c.get('userId')
  const rawId = Number(c.req.param('id'))
  if (!Number.isInteger(rawId) || rawId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = searchConfigInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }
  const { source, query, location } = parsed.data
  const country = parsed.data.country ?? null
  const city = parsed.data.city ?? null
  const result = db
    .update(searchConfigs)
    .set({ source, query, location, country, city })
    .where(and(eq(searchConfigs.id, rawId), eq(searchConfigs.userId, userId)))
    .returning()
    .get()
  if (!result) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(result)
})

app.delete('/:id', (c) => {
  const userId = c.get('userId')
  const rawId = Number(c.req.param('id'))
  if (!Number.isInteger(rawId) || rawId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  const result = db.delete(searchConfigs)
    .where(and(eq(searchConfigs.id, rawId), eq(searchConfigs.userId, userId)))
    .returning({ id: searchConfigs.id })
    .get()
  if (!result) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json({ id: result.id })
})

export default app
