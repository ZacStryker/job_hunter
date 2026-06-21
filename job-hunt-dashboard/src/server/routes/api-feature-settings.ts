import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { featureSettings } from '../../db/schema'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/', (c) => {
  const row = db.select().from(featureSettings)
    .where(eq(featureSettings.feature, 'emailFeatures'))
    .get()
  return c.json({ emailFeatures: row?.enabled === true })
})

export default app
