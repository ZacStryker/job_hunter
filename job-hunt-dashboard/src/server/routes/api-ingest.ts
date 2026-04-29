import { Hono } from 'hono'
import { ingestPayloadSchema } from '../../shared/schemas'
import { ingestJobs } from '../services/ingest-service'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = ingestPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400)
  }

  const userId = c.get('userId')
  const result = ingestJobs(parsed.data, userId)
  return c.json(result)
})

export default app
