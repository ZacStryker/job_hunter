import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs, coverLetters, statusEvents, webhookRuns } from '../../db/schema'
import { and, eq, gte, inArray, or } from 'drizzle-orm'
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
type AppliedFilter = 'unapplied' | 'applied' | 'all'

function buildBaseWhere(archivedFilter: ArchivedFilter) {
  if (archivedFilter === 'active') return eq(jobs.archived, false)
  if (archivedFilter === 'archived') return eq(jobs.archived, true)
  return undefined
}

const WORKFLOW_NAMES = ['Discovery', 'Analysis', 'Cover Letter', 'Resume'] as const
type WorkflowName = typeof WORKFLOW_NAMES[number]

// Cover Letter / Resume runs are recorded with a per-job suffix
// (e.g. "Cover Letter - Acme - Engineer"), so bucket by name prefix.
function workflowBucket(name: string): WorkflowName | null {
  if (name === 'Discovery') return 'Discovery'
  if (name === 'Analysis') return 'Analysis'
  if (name.startsWith('Cover Letter')) return 'Cover Letter'
  if (name.startsWith('Resume')) return 'Resume'
  return null
}

// Normalize bare YYYY-MM-DD date-only strings to a UTC ISO datetime.
function toIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
}

// Terminal statuses (closed opportunities) — the only terminal values in STATUS_OVERRIDE_VALUES.
const TERMINAL_STATUSES = new Set(['offer', 'rejected'])
const isTerminal = (status: string | null) => status !== null && TERMINAL_STATUSES.has(status.toLowerCase())

