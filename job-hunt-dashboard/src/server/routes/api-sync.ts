import { Hono } from 'hono'
import { fetchJobsFromSheets } from '../services/sheets-sync'
import { ingestJobs } from '../services/ingest-service'

const app = new Hono()

app.post('/', async (c) => {
  const jobs = await fetchJobsFromSheets()
  const result = ingestJobs(jobs)
  return c.json(result)
})

export default app
