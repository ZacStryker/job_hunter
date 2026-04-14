import { Hono } from 'hono'
import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { profileInputSchema } from '../../shared/schemas'

const app = new Hono()

const EMPTY_PROFILE = {
  id: 1,
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
  const rows = db.select().from(profile).limit(1).all()
  const row = rows[0] ?? EMPTY_PROFILE
  return c.json(row)
})

app.put('/', async (c) => {
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
  db.insert(profile)
    .values({ id: 1, ...input })
    .onConflictDoUpdate({ target: profile.id, set: input })
    .run()

  return c.json({ id: 1, ...input })
})

export default app
