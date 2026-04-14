import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs, messages, webhookRuns, coverLetters } from '../../db/schema'
import { and, eq, gte, type SQL } from 'drizzle-orm'
import { STATS_PERIODS } from '../../shared/schemas'

const app = new Hono()

function getPeriodCutoffs(period: string) {
  if (period === 'all') return { datetimeCutoff: null, dateCutoff: null }
  const ms = period === '24h' ? 86_400_000 : period === '7d' ? 604_800_000 : 2_592_000_000
  const iso = new Date(Date.now() - ms).toISOString()
  return { datetimeCutoff: iso, dateCutoff: iso.slice(0, 10) }
}

function parseWorkflow(name: string): string {
  if (name.startsWith('Cover Letter - ')) return 'Cover Letter'
  if (name.startsWith('Resume - ')) return 'Resume'
  return name
}

type AppliedFilter  = 'applied' | 'unapplied' | 'all'
type ArchivedFilter = 'active'  | 'archived'  | 'all'

function buildBaseWhere(archivedFilter: ArchivedFilter, appliedFilter: AppliedFilter) {
  const archivedCond =
    archivedFilter === 'active'   ? eq(jobs.archived, false) :
    archivedFilter === 'archived' ? eq(jobs.archived, true)  : undefined
  const appliedCond =
    appliedFilter === 'applied'   ? eq(jobs.applied, true)  :
    appliedFilter === 'unapplied' ? eq(jobs.applied, false) : undefined
  const conds = [archivedCond, appliedCond].filter((c): c is SQL => c !== undefined)
  return conds.length > 0 ? and(...conds) : undefined
}

app.get('/', (c) => {
  const rawPeriod = c.req.query('period') ?? 'all'
  const period = (STATS_PERIODS as readonly string[]).includes(rawPeriod) ? rawPeriod : 'all'
  const { datetimeCutoff, dateCutoff } = getPeriodCutoffs(period)
  const rawArchivedFilter = c.req.query('archivedFilter')
  const archivedFilter: ArchivedFilter =
    rawArchivedFilter === 'archived' ? 'archived' :
    rawArchivedFilter === 'all'      ? 'all'       : 'active'
  const rawAppliedFilter = c.req.query('appliedFilter')
  const appliedFilter: AppliedFilter =
    rawAppliedFilter === 'unapplied' ? 'unapplied' :
    rawAppliedFilter === 'all'       ? 'all'        : 'applied'

  const baseWhere = buildBaseWhere(archivedFilter, appliedFilter)

  // Load all jobs matching base conditions + dateScraped cutoff
  const scrapedWhere = and(baseWhere, dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined)
  const viewJobs = db.select().from(jobs).where(scrapedWhere).all()

  const scrapedTotal = viewJobs.length
  const archivedTotal = viewJobs.filter(j => j.archived).length

  const pipelineJobs = viewJobs
  const pipelineTotal = pipelineJobs.length

  const recCounts: Record<string, number> = {}
  for (const job of pipelineJobs) {
    const key = job.recommendation ?? 'None'
    recCounts[key] = (recCounts[key] ?? 0) + 1
  }
  const byRecommendation = Object.entries(recCounts).map(([name, value]) => ({ name, value }))

  const fitBuckets: Record<string, number> = {
    '0-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40-49': 0,
    '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90+': 0,
  }
  for (const job of pipelineJobs) {
    if (job.fitScore === null) continue
    const score = job.fitScore
    const key = score >= 90 ? '90+' : `${Math.floor(score / 10) * 10}-${Math.floor(score / 10) * 10 + 9}`
    fitBuckets[key]++
  }
  const byFitScore = Object.entries(fitBuckets).map(([bucket, count]) => ({ bucket, count }))

  // Jobs per day — built from pipelineJobs (non-archived subset, consistent with recommendation/fit charts)
  const dailyMap: Record<string, { apply: number; investigate: number; skip: number; none: number }> = {}
  for (const job of pipelineJobs) {
    if (!job.dateScraped) continue
    const date = job.dateScraped.slice(0, 10)
    if (!dailyMap[date]) dailyMap[date] = { apply: 0, investigate: 0, skip: 0, none: 0 }
    if (job.recommendation === 'apply') dailyMap[date].apply++
    else if (job.recommendation === 'investigate') dailyMap[date].investigate++
    else if (job.recommendation === 'skip') dailyMap[date].skip++
    else dailyMap[date].none++
  }
  const perDay = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))

  // Application stats (always applied=true, archivedFilter-aware, dateApplied cutoff)
  const archivedAppCond =
    archivedFilter === 'active'   ? eq(jobs.archived, false) :
    archivedFilter === 'archived' ? eq(jobs.archived, true)  : undefined
  const appWhere = and(
    eq(jobs.applied, true),
    archivedAppCond,
    dateCutoff ? gte(jobs.dateApplied, dateCutoff) : undefined,
  )
  const appliedJobs = db.select().from(jobs).where(appWhere).all()

  const appTotal = appliedJobs.length
  const statusCounts: Record<string, number> = {}
  let withStatus = 0
  for (const job of appliedJobs) {
    const key = job.statusOverride ?? 'Applied (no status)'
    statusCounts[key] = (statusCounts[key] ?? 0) + 1
    if (job.statusOverride !== null) withStatus++
  }
  const byStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }))
  const responseRate = appTotal === 0 ? null : withStatus / appTotal

  // Email stats — date filter only, no job/archived/applied filtering
  const relevantEmails = datetimeCutoff
    ? db.select().from(messages).where(gte(messages.receivedAt, datetimeCutoff)).all()
    : db.select().from(messages).all()

  const emailTotal = relevantEmails.length
  const typeCounts: Record<string, number> = {}
  for (const msg of relevantEmails) {
    const key = msg.type ?? 'Unclassified'
    typeCounts[key] = (typeCounts[key] ?? 0) + 1
  }
  const byType = Object.entries(typeCounts).map(([type, count]) => ({ type, count }))

  // Automation stats — untouched (no filter applied)
  const runRows = datetimeCutoff
    ? db.select().from(webhookRuns).where(gte(webhookRuns.runAt, datetimeCutoff)).all()
    : db.select().from(webhookRuns).all()

  const totalRuns = runRows.length
  const successCount = runRows.filter((r) => r.success).length
  const successRate = totalRuns === 0 ? null : successCount / totalRuns

  const workflowMap: Record<string, { success: number; failed: number }> = {}
  for (const run of runRows) {
    const wf = parseWorkflow(run.name)
    if (!workflowMap[wf]) workflowMap[wf] = { success: 0, failed: 0 }
    if (run.success) workflowMap[wf].success++
    else workflowMap[wf].failed++
  }
  const byWorkflow = Object.entries(workflowMap).map(([workflow, counts]) => ({ workflow, ...counts }))

  const clRows = datetimeCutoff
    ? db.select().from(coverLetters).where(gte(coverLetters.createdAt, datetimeCutoff)).all()
    : db.select().from(coverLetters).all()
  const coverLettersGenerated = clRows.length

  return c.json({
    pipeline: { total: pipelineTotal, byRecommendation, byFitScore },
    scraped: { total: scrapedTotal, perDay },
    archived: { total: archivedTotal },
    applications: { total: appTotal, byStatus, responseRate },
    emails: { total: emailTotal, byType },
    automation: { totalRuns, successRate, byWorkflow, coverLettersGenerated },
  })
})

export default app
