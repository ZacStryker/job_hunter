import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs, messages, webhookRuns, coverLetters } from '../../db/schema'
import { and, count, eq, gte } from 'drizzle-orm'
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

app.get('/', (c) => {
  const rawPeriod = c.req.query('period') ?? 'all'
  const period = (STATS_PERIODS as readonly string[]).includes(rawPeriod) ? rawPeriod : 'all'
  const { datetimeCutoff, dateCutoff } = getPeriodCutoffs(period)

  // Scraped count — all jobs (regardless of archived state) filtered by dateScraped
  const scrapedWhere = dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined
  const [{ scrapedTotal }] = db.select({ scrapedTotal: count() }).from(jobs).where(scrapedWhere).all()

  // Archived jobs count — filtered by dateScraped to match other period-aware stats
  const archivedWhere = dateCutoff
    ? and(eq(jobs.archived, true), gte(jobs.dateScraped, dateCutoff))
    : eq(jobs.archived, true)
  const [{ archivedTotal }] = db.select({ archivedTotal: count() }).from(jobs).where(archivedWhere).all()

  // Pipeline stats (non-archived jobs)
  const pipelineWhere = dateCutoff
    ? and(eq(jobs.archived, false), gte(jobs.dateScraped, dateCutoff))
    : eq(jobs.archived, false)
  const allJobs = db.select().from(jobs).where(pipelineWhere).all()

  const pipelineTotal = allJobs.length

  const recCounts: Record<string, number> = {}
  for (const job of allJobs) {
    const key = job.recommendation ?? 'None'
    recCounts[key] = (recCounts[key] ?? 0) + 1
  }
  const byRecommendation = Object.entries(recCounts).map(([name, value]) => ({ name, value }))

  const fitBuckets: Record<string, number> = {
    '0-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40-49': 0,
    '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90+': 0,
  }
  for (const job of allJobs) {
    if (job.fitScore === null) continue
    const score = job.fitScore
    const key = score >= 90 ? '90+' : `${Math.floor(score / 10) * 10}-${Math.floor(score / 10) * 10 + 9}`
    fitBuckets[key]++
  }
  const byFitScore = Object.entries(fitBuckets).map(([bucket, count]) => ({ bucket, count }))

  // Application stats (applied jobs)
  const appliedWhere = dateCutoff
    ? and(eq(jobs.applied, true), gte(jobs.dateApplied, dateCutoff))
    : eq(jobs.applied, true)
  const appliedJobs = db.select().from(jobs).where(appliedWhere).all()

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

  // Email stats
  const emailRows = datetimeCutoff
    ? db.select().from(messages).where(gte(messages.receivedAt, datetimeCutoff)).all()
    : db.select().from(messages).all()

  const emailTotal = emailRows.length
  const typeCounts: Record<string, number> = {}
  for (const msg of emailRows) {
    const key = msg.type ?? 'Unclassified'
    typeCounts[key] = (typeCounts[key] ?? 0) + 1
  }
  const byType = Object.entries(typeCounts).map(([type, count]) => ({ type, count }))

  // Automation stats
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

  // Jobs per day by recommendation
  const dailyRows = db.select({ dateScraped: jobs.dateScraped, recommendation: jobs.recommendation })
    .from(jobs)
    .where(dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined)
    .all()

  const dailyMap: Record<string, { apply: number; investigate: number; skip: number; none: number }> = {}
  for (const job of dailyRows) {
    if (!job.dateScraped) continue
    const date = job.dateScraped
    if (!dailyMap[date]) dailyMap[date] = { apply: 0, investigate: 0, skip: 0, none: 0 }
    if (job.recommendation === 'apply') dailyMap[date].apply++
    else if (job.recommendation === 'investigate') dailyMap[date].investigate++
    else if (job.recommendation === 'skip') dailyMap[date].skip++
    else dailyMap[date].none++
  }
  const perDay = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))

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
