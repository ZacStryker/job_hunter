import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, and, inArray, sql, isNotNull } from 'drizzle-orm'
import { mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { db } from '../../db/client'
import { jobs, statusEvents, coverLetters, resumes, messages, profile } from '../../db/schema'
import { generateCoverLetter, renderCoverLetterPdf } from '../services/cover-letter-service'
import { generateResume, renderResumePdf, readResumeTemplate } from '../services/resume-service'
import { recordRun } from './api-webhook-runs'
import { activityRegistry } from '../services/activity-registry'
import { coverLetterEditSchema, profileDataSchema, resumeEditSchema, resumeDataSchema, title02Violation } from '../../shared/schemas'
import type { Job, ProfileData, ResumeData } from '../../shared/schemas'
import type { AppEnv } from '../types'

const EMPTY_PROFILE_DATA: ProfileData = {
  personal: { fullName: '', email: '', phone: null, location: null, summary: null, skills: null, websites: [] },
  experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] },
}

function parseProfileData(raw: string | null | undefined): ProfileData {
  if (!raw) return EMPTY_PROFILE_DATA
  try {
    const p = profileDataSchema.safeParse(JSON.parse(raw))
    return p.success ? p.data : EMPTY_PROFILE_DATA
  } catch { return EMPTY_PROFILE_DATA }
}

const DATA_DIR = join(import.meta.dirname, '../../../data')

// USD per token (per-million prices / 1_000_000)
const SONNET_4_6_INPUT = 3 / 1_000_000
const SONNET_4_6_OUTPUT = 15 / 1_000_000

const app = new Hono<AppEnv>()

const STATUS_OVERRIDE_VALUES = ['screening', 'interview', 'offer', 'rejected', 'other'] as const

const jobPatchSchema = z.object({
  applied: z.boolean().optional(),
  statusOverride: z.enum(STATUS_OVERRIDE_VALUES).nullable().optional(),
  archived: z.boolean().optional(),
  jobDescription: z.string().max(100_000).nullable().optional(),
  generationContext: z.string().max(5_000).nullable().optional(),
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
  sourceUrl: z.string().url().nullable().optional(),
  description: z.string().refine(s => s.trim().length > 0, { message: 'description must not be blank' }).nullable().optional(),
}).refine(d => !!(d.sourceUrl || d.description), { message: 'sourceUrl or description is required' })

