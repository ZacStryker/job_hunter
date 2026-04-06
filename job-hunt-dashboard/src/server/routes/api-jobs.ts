import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, statusEvents, coverLetters } from '../../db/schema'
import { callN8nWebhook } from '../services/cover-letter-service'
import type { Job } from '../../shared/schemas'

const app = new Hono()

const STATUS_OVERRIDE_VALUES = ['phone_screen', 'interview', 'technical', 'offer', 'rejected', 'withdrawn', 'ghosted'] as const

const jobPatchSchema = z.object({
  applied: z.boolean().optional(),
  statusOverride: z.enum(STATUS_OVERRIDE_VALUES).nullable().optional(),
})

app.get('/', (c) => {
  const allJobs = db.select().from(jobs).all()
  return c.json({ jobs: allJobs })
})

app.get('/:id/events', (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const events = db
    .select()
    .from(statusEvents)
    .where(eq(statusEvents.jobId, rawId))
    .orderBy(desc(statusEvents.timestamp))
    .all()

  return c.json({ events })
})

app.patch('/:id', async (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = jobPatchSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }

  const patch = parsed.data
  const hasFields = patch.applied !== undefined || patch.statusOverride !== undefined
  if (!hasFields) {
    return c.json({ error: 'No updatable fields provided' }, 400)
  }

  const existing = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  if (!existing) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const updateFields: Partial<typeof jobs.$inferInsert> = {}
  if (patch.applied !== undefined) {
    updateFields.applied = patch.applied
    if (patch.applied && !existing.dateApplied) {
      updateFields.dateApplied = new Date().toISOString().split('T')[0]
    } else if (!patch.applied) {
      updateFields.dateApplied = null
    }
  }
  if (patch.statusOverride !== undefined) updateFields.statusOverride = patch.statusOverride

  db.update(jobs).set(updateFields).where(eq(jobs.id, rawId)).run()

  if (
    patch.statusOverride !== undefined &&
    patch.statusOverride !== null &&
    patch.statusOverride !== existing.statusOverride
  ) {
    db.insert(statusEvents).values({
      jobId: rawId,
      status: patch.statusOverride,
      timestamp: new Date().toISOString(),
    }).run()
  }

  const updatedJob = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  return c.json({ job: updatedJob })
})

app.post('/:id/generate-cover-letter', async (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }
  if (!job.jobDescription) {
    return c.json({ error: 'Job has no job description' }, 400)
  }

  let coverLetterText: string
  try {
    coverLetterText = await callN8nWebhook(job as Job)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'N8N_WEBHOOK_URL not configured') {
      return c.json({ error: 'Cover letter generation is not configured' }, 503)
    }
    return c.json({ error: 'Cover letter generation failed' }, 502)
  }

  const now = new Date().toISOString()

  try {
    db.transaction((tx) => {
      tx.insert(coverLetters).values({
        jobId: rawId,
        content: coverLetterText,
        createdAt: now,
      }).run()
      tx.update(jobs).set({ coverLetterSentAt: now }).where(eq(jobs.id, rawId)).run()
    })
  } catch {
    return c.json({ error: 'Failed to store cover letter' }, 500)
  }

  const inserted = db.select().from(coverLetters)
    .where(and(eq(coverLetters.jobId, rawId), eq(coverLetters.createdAt, now)))
    .get()

  return c.json({ coverLetter: inserted })
})

export default app
