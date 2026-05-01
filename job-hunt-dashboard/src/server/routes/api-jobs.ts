import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, and, inArray, sql, isNotNull } from 'drizzle-orm'
import { mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../../db/client'
import { jobs, statusEvents, coverLetters, messages, profile } from '../../db/schema'
import { generateCoverLetter } from '../services/cover-letter-service'
import { generateResume } from '../services/resume-service'
import { recordRun } from './api-webhook-runs'
import type { Job } from '../../shared/schemas'
import type { AppEnv } from '../types'

// USD per token (per-million prices / 1_000_000)
const SONNET_4_6_INPUT = 3 / 1_000_000
const SONNET_4_6_OUTPUT = 15 / 1_000_000

const app = new Hono<AppEnv>()

const STATUS_OVERRIDE_VALUES = ['phone_screen', 'interview', 'technical', 'offer', 'rejected', 'withdrawn', 'ghosted'] as const

const jobPatchSchema = z.object({
  applied: z.boolean().optional(),
  statusOverride: z.enum(STATUS_OVERRIDE_VALUES).nullable().optional(),
  archived: z.boolean().optional(),
})

app.get('/', (c) => {
  const userId = c.get('userId')
  const allJobs = db.select().from(jobs).where(eq(jobs.userId, userId)).all()
  const allMessages = db.select({
    company: messages.company,
    jobTitle: messages.jobTitle,
    type: messages.type,
    receivedAt: messages.receivedAt,
  }).from(messages).where(and(isNotNull(messages.type), eq(messages.userId, userId))).all()

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

app.get('/:id', (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select({
    company: jobs.company,
    jobTitle: jobs.jobTitle,
    location: jobs.location,
    jobDescription: jobs.jobDescription,
  }).from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()

  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  return c.json({ job })
})

app.get('/:id/events', (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
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
      eq(messages.userId, userId),
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

const scrapeUrlSchema = z.object({ url: z.string().url() })

function detectSource(rawUrl: string): 'linkedin' | 'indeed' | 'indeed_nl' | null {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, '')
    if (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')) return 'linkedin'
    if (hostname === 'nl.indeed.com') return 'indeed_nl'
    if (hostname === 'indeed.com' || hostname.endsWith('.indeed.com')) return 'indeed'
    return null
  } catch { return null }
}

app.post('/scrape-url', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = scrapeUrlSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid URL' }, 400)

  const { url } = parsed.data

  const scraperUrl = process.env.SCRAPER_URL
  if (!scraperUrl) return c.json({ error: 'Scraper not available' }, 503)

  const source = detectSource(url)
  if (!source) return c.json({ error: 'Unsupported URL source' }, 422)

  try {
    const res = await fetch(`${scraperUrl}/scrape/job-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, url }),
      signal: AbortSignal.timeout(40_000),
    })
    if (!res.ok) return c.json({ error: 'Scrape failed' }, 502)

    const data = await res.json() as { company: string | null; jobTitle: string | null; location: string | null }
    if (!data.company || !data.jobTitle) return c.json({ error: 'Could not extract job details' }, 422)

    return c.json({ company: data.company, jobTitle: data.jobTitle, location: data.location ?? null })
  } catch {
    return c.json({ error: 'Scrape failed' }, 502)
  }
})

const manualJobSchema = z.object({
  company: z.string().min(1),
  jobTitle: z.string().min(1),
  location: z.string().optional(),
  sourceUrl: z.string().url(),
})

app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = manualJobSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const { company, jobTitle, location, sourceUrl } = parsed.data
  const locationValue = location?.trim() || null

  const existing = db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.company, company), eq(jobs.jobTitle, jobTitle), eq(jobs.userId, userId))).get()
  if (existing) return c.json({ error: 'Job already exists' }, 409)

  const dateScraped = new Date().toISOString()
  db.insert(jobs).values({
    company, jobTitle,
    location: locationValue,
    sourceUrl,
    source: 'Manual',
    analysisStatus: 'pending',
    dateScraped,
    userId,
  }).run()

  const created = db.select().from(jobs)
    .where(and(eq(jobs.company, company), eq(jobs.jobTitle, jobTitle), eq(jobs.userId, userId))).get()
  if (!created) return c.json({ error: 'Failed to retrieve created job' }, 500)
  return c.json({ job: created }, 201)
})

app.post('/bulk-archive', async (c) => {
  const userId = c.get('userId')
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
    const matching = tx.select({ id: jobs.id }).from(jobs)
      .where(and(inArray(jobs.id, ids), eq(jobs.userId, userId))).all()
    tx.update(jobs).set({ archived: true })
      .where(and(inArray(jobs.id, ids), eq(jobs.userId, userId))).run()
    return matching.length
  })

  return c.json({ archived })
})

app.patch('/:id', async (c) => {
  const userId = c.get('userId')
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

  const existing = db.select().from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!existing) {
    return c.json({ error: 'Not found' }, 404)
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

  db.update(jobs).set(updateFields).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).run()

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

  const updatedJob = db.select().from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  return c.json({ job: updatedJob })
})

app.post('/:id/generate-cover-letter', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }
  if (!job.jobDescription) {
    return c.json({ error: 'Job has no job description' }, 400)
  }

  const startMs = Date.now()
  let coverLetterResult: { content: string; pdf: Buffer; inputTokens: number; outputTokens: number }
  try {
    coverLetterResult = await generateCoverLetter(job as Job, userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'ANTHROPIC_API_KEY not configured') {
      return c.json({ error: 'Cover letter generation is not configured' }, 503)
    }
    recordRun({ name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - startMs })
    return c.json({ error: 'Cover letter generation failed' }, 502)
  }

  const { content: coverLetterText, pdf: coverLetterPdf, inputTokens: clInputTokens, outputTokens: clOutputTokens } = coverLetterResult
  const clCostUsd = clInputTokens * SONNET_4_6_INPUT + clOutputTokens * SONNET_4_6_OUTPUT
  const now = new Date().toISOString()

  const clDir = join(process.cwd(), 'data', 'cover-letters')
  const finalPath = join(clDir, `${rawId}.pdf`)
  const tmpPath = join(clDir, `${rawId}.pdf.tmp`)
  try {
    mkdirSync(clDir, { recursive: true })
    await Bun.write(tmpPath, coverLetterPdf)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    recordRun({ name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - startMs })
    return c.json({ error: 'Cover letter generation failed' }, 502)
  }

  try {
    db.transaction((tx) => {
      tx.insert(coverLetters).values({
        jobId: rawId,
        userId,
        content: coverLetterText,
        createdAt: now,
      }).run()
      tx.update(jobs).set({ coverLetterSentAt: now }).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).run()
    })
  } catch {
    return c.json({ error: 'Failed to store cover letter' }, 500)
  }

  try {
    renameSync(tmpPath, finalPath)
  } catch (err) {
    console.error('Failed to finalize cover letter PDF:', err)
  }

  const inserted = db.select().from(coverLetters)
    .where(and(eq(coverLetters.jobId, rawId), eq(coverLetters.createdAt, now), eq(coverLetters.userId, userId)))
    .get()

  recordRun({ name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1,
    durationMs: Date.now() - startMs, inputTokens: clInputTokens, outputTokens: clOutputTokens, costUsd: clCostUsd })
  return c.json({ coverLetter: inserted })
})

app.post('/:id/generate-resume', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }
  if (!job.jobDescription) {
    return c.json({ error: 'Job has no job description' }, 400)
  }

  const resumeStartMs = Date.now()
  let resumeResult: { pdf: Buffer; inputTokens: number; outputTokens: number }
  try {
    resumeResult = await generateResume(job as Job, userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'ANTHROPIC_API_KEY not configured') {
      return c.json({ error: 'Resume generation is not configured' }, 503)
    }
    recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - resumeStartMs })
    return c.json({ error: 'Resume generation failed' }, 502)
  }

  const { pdf: pdfBuffer, inputTokens: resumeInputTokens, outputTokens: resumeOutputTokens } = resumeResult
  const resumeCostUsd = resumeInputTokens * SONNET_4_6_INPUT + resumeOutputTokens * SONNET_4_6_OUTPUT

  const profileRow = db.select().from(profile).limit(1).get()
  const candidateName = profileRow?.name ?? 'Resume'
  const fileName = `${candidateName} - Resume - ${job.company} - ${job.jobTitle}.pdf`
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

  // Persist PDF to disk (atomic: write to temp then rename)
  try {
    const resumesDir = join(process.cwd(), 'data', 'resumes')
    mkdirSync(resumesDir, { recursive: true })
    const finalPath = join(resumesDir, `${rawId}.pdf`)
    const tmpPath = join(resumesDir, `${rawId}.pdf.tmp`)
    await Bun.write(tmpPath, pdfBuffer)
    renameSync(tmpPath, finalPath)
    db.update(jobs).set({ resumeGeneratedAt: new Date().toISOString() }).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).run()
  } catch (err) {
    console.error('Failed to persist resume PDF:', err)
    // Non-fatal — user still gets their download
  }

  recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1,
    durationMs: Date.now() - resumeStartMs, inputTokens: resumeInputTokens, outputTokens: resumeOutputTokens, costUsd: resumeCostUsd })
  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
})

app.get('/:id/resume', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const resumePath = join(process.cwd(), 'data', 'resumes', `${rawId}.pdf`)
  let pdfBuffer: ArrayBuffer
  try {
    pdfBuffer = await Bun.file(resumePath).arrayBuffer()
  } catch {
    return c.json({ error: 'Resume not found' }, 404)
  }
  const profileRow = db.select().from(profile).limit(1).get()
  const candidateName = profileRow?.name ?? 'Resume'
  const fileName = `${candidateName} - Resume - ${job.company} - ${job.jobTitle}.pdf`
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  })
})

app.get('/:id/cover-letter', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const letter = db.select().from(coverLetters)
    .where(and(eq(coverLetters.jobId, rawId), eq(coverLetters.userId, userId)))
    .orderBy(desc(coverLetters.createdAt))
    .get()

  if (!letter) {
    return c.json({ error: 'No cover letter found' }, 404)
  }

  return c.json({ coverLetter: letter })
})

app.get('/:id/cover-letter/pdf', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const pdfPath = join(process.cwd(), 'data', 'cover-letters', `${rawId}.pdf`)
  let pdfBuffer: ArrayBuffer
  try {
    pdfBuffer = await Bun.file(pdfPath).arrayBuffer()
  } catch {
    return c.json({ error: 'Cover letter PDF not found' }, 404)
  }

  const profileRow = db.select().from(profile).limit(1).get()
  const candidateName = profileRow?.name ?? 'Cover Letter'
  const fileName = `${candidateName} - Cover Letter - ${job.company} - ${job.jobTitle}.pdf`
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  })
})

export default app