app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = manualJobSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const { company, jobTitle, location, sourceUrl, description } = parsed.data
  const locationValue = location?.trim() || null

  const existing = db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.company, company), eq(jobs.jobTitle, jobTitle), eq(jobs.userId, userId))).get()
  if (existing) return c.json({ error: 'Job already exists' }, 409)

  const dateScraped = new Date().toISOString()
  db.insert(jobs).values({
    company, jobTitle,
    location: locationValue,
    sourceUrl: sourceUrl ?? null,
    jobDescription: description?.trim() || null,
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
    tx.update(jobs).set({ archived: true, dateArchived: new Date().toISOString() })
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
  const hasFields = patch.applied !== undefined || patch.statusOverride !== undefined || patch.archived !== undefined || patch.jobDescription !== undefined || patch.generationContext !== undefined
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
      const now = new Date().toISOString()
      updateFields.dateApplied = now.split('T')[0]
      updateFields.appliedAt = now
    } else if (!patch.applied) {
      updateFields.dateApplied = null
      updateFields.appliedAt = null
    }
  }
  if (patch.statusOverride !== undefined) updateFields.statusOverride = patch.statusOverride
  if (patch.archived !== undefined) {
    updateFields.archived = patch.archived
    if (patch.archived && !existing.archived) {
      updateFields.dateArchived = new Date().toISOString()
    } else if (!patch.archived) {
      updateFields.dateArchived = null
    }
  }
  if (patch.jobDescription !== undefined) updateFields.jobDescription = patch.jobDescription
  if (patch.generationContext !== undefined) {
    updateFields.generationContext = patch.generationContext?.trim() || null
  }

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

  const runId = activityRegistry.register({ userId, type: 'cover_letter', progress: { company: job.company, role: job.jobTitle } })
  let outcome: 'done' | 'failed' = 'failed'
  try {
    const startMs = Date.now()
    let coverLetterResult: { content: string; pdf: Buffer; inputTokens: number; outputTokens: number }
    try {
      coverLetterResult = await generateCoverLetter(job as unknown as Job, userId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'ANTHROPIC_API_KEY not configured') {
        return c.json({ error: 'Cover letter generation is not configured' }, 503)
      }
      recordRun({ userId, name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - startMs })
      return c.json({ error: 'Cover letter generation failed' }, 502)
    }

    const { content: coverLetterText, pdf: coverLetterPdf, inputTokens: clInputTokens, outputTokens: clOutputTokens } = coverLetterResult
    const clCostUsd = clInputTokens * SONNET_4_6_INPUT + clOutputTokens * SONNET_4_6_OUTPUT
    const now = new Date().toISOString()

    const clDir = join(DATA_DIR, 'cover-letters')
    const finalPath = join(clDir, `${rawId}.pdf`)
    const tmpPath = join(clDir, `${rawId}.pdf.tmp`)
    try {
      mkdirSync(clDir, { recursive: true })
      await Bun.write(tmpPath, coverLetterPdf)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      recordRun({ userId, name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - startMs })
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

    recordRun({ userId, name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1,
      durationMs: Date.now() - startMs, inputTokens: clInputTokens, outputTokens: clOutputTokens, costUsd: clCostUsd })
    outcome = 'done'
    return c.json({ coverLetter: inserted })
  } finally {
    activityRegistry.finalize(runId, outcome)
  }
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

  const runId = activityRegistry.register({ userId, type: 'resume', progress: { company: job.company, role: job.jobTitle } })
  let outcome: 'done' | 'failed' = 'failed'
  try {
    const resumeStartMs = Date.now()
    let resumeResult: { data: ResumeData; pdf: Buffer; inputTokens: number; outputTokens: number }
    try {
      resumeResult = await generateResume(job as unknown as Job, userId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'ANTHROPIC_API_KEY not configured') {
        return c.json({ error: 'Resume generation is not configured' }, 503)
      }
      recordRun({ userId, name: `Resume - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - resumeStartMs })
      return c.json({ error: message }, 502)
    }

    const { pdf: pdfBuffer, inputTokens: resumeInputTokens, outputTokens: resumeOutputTokens } = resumeResult
    const resumeCostUsd = resumeInputTokens * SONNET_4_6_INPUT + resumeOutputTokens * SONNET_4_6_OUTPUT

    const profileRow = db.select({ profileData: profile.profileData }).from(profile).where(eq(profile.userId, userId)).get()
    const candidateName = parseProfileData(profileRow?.profileData).personal.fullName || 'Resume'
    const fileName = `${candidateName} - Resume - ${job.company} - ${job.jobTitle}.pdf`
      .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

    // Generate now goes through the SAME write helper as edit and restore. That is what makes the
    // history real — the validated JSON is persisted instead of discarded — and it INSERTs rather
    // than overwriting, so Regenerate is no longer a one-way door: the resume you just rerolled away
    // from is still in the version list and still restorable.
    //
    // It also retires, for resumes, the tmp-path race deferred from the G2 review: the old block
    // here used a per-JOB `${rawId}.pdf.tmp` and bumped resumeGeneratedAt outside a transaction, and
    // it swallowed a failed rename — returning 200 while the PDF on disk was the previous render.
    const written = await writeResumeVersion(rawId, userId, resumeResult.data, 'generated', pdfBuffer)
    if (!written.ok) {
      recordRun({ userId, name: `Resume - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: written.error, durationMs: Date.now() - resumeStartMs })
      return c.json({ error: written.error }, written.status)
    }

    recordRun({ userId, name: `Resume - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1,
      durationMs: Date.now() - resumeStartMs, inputTokens: resumeInputTokens, outputTokens: resumeOutputTokens, costUsd: resumeCostUsd })
    outcome = 'done'
    // Node Buffer is not a BodyInit; view the same bytes without copying.
    const pdfBytes = new Uint8Array(pdfBuffer.buffer as ArrayBuffer, pdfBuffer.byteOffset, pdfBuffer.byteLength)
    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } finally {
    activityRegistry.finalize(runId, outcome)
  }
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

  const resumePath = join(DATA_DIR, 'resumes', `${rawId}.pdf`)
  let pdfBuffer: ArrayBuffer
  try {
    pdfBuffer = await Bun.file(resumePath).arrayBuffer()
  } catch {
    return c.json({ error: 'Resume not found' }, 404)
  }
  const profileRow = db.select({ profileData: profile.profileData }).from(profile).where(eq(profile.userId, userId)).get()
  const candidateName = parseProfileData(profileRow?.profileData).personal.fullName || 'Resume'
  const fileName = `${candidateName} - Resume - ${job.company} - ${job.jobTitle}.pdf`
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  })
})

// Writes a new version of a job's resume: renders the PDF, INSERTs an append-only row, and bumps
// jobs.resumeGeneratedAt. Shared by generate, edit and restore — the only difference between them is
// where `data` and `source` come from.
//
// The bump is NOT bookkeeping. Until this change the resume had NO cache-buster at all: the drawer's
// Download href and preview iframe pointed at a bare /api/jobs/:id/resume and the route sends no
// ETag, Last-Modified or Cache-Control. Both URLs now carry `?t=${job.resumeGeneratedAt}`, so a
// re-render that leaves the column untouched serves the user the PREVIOUS pdf and looks exactly like
// the save was lost. Bumping in the SAME transaction as the INSERT is what keeps the row and the
// cache key from disagreeing.
//
// The PDF is one file per JOB, not per version: the row is the version, the file is merely the
// current render. Restore overwrites it, which is the point.
async function writeResumeVersion(
  rawId: number,
  userId: number,
  data: ResumeData,
  source: 'generated' | 'edited',
  // Generate has ALREADY paid for a chromium launch inside generateResume, so it hands the bytes in
  // rather than making us render the identical JSON a second time. Edit and restore omit it.
  prerendered?: Buffer
): Promise<{ ok: true; resume: typeof resumes.$inferSelect } | { ok: false; status: 500; error: string }> {
  let pdf: Buffer
  try {
    pdf = prerendered ?? await renderResumePdf(data)
  } catch {
    return { ok: false, status: 500, error: 'Failed to render resume' }
  }

  const now = new Date().toISOString()
  const resumesDir = join(DATA_DIR, 'resumes')
  const finalPath = join(resumesDir, `${rawId}.pdf`)
  // Per-WRITE tmp name, not per-job. Two writes for the same job can overlap (a double-clicked Save,
  // an edit racing a restore, either racing a Regenerate), and a shared `${rawId}.pdf.tmp` lets them
  // interleave: A writes tmp, B overwrites tmp, A renames B's bytes into place. The PDF on disk would
  // then belong to no row in the version list.
  const tmpPath = join(resumesDir, `${rawId}.${randomUUID()}.pdf.tmp`)
  const discardTmp = () => { try { unlinkSync(tmpPath) } catch { /* already gone */ } }

  try {
    mkdirSync(resumesDir, { recursive: true })
    await Bun.write(tmpPath, pdf)
  } catch {
    // Bun.write can fail PART-WAY (ENOSPC), so the tmp may exist. The name is a fresh UUID that
    // nothing else will ever reuse or overwrite, so without this it leaks forever — and the 500 we
    // return invites a retry that leaks another.
    discardTmp()
    return { ok: false, status: 500, error: 'Failed to render resume' }
  }

  let row: typeof resumes.$inferSelect | undefined
  let renamed = false
  try {
    db.transaction((tx) => {
      // Ownership is enforced HERE, not just in the callers. This is the shared write path for
      // generate, edit and restore; every caller checks first today, but the bump below is a scoped
      // UPDATE that silently affects zero rows if the job is not the caller's, so a future caller
      // that forgets would write a resumes row cross-linking one tenant's user_id to another
      // tenant's job_id and nothing would look wrong. The write helper is the right place for it.
      const owned = tx.select({ id: jobs.id }).from(jobs)
        .where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
      if (!owned) throw new Error('job not owned by user')

      // .returning() gives back the exact row just written. Re-selecting by createdAt would be
      // ambiguous the moment two writes for one job land in the same millisecond.
      row = tx.insert(resumes)
        .values({ jobId: rawId, userId, data: JSON.stringify(data), source, createdAt: now })
        .returning()
        .get()
      tx.update(jobs).set({ resumeGeneratedAt: now })
        .where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).run()

      // The rename is the transaction's LAST act, and it is INSIDE it deliberately.
      //
      // Committing first and renaming after (the cover letter's shape) means a failed rename returns
      // 500 while the row stays committed and the clock stays bumped: the version list then shows an
      // edit whose PDF was never written, and `?t=` cache-busts to the PREVIOUS render — the exact
      // "my edit vanished" failure this feature exists to prevent. The spec is explicit that a failed
      // rename must leave NO row committed and NO bump, so a throw here must roll both back.
      //
      // It also orders concurrent writes. The tmp name stops two writes clobbering each other's tmp
      // file, but it does not stop their COMMITS and their RENAMES from interleaving: A could commit,
      // B could commit, B could rename, then A's rename could overwrite B's bytes — leaving the
      // newest row pointing at an older render. This block is synchronous (bun:sqlite is sync, and
      // SQLite is single-writer), so commit order and rename order cannot diverge.
      renameSync(tmpPath, finalPath)
      renamed = true
    })
  } catch (err) {
    console.error('Failed to write resume version:', err)
    discardTmp()
    // If the rename threw, the transaction rolled back: no row, no bump, and the PDF on disk is
    // untouched. The user retries against genuinely unchanged state.
    return { ok: false, status: 500, error: renamed ? 'Failed to store resume' : 'Failed to save resume PDF' }
  }
  if (!row) {
    discardTmp()
    return { ok: false, status: 500, error: 'Failed to store resume' }
  }

  return { ok: true, resume: row }
}

// Parses a stored row's JSON back into ResumeData. Rows were validated against resumeDataSchema AS IT
// EXISTED WHEN WRITTEN, and this change TIGHTENED that schema (bounds, non-blank), so a legacy row
// may no longer conform. Parse on the way out and fail loudly rather than feeding non-conforming JSON
// to the template.
function parseStoredResume(raw: string): ResumeData | null {
  try {
    const parsed = resumeDataSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// The most recent version's JSON. Newest by createdAt DESC, id DESC — the id tiebreaker is not
// decoration: two writes landing in the same millisecond would otherwise order arbitrarily.
app.get('/:id/resume-data', async (c) => {
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

  const row = db.select().from(resumes)
    .where(and(eq(resumes.jobId, rawId), eq(resumes.userId, userId)))
    .orderBy(desc(resumes.createdAt), desc(resumes.id))
    .get()
  if (!row) {
    return c.json({ error: 'No resume found' }, 404)
  }

  const data = parseStoredResume(row.data)
  if (!data) {
    return c.json({ error: 'This resume version is no longer valid — regenerate it to make it editable' }, 422)
  }

  return c.json({ resume: { id: row.id, jobId: row.jobId, source: row.source, createdAt: row.createdAt, data } })
})

app.put('/:id/resume', async (c) => {
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

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // Validated BEFORE any Playwright launch. The bounds in resumeDataSchema are what stand between a
  // pasted 10 MB summary and a 15-second chromium hang, so this must reject first and render second.
  // The form is not the security boundary: a drifted client or a hand-rolled PUT must not be able to
  // write a blank, unbounded, or job-less resume.
  const parsed = resumeEditSchema.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    return c.json({ error: `Invalid resume: ${issues}` }, 400)
  }

  // A template RENDERING constraint, so it binds the user's typing exactly as it binds the model's.
  if (title02Violation(parsed.data.data.title_02)) {
    return c.json({ error: 'title_02 cannot contain "and" or "&" — it breaks template rendering' }, 400)
  }

  // This route EDITS; it does not create. Without an existing version there is nothing to have
  // edited, and letting the PUT through would mint a first resume tagged 'edited' that was never
  // generated. The editor already refuses to open in that state — the API must agree.
  const existing = db.select({ id: resumes.id }).from(resumes)
    .where(and(eq(resumes.jobId, rawId), eq(resumes.userId, userId)))
    .get()
  if (!existing) {
    return c.json({ error: 'No resume found' }, 404)
  }

  const result = await writeResumeVersion(rawId, userId, parsed.data.data, 'edited')
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json({ resume: { id: result.resume.id, source: result.resume.source, createdAt: result.resume.createdAt } })
})

app.get('/:id/resume/versions', async (c) => {
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

  // A job with no resume yet returns [], not a 404 — "no versions" is a valid answer to this
  // question. Note this is also the LEGACY state: a resume generated before this feature existed has
  // a PDF on disk and zero rows here.
  const versions = db.select({
    id: resumes.id,
    source: resumes.source,
    createdAt: resumes.createdAt,
  }).from(resumes)
    .where(and(eq(resumes.jobId, rawId), eq(resumes.userId, userId)))
    .orderBy(desc(resumes.createdAt), desc(resumes.id))
    .all()

  return c.json({ versions })
})

app.post('/:id/resume/versions/:versionId/restore', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  const versionParam = c.req.param('versionId')
  if (!/^\d+$/.test(idParam) || !/^\d+$/.test(versionParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  const versionId = Number(versionParam)
  if (rawId <= 0 || versionId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  // Scoped on BOTH userId and jobId. userId alone would let one of the caller's own jobs restore a
  // version belonging to a different one of their jobs.
  const version = db.select().from(resumes)
    .where(and(
      eq(resumes.id, versionId),
      eq(resumes.jobId, rawId),
      eq(resumes.userId, userId),
    ))
    .get()
  if (!version) {
    return c.json({ error: 'Version not found' }, 404)
  }

  // Re-validate on the way out: this row was written against the schema as it existed at the time,
  // and this change tightened it. Rendering non-conforming JSON would produce a garbled PDF; a 422
  // says plainly that this version cannot be brought back.
  const data = parseStoredResume(version.data)
  if (!data) {
    return c.json({ error: 'This resume version is no longer valid and cannot be restored — regenerate instead' }, 422)
  }

  // Restore COPIES forward into a new row. The table stays append-only and nothing is destroyed —
  // which is what makes editing safe enough to ship without a confirmation dialog.
  const result = await writeResumeVersion(rawId, userId, data, version.source)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json({ resume: { id: result.resume.id, source: result.resume.source, createdAt: result.resume.createdAt } })
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
    .orderBy(desc(coverLetters.createdAt), desc(coverLetters.id))
    .get()

  if (!letter) {
    return c.json({ error: 'No cover letter found' }, 404)
  }

  return c.json({ coverLetter: letter })
})

// Writes a new version of a job's cover letter: renders the PDF, INSERTs an append-only row, and
// bumps jobs.coverLetterSentAt. Shared by edit and restore — the only difference between them is
// where `content` and `source` come from.
//
// The bump is NOT bookkeeping. Both the drawer's preview iframe and the Download link cache-bust on
// `?t=${job.coverLetterSentAt}`, so a re-render that leaves the column untouched serves the user the
// PREVIOUS pdf and looks exactly like the save was lost.
//
// The PDF is one file per JOB, not per version: the row is the version, the file is merely the
// current render. Restore overwrites it, which is the point.
async function writeCoverLetterVersion(
  rawId: number,
  userId: number,
  content: string,
  source: 'generated' | 'edited'
): Promise<{ ok: true; letter: typeof coverLetters.$inferSelect } | { ok: false; status: 500; error: string }> {
  let pdf: Buffer
  try {
    pdf = await renderCoverLetterPdf(content, userId)
  } catch {
    return { ok: false, status: 500, error: 'Failed to render cover letter' }
  }

  const now = new Date().toISOString()
  const clDir = join(DATA_DIR, 'cover-letters')
  const finalPath = join(clDir, `${rawId}.pdf`)
  // Per-WRITE tmp name, not per-job. Two writes for the same job can overlap (a double-clicked Save,
  // an edit racing a restore, either racing a Regenerate), and a shared `${rawId}.pdf.tmp` lets them
  // interleave: A writes tmp, B overwrites tmp, A renames B's bytes into place. The PDF on disk would
  // then belong to no row in the version list.
  const tmpPath = join(clDir, `${rawId}.${randomUUID()}.pdf.tmp`)
  try {
    mkdirSync(clDir, { recursive: true })
    await Bun.write(tmpPath, pdf)
  } catch {
    return { ok: false, status: 500, error: 'Failed to render cover letter' }
  }

  const discardTmp = () => { try { unlinkSync(tmpPath) } catch { /* already gone */ } }

  let letter: typeof coverLetters.$inferSelect | undefined
  try {
    db.transaction((tx) => {
      // .returning() gives back the exact row just written. Re-selecting by createdAt would be
      // ambiguous the moment two writes for one job land in the same millisecond.
      letter = tx.insert(coverLetters)
        .values({ jobId: rawId, userId, content, source, createdAt: now })
        .returning()
        .get()
      tx.update(jobs).set({ coverLetterSentAt: now })
        .where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).run()
    })
  } catch {
    discardTmp()
    return { ok: false, status: 500, error: 'Failed to store cover letter' }
  }
  if (!letter) {
    discardTmp()
    return { ok: false, status: 500, error: 'Failed to store cover letter' }
  }

  try {
    renameSync(tmpPath, finalPath)
  } catch (err) {
    // Do NOT report success. The row is committed and coverLetterSentAt is bumped, so the client
    // would cache-bust to a PDF that is still the PREVIOUS render — the exact "my edit vanished"
    // failure this feature exists to prevent. Surfacing a 500 lets the user retry, which re-renders.
    console.error('Failed to finalize cover letter PDF:', err)
    discardTmp()
    return { ok: false, status: 500, error: 'Failed to save cover letter PDF' }
  }

  return { ok: true, letter }
}

app.put('/:id/cover-letter', async (c) => {
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

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = coverLetterEditSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid cover letter content' }, 400)
  }

  // This route EDITS; it does not create. Without an existing letter there is nothing to have
  // edited, and letting the PUT through would mint a first letter tagged 'edited' that was never
  // generated. The editor already refuses to open in that state — the API must agree.
  const existing = db.select({ id: coverLetters.id }).from(coverLetters)
    .where(and(eq(coverLetters.jobId, rawId), eq(coverLetters.userId, userId)))
    .get()
  if (!existing) {
    return c.json({ error: 'No cover letter found' }, 404)
  }

  const result = await writeCoverLetterVersion(rawId, userId, parsed.data.content, 'edited')
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json({ coverLetter: result.letter })
})

app.get('/:id/cover-letter/versions', async (c) => {
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

  // Newest first. id DESC is the tiebreaker, not decoration: an edit saved in the same millisecond
  // as a restore would otherwise order arbitrarily. A job with no letter yet returns [], not a 404 —
  // "no versions" is a valid answer to this question.
  const versions = db.select({
    id: coverLetters.id,
    source: coverLetters.source,
    createdAt: coverLetters.createdAt,
  }).from(coverLetters)
    .where(and(eq(coverLetters.jobId, rawId), eq(coverLetters.userId, userId)))
    .orderBy(desc(coverLetters.createdAt), desc(coverLetters.id))
    .all()

  return c.json({ versions })
})

app.post('/:id/cover-letter/versions/:versionId/restore', async (c) => {
  const userId = c.get('userId')
  const idParam = c.req.param('id')
  const versionParam = c.req.param('versionId')
  if (!/^\d+$/.test(idParam) || !/^\d+$/.test(versionParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  const versionId = Number(versionParam)
  if (rawId <= 0 || versionId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.id, rawId), eq(jobs.userId, userId))).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  // Scoped on BOTH userId and jobId. userId alone would let one of the caller's own jobs restore a
  // version belonging to a different one of their jobs.
  const version = db.select().from(coverLetters)
    .where(and(
      eq(coverLetters.id, versionId),
      eq(coverLetters.jobId, rawId),
      eq(coverLetters.userId, userId),
    ))
    .get()
  if (!version) {
    return c.json({ error: 'Version not found' }, 404)
  }

  // Restore COPIES forward into a new row. The table stays append-only and nothing is destroyed —
  // which is what makes editing safe enough to ship without a confirmation dialog.
  const result = await writeCoverLetterVersion(rawId, userId, version.content, version.source)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json({ coverLetter: result.letter })
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

  const pdfPath = join(DATA_DIR, 'cover-letters', `${rawId}.pdf`)
  let pdfBuffer: ArrayBuffer
  try {
    pdfBuffer = await Bun.file(pdfPath).arrayBuffer()
  } catch {
    return c.json({ error: 'Cover letter PDF not found' }, 404)
  }

  const profileRow = db.select({ profileData: profile.profileData }).from(profile).where(eq(profile.userId, userId)).get()
  const candidateName = parseProfileData(profileRow?.profileData).personal.fullName || 'Cover Letter'
  const fileName = `${candidateName} - Cover Letter - ${job.company} - ${job.jobTitle}.pdf`
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  })
})

// Mounted at /api/resume-template, NOT under /api/jobs — the template is not job-scoped, and `app`
// here is mounted at /api/jobs. It lives in this file beside the routes that render from it.
//
// The client cannot reach resume_templates/ any other way: the directory sits outside public/,
// vite.config.ts sets no publicDir, and only /api and /auth are proxied. Serving the SAME bytes the
// renderer reads is what keeps the file on disk as the single source of truth — the server renders
// from it, the client previews from it, and the two cannot drift. (A Vite `?raw` import would have
// put a build-time copy in the bundle while the server kept reading disk at runtime: two sources,
// and precisely the drift that extracting buildResumeHtml exists to make impossible.)
export const resumeTemplateApp = new Hono<AppEnv>()

resumeTemplateApp.get('/', async (c) => {
  let html: string
  try {
    html = await readResumeTemplate()
  } catch (err) {
    console.error('Failed to read resume template:', err)
    return c.json({ error: 'Resume template unavailable' }, 500)
  }
  return c.body(html, 200, {
    'Content-Type': 'text/html; charset=utf-8',
    // The template does not change at runtime, so the client fetches it once and types for free.
    // `private` because this sits behind auth like every other /api route.
    'Cache-Control': 'private, max-age=3600',
  })
})

export default app
