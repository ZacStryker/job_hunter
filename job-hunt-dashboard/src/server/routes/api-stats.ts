import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs, coverLetters, statusEvents } from '../../db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { STATS_PERIODS, type ActivityEventType } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

function getPeriodCutoffs(period: string) {
  if (period === 'all') return { datetimeCutoff: null, dateCutoff: null }
  const ms = period === '24h' ? 86_400_000 : period === '7d' ? 604_800_000 : 2_592_000_000
  const iso = new Date(Date.now() - ms).toISOString()
  return { datetimeCutoff: iso, dateCutoff: iso.slice(0, 10) }
}

type ArchivedFilter = 'active' | 'archived' | 'all'

function buildBaseWhere(archivedFilter: ArchivedFilter) {
  if (archivedFilter === 'active') return eq(jobs.archived, false)
  if (archivedFilter === 'archived') return eq(jobs.archived, true)
  return undefined
}

// Normalize bare YYYY-MM-DD date-only strings to a UTC ISO datetime.
function toIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
}

// Net minutes saved per task (NET model — manual baseline minus residual review effort)
const NET_MIN = { source: 3, analyze: 4, coverLetter: 4.75, resume: 14.25 }
const FIT_RANGES = ['0-20', '20-40', '40-60', '60-80', '80-100']
const ACTIVITY_CAP = 50

app.get('/', (c) => {
  const userId = c.get('userId')
  const rawPeriod = c.req.query('period') ?? 'all'
  const period = (STATS_PERIODS as readonly string[]).includes(rawPeriod) ? rawPeriod : 'all'
  const { datetimeCutoff, dateCutoff } = getPeriodCutoffs(period)
  const rawArchivedFilter = c.req.query('archivedFilter')
  const archivedFilter: ArchivedFilter =
    rawArchivedFilter === 'archived' ? 'archived' :
    rawArchivedFilter === 'all'      ? 'all'       : 'active'

  const baseWhere = buildBaseWhere(archivedFilter)

  // viewJobs — archivedFilter + dateScraped cutoff + userId (period+archive-scoped: fit-score buckets)
  const scrapedWhere = and(baseWhere, dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined, eq(jobs.userId, userId))
  const viewJobs = db.select().from(jobs).where(scrapedWhere).all()

  // All-time user data (time-saved is all-time cumulative; totalJobs is the unscoped empty-state gate)
  const allUserJobs = db.select().from(jobs).where(eq(jobs.userId, userId)).all()
  const userJobIds = new Set(allUserJobs.map(j => j.id))
  const analyzedCount = allUserJobs.filter(j => j.dateAnalyzed !== null).length
  const resumeCount = allUserJobs.filter(j => j.resumeGeneratedAt !== null).length
  const coverLetterRows = db.select().from(coverLetters).where(eq(coverLetters.userId, userId)).all()
  const coverLetterCount = coverLetterRows.length
  const allStatusEvents = db.select().from(statusEvents).all().filter(e => userJobIds.has(e.jobId))

  // ── totalJobs (unscoped empty-state gate) ──
  const totalJobs = allUserJobs.length

  // ── Jobs by fit score (period+archive-scoped, 5 buckets, null excluded, clamped) ──
  const fitCounts = FIT_RANGES.map(() => 0)
  for (const j of viewJobs) {
    if (j.fitScore === null) continue
    const idx = Math.min(Math.max(Math.floor(j.fitScore / 20), 0), 4)
    fitCounts[idx]++
  }
  const jobsByFitScore = FIT_RANGES.map((fitRange, i) => ({ fitRange, count: fitCounts[i] }))

  // ── Time saved by workflow (all-time) ──
  const timeSavedByWorkflow = [
    { workflow: 'Discovery', hours: allUserJobs.length * NET_MIN.source / 60 },
    { workflow: 'Analysis', hours: analyzedCount * NET_MIN.analyze / 60 },
    { workflow: 'Cover Letter', hours: coverLetterCount * NET_MIN.coverLetter / 60 },
    { workflow: 'Resume', hours: resumeCount * NET_MIN.resume / 60 },
  ]

  // ── Recent activity feed ──
  // Archive filter scopes the owning job; period cutoff scopes each event's own timestamp.
  const feedJobs = allUserJobs.filter(j =>
    archivedFilter === 'active'   ? !j.archived :
    archivedFilter === 'archived' ? j.archived  : true
  )
  const jobById = new Map(feedJobs.map(j => [j.id, j]))

  type ActivityEvent = { type: ActivityEventType; timestamp: string; jobTitle: string; company: string; status: string | null }
  const events: ActivityEvent[] = []

  for (const j of feedJobs) {
    if (j.applied && j.dateApplied) {
      events.push({ type: 'applied', timestamp: toIso(j.dateApplied), jobTitle: j.jobTitle, company: j.company, status: null })
    }
    if (j.resumeGeneratedAt) {
      events.push({ type: 'resume', timestamp: toIso(j.resumeGeneratedAt), jobTitle: j.jobTitle, company: j.company, status: null })
    }
  }
  for (const e of allStatusEvents) {
    const j = jobById.get(e.jobId)
    if (!j) continue
    events.push({ type: 'status_change', timestamp: toIso(e.timestamp), jobTitle: j.jobTitle, company: j.company, status: e.status })
  }
  for (const cl of coverLetterRows) {
    const j = jobById.get(cl.jobId)
    if (!j) continue
    events.push({ type: 'cover_letter', timestamp: toIso(cl.createdAt), jobTitle: j.jobTitle, company: j.company, status: null })
  }

  const recentActivity = events
    .filter(e => datetimeCutoff === null || e.timestamp >= datetimeCutoff)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, ACTIVITY_CAP)

  // ── Activity heatmap (last 90 days) ──
  const now = Date.now()
  const ninetyDaysAgo = new Date(now - 90 * 86_400_000).toISOString().slice(0, 10)
  const heatmapMap: Record<string, number> = {}
  for (const j of allUserJobs) {
    if (j.dateScraped) {
      const d = j.dateScraped.slice(0, 10)
      if (d >= ninetyDaysAgo) heatmapMap[d] = (heatmapMap[d] ?? 0) + 1
    }
    if (j.dateAnalyzed) {
      const d = j.dateAnalyzed.slice(0, 10)
      if (d >= ninetyDaysAgo) heatmapMap[d] = (heatmapMap[d] ?? 0) + 1
    }
  }
  const activityHeatmap = Object.entries(heatmapMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return c.json({
    totalJobs,
    recentActivity,
    jobsByFitScore,
    timeSavedByWorkflow,
    activityHeatmap,
  })
})

export default app
