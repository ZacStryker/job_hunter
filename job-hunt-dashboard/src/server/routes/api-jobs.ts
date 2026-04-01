import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs } from '../../db/schema'

const app = new Hono()

app.get('/', (c) => {
  const allJobs = db.select().from(jobs).all()
  return c.json({ jobs: allJobs })
})

export default app
