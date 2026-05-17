import { Hono } from 'hono'
import { db } from '../../db/client'
import { sourceSettings } from '../../db/schema'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/', (c) => {
  const rows = db.select().from(sourceSettings).all()
  return c.json(rows)
})

export default app
