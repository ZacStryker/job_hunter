import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, and, inArray, sql, isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, statusEvents, coverLetters, messages } from '../../db/schema'
import { callN8nWebhook } from '../services/cover-letter-service'
import { callResumeWebhook } from '../services/resume-service'
import { recordRun } from './api-webhook-runs'
import type { Job } from '../../shared/schemas'

const app = new Hono()

const STATUS_OVERRIDE_VALUES = ['phone_screen', 'interview', 'technical', 'offer', 'rejected', 'withdrawn', 'ghosted'] as const

const jobPatchSchema = z.object({
  applied: z.boolean().optional(),
  statusOverride: z.enum(STATUS_OVERRIDE_VALUES).nullable().optional(),
  archived: z.boolean().optional(),
})

app.get('/', (c) => {
  const allJobs = db.select().from(jobs).all()
  const allMessages = db.select({
    company: messages.company,
    jobTitle: messages.jobTitle,
    type: messages.type,
    receivedAt: messages.receivedAt,
  }).from(messages).where(isNotNull(messages.type)).all()

  const latestMessageByKey = new Map<string, { type: string; receivedAt: string }>()
  for (const msg of allMessages) {
    if (!msg.company || !msg.jobTitle) continue
    const key = `${msg.company.toLowerCase()}|||${msg.jobTitle.toLowerCase()}`
    const existing = latestMessageByKey.get(key)
    if (!existing || msg.receivedAt > existing.receivedAt) {
      latestMessageByKey.set(key, { type: msg.type!, receivedAt: msg.receivedAt })
    }
  }

  const jobsWithLatestStatus = allJobs.map((job) => {
    const key = `${job.company.toLowerCase()}|||${job.jobTitle.toLowerCase()}`
    return {
      ...job,
      latestStatus: latestMessageByKey.get(key)?.type ?? null,
    }
  })

  return c.json({ jobs: jobsWithLatestStatus })
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

  const manualEvents = db
    .select()
    .from(statusEvents)
    .where(and(eq(statusEvents.jobId, rawId), eq(statusEvents.source, 'manual')))
    .all()

  const matchedMessages = db
    .select()
    .from(messages)
    .where(and(
      sql`lower(${messages.company}) = lower(${job.company})`,
      sql`lower(${messages.jobTitle}) = lower(${job.jobTitle})`,
      isNotNull(messages.type),
    ))
    .all()

  // Use negative IDs to avoid collisions with statusEvents integer PKs (both start at 1)
  const emailEvents = matchedMessages.map((m) => ({
    id: -m.id,
    jobId: rawId,
    status: m.type!,
    timestamp: m.receivedAt,
    source: 'email' as const,
    emailSubject: m.subject || undefined,
    emailSender: m.fromAddress || undefined,
  }))

  const events = [...manualEvents, ...emailEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return c.json({ events })
})

const bulkArchiveSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'No ids provided'),
})

app.post('/bulk-archive', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = bulkArchiveSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }

  const { ids } = parsed.data
  const archived = db.transaction((tx) => {
    const matching = tx.select({ id: jobs.id }).from(jobs).where(inArray(jobs.id, ids)).all()
    tx.update(jobs).set({ archived: true }).where(inArray(jobs.id, ids)).run()
    return matching.length
  })

  return c.json({ archived })
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
  const hasFields = patch.applied !== undefined || patch.statusOverride !== undefined || patch.archived !== undefined
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
  if (patch.archived !== undefined) updateFields.archived = patch.archived

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
    recordRun({ name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message })
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

  recordRun({ name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1 })
  return c.json({ coverLetter: inserted })
})

app.post('/:id/generate-resume', async (c) => {
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

  try {
    await callResumeWebhook(job as Job)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'N8N_RESUME_WEBHOOK_URL not configured') {
      return c.json({ error: 'Resume generation is not configured' }, 503)
    }
    recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message })
    return c.json({ error: 'Resume generation failed' }, 502)
  }

  recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1 })
  return c.json({ ok: true })
})

app.get('/:id/cover-letter', async (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const letter = db.select().from(coverLetters)
    .where(eq(coverLetters.jobId, rawId))
    .orderBy(desc(coverLetters.createdAt))
    .get()

  if (!letter) {
    return c.json({ error: 'No cover letter found' }, 404)
  }

  return c.json({ coverLetter: letter })
})

export default app
