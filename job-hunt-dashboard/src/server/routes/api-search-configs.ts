import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { searchConfigs } from '../../db/schema'
import { searchConfigInputSchema } from '../../shared/schemas'

const app = new Hono()

app.get('/', (c) => {
  const rows = db.select().from(searchConfigs).all()
  return c.json(rows)
})

app.post('/', async (c) => {
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
  const result = db.insert(searchConfigs).values({ source, query, location }).returning().get()
  return c.json(result, 201)
})

app.put('/:id', async (c) => {
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
  const result = db
    .update(searchConfigs)
    .set({ source, query, location })
    .where(eq(searchConfigs.id, rawId))
    .returning()
    .get()
  if (!result) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(result)
})

app.delete('/:id', (c) => {
  const rawId = parseInt(c.req.param('id'), 10)
  if (isNaN(rawId)) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  const result = db.delete(searchConfigs).where(eq(searchConfigs.id, rawId)).returning({ id: searchConfigs.id }).get()
  if (!result) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json({ id: result.id })
})

export default app