// Net minutes saved per task (NET model — manual baseline minus residual review effort)
const NET_MIN = { source: 3, analyze: 4, coverLetter: 4.75, resume: 14.25 }
const FIT_RANGES = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100']
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
  const rawAppliedFilter = c.req.query('appliedFilter')
  const appliedFilter: AppliedFilter =
    rawAppliedFilter === 'applied'   ? 'applied'   :
    rawAppliedFilter === 'unapplied' ? 'unapplied' : 'all'

  const baseWhere = buildBaseWhere(archivedFilter)
  const appliedWhere = appliedFilter === 'all' ? undefined : eq(jobs.applied, appliedFilter === 'applied')
  const matchesApplied = (j: { applied: boolean }) =>
    appliedFilter === 'all' ? true : appliedFilter === 'applied' ? j.applied : !j.applied

  // viewJobs — archivedFilter + dateScraped cutoff + userId (period+archive-scoped: fit-score buckets)
  // For active filter, restrict to Matches (apply/investigate, not yet applied) + Applications (applied).
  const matchesOrApplied = archivedFilter === 'active'
    ? or(eq(jobs.applied, true), inArray(jobs.recommendation, ['apply', 'investigate']))
    : undefined
  const scrapedWhere = and(baseWhere, matchesOrApplied, appliedWhere, dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined, eq(jobs.userId, userId))
  const viewJobs = db.select().from(jobs).where(scrapedWhere).all()

  // All user data. Time-saved is archive-agnostic (period-scoped only); the feed is archive-scoped.
  const allUserJobs = db.select().from(jobs).where(eq(jobs.userId, userId)).all()
  const userJobIds = new Set(allUserJobs.map(j => j.id))
  const coverLetterRows = db.select().from(coverLetters).where(eq(coverLetters.userId, userId)).all()
  const allStatusEvents = db.select().from(statusEvents).all().filter(e => userJobIds.has(e.jobId))

  const inPeriod = (date: string | null) => date !== null && (dateCutoff === null || date >= dateCutoff)
  const feedJobs = allUserJobs.filter(j =>
    matchesApplied(j) && (
      archivedFilter === 'active'   ? !j.archived :
      archivedFilter === 'archived' ? j.archived  : true
    )
  )

  // ── totalJobs (unscoped empty-state gate) ──
  const totalJobs = allUserJobs.length

  // ── Jobs by fit score (period+archive-scoped, 5 buckets, null excluded, clamped) ──
  const fitCounts = FIT_RANGES.map(() => 0)
  for (const j of viewJobs) {
    if (j.fitScore === null) continue
    const idx = Math.min(Math.max(Math.floor(j.fitScore / 10), 0), 9)
    fitCounts[idx]++
  }
  const jobsByFitScore = FIT_RANGES.map((fitRange, i) => ({ fitRange, count: fitCounts[i] }))

  // ── Time saved by workflow (period-scoped, archive-agnostic, applied-scoped, per-workflow date column) ──
  const appliedJobById = new Map(allUserJobs.map(j => [j.id, j]))
  const discoveryCount = allUserJobs.filter(j => matchesApplied(j) && inPeriod(j.dateScraped)).length
  const analyzedCount = allUserJobs.filter(j => matchesApplied(j) && inPeriod(j.dateAnalyzed)).length
  const resumeCount = allUserJobs.filter(j => matchesApplied(j) && inPeriod(j.resumeGeneratedAt)).length
  const coverLetterCount = coverLetterRows.filter(cl => {
    const j = appliedJobById.get(cl.jobId)
    return j !== undefined && matchesApplied(j) && inPeriod(cl.createdAt)
  }).length
  const timeSavedByWorkflow = [
    { workflow: 'Discovery', hours: discoveryCount * NET_MIN.source / 60 },
    { workflow: 'Analysis', hours: analyzedCount * NET_MIN.analyze / 60 },
    { workflow: 'Cover Letter', hours: coverLetterCount * NET_MIN.coverLetter / 60 },
    { workflow: 'Resume', hours: resumeCount * NET_MIN.resume / 60 },
  ]

  // ── KPI tiles ──
  // Hours saved: headline trust number — sum of the time-saved chart, archive-agnostic + period/applied-scoped.
  const hoursSaved = Math.round(timeSavedByWorkflow.reduce((sum, w) => sum + w.hours, 0) * 10) / 10
  // Strong matches: same active filter set as jobsByFitScore.
  const strongMatches = viewJobs.filter(j => j.fitScore !== null && j.fitScore >= 80).length
  // Applications sent: applied jobs whose application date falls in the period (archive/applied-scoped).
  const applicationsSent = feedJobs.filter(j => j.applied && inPeriod(j.dateApplied)).length
  // In play right now: live snapshot — applied, not archived, not in a terminal status (period-independent).
  const inPlay = allUserJobs.filter(j => j.applied && !j.archived && !isTerminal(j.statusOverride)).length
  const kpis = { hoursSaved, strongMatches, applicationsSent, inPlay }

  // ── Recent activity feed ──
  // Archive filter scopes the owning job; period cutoff scopes each event's own timestamp.
  const jobById = new Map(feedJobs.map(j => [j.id, j]))

  type ActivityEvent = { type: ActivityEventType; timestamp: string; jobTitle: string; company: string; status: string | null }
  const events: ActivityEvent[] = []

  for (const j of feedJobs) {
    if (j.applied && j.dateApplied) {
      events.push({ type: 'applied', timestamp: toIso(j.appliedAt ?? j.dateApplied), jobTitle: j.jobTitle, company: j.company, status: null })
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

  // ── Workflow cost over time (period-scoped, userId-only — one row per day with any run) ──
  const costRuns = db.select().from(webhookRuns)
    .where(and(eq(webhookRuns.userId, userId), datetimeCutoff ? gte(webhookRuns.runAt, datetimeCutoff) : undefined))
    .all()
  const costByDate = new Map<string, Record<WorkflowName, number>>()
  for (const r of costRuns) {
    const bucket = workflowBucket(r.name)
    if (!bucket) continue
    const date = r.runAt.slice(0, 10)
    const row = costByDate.get(date) ?? { Discovery: 0, Analysis: 0, 'Cover Letter': 0, Resume: 0 }
    row[bucket] += r.costUsd ?? 0
    costByDate.set(date, row)
  }
  const workflowCostOverTime = [...costByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({ date, ...row }))

  return c.json({
    totalJobs,
    kpis,
    recentActivity,
    jobsByFitScore,
    timeSavedByWorkflow,
    workflowCostOverTime,
  })
})

export default app
