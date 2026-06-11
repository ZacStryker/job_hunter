import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { profileDataInputSchema, profileDataSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

const EMPTY_PROFILE_DATA = {
  personal: {
    fullName: '',
    email: '',
    phone: null,
    location: null,
    summary: null,
    skills: null,
    websites: [],
  },
  experience: {
    jobs: [],
    education: [],
    projects: [],
    certifications: [],
    licences: [],
    awards: [],
  },
}

app.get('/', (c) => {
  const userId = c.get('userId')
  const row = db.select().from(profile).where(eq(profile.userId, userId)).get()
  if (!row?.profileData) return c.json(EMPTY_PROFILE_DATA)
  try {
    const parsed = profileDataSchema.safeParse(JSON.parse(row.profileData))
    return c.json(parsed.success ? parsed.data : EMPTY_PROFILE_DATA)
  } catch {
    return c.json(EMPTY_PROFILE_DATA)
  }
})

app.put('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = profileDataInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }

  db.insert(profile)
    .values({ userId, profileData: JSON.stringify(parsed.data) })
    .onConflictDoUpdate({
      target: profile.userId,
      set: { profileData: JSON.stringify(parsed.data) },
    })
    .run()

  return c.json(parsed.data)
})

export default app
