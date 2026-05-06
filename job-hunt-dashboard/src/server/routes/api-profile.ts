import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { profileInputSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

const EMPTY_PROFILE = {
  id: null,
  name: null,
  email: null,
  phone: null,
  location: null,
  linkedinUrl: null,
  githubUrl: null,
  summary: null,
  experience: null,
  skills: null,
  education: null,
}

app.get('/', (c) => {
  const userId = c.get('userId')
  const row = db.select().from(profile).where(eq(profile.userId, userId)).get()
  return c.json(row ?? EMPTY_PROFILE)
})

app.put('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = profileInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }

  const input = parsed.data
  const row = db.insert(profile)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: profile.userId, set: input })
    .returning()
    .get()

  return c.json(row)
})

export default app
