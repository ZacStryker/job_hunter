import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs, webhookRuns, coverLetters, statusEvents } from '../../db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { STATS_PERIODS } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

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

type ArchivedFilter = 'active' | 'archived' | 'all'

function buildBaseWhere(archivedFilter: ArchivedFilter) {
  if (archivedFilter === 'active') return eq(jobs.archived, false)
  if (archivedFilter === 'archived') return eq(jobs.archived, true)
  return undefined
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Net minutes saved per task (NET model — manual baseline minus residual review effort)
const NET_MIN = { source: 3, analyze: 4, coverLetter: 4.75, resume: 14.25 }
const RESPONSE_STATUSES = ['screening', 'interview', 'offer', 'rejected']
const INTERVIEW_STATUSES = ['interview', 'offer']
const FIT_RANGES = ['0-20', '20-40', '40-60', '60-80', '80-100']

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

  // viewJobs — archivedFilter + dateScraped cutoff + userId
  const scrapedWhere = and(baseWhere, dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined, eq(jobs.userId, userId))
  const viewJobs = db.select().from(jobs).where(scrapedWhere).all()

  // appliedJobs — applied=true, archivedFilter, dateApplied cutoff, userId
  const archivedAppCond =
    archivedFilter === 'active'   ? eq(jobs.archived, false) :
    archivedFilter === 'archived' ? eq(jobs.archived, true)  : undefined
  const appWhere = and(
    eq(jobs.applied, true),
    archivedAppCond,
    dateCutoff ? gte(jobs.dateApplied, dateCutoff) : undefined,
    eq(jobs.userId, userId),
  )
  const appliedJobs = db.select().from(jobs).where(appWhere).all()

  // All-time user data (time-saved, days-since-app, stale, stage-aging are cumulative — not period-scoped)
  const allUserJobs = db.select().from(jobs).where(eq(jobs.userId, userId)).all()
  const userJobIds = new Set(allUserJobs.map(j => j.id))
  const allAppliedJobs = allUserJobs.filter(j => j.applied)
  const coverLetterRows = db.select().from(coverLetters).where(eq(coverLetters.userId, userId)).all()
  const coverLetterCount = coverLetterRows.length
  const allStatusEvents = db.select().from(statusEvents).all().filter(e => userJobIds.has(e.jobId))
  const allRuns = db.select().from(webhookRuns).where(eq(webhookRuns.userId, userId)).all()

  // Period-filtered runs for the automation detail section
  const runRows = db.select().from(webhookRuns).where(
    and(eq(webhookRuns.userId, userId), datetimeCutoff ? gte(webhookRuns.runAt, datetimeCutoff) : undefined)
  ).all()

  const now = Date.now()

  // ── Funnel ──
  const scraped = viewJobs.length
  const matched = viewJobs.filter(j => j.recommendation === 'apply' || j.recommendation === 'investigate').length
  const applied = appliedJobs.length
  const hasStatusData = appliedJobs.some(j => j.statusOverride !== null)
  const response = hasStatusData ? appliedJobs.filter(j => j.statusOverride !== null && RESPONSE_STATUSES.includes(j.statusOverride)).length : 0
  const interview = hasStatusData ? appliedJobs.filter(j => j.statusOverride !== null && INTERVIEW_STATUSES.includes(j.statusOverride)).length : 0
  const offer = hasStatusData ? appliedJobs.filter(j => j.statusOverride === 'offer').length : 0
  const funnel = { scraped, matched, applied, response, interview, offer, hasStatusData }

  // ── Value (time-saved — all-time cumulative) ──
  const analyzedCount = allUserJobs.filter(j => j.dateAnalyzed !== null).length
  const resumeCount = allUserJobs.filter(j => j.resumeGeneratedAt !== null).length
  const timeSavedMinutes =
    allUserJobs.length * NET_MIN.source +
    analyzedCount * NET_MIN.analyze +
    coverLetterCount * NET_MIN.coverLetter +
    resumeCount * NET_MIN.resume
  const timeSavedHours = timeSavedMinutes / 60
  const totalCostUsd = allRuns.reduce((s, r) => s + (r.costUsd ?? 0), 0)
  const costPerApplication = applied > 0 ? totalCostUsd / applied : 0
  const value = { timeSavedHours, totalCostUsd, costPerApplication }

  // ── Fit-score vs outcome (gated) ──
  const fitHasData = hasStatusData && appliedJobs.some(j => j.fitScore !== null)
  const fitBuckets = FIT_RANGES.map(fitRange => ({ fitRange, applied: 0, responded: 0 }))
  if (fitHasData) {
    for (const j of appliedJobs) {
      if (j.fitScore === null) continue
      const idx = Math.min(Math.floor(j.fitScore / 20), 4)
      fitBuckets[idx].applied++
      if (j.statusOverride !== null && RESPONSE_STATUSES.includes(j.statusOverride)) fitBuckets[idx].responded++
    }
  }
  const fitVsOutcome = { hasData: fitHasData, buckets: fitBuckets }

  // ── Stat cards ──
  let daysSinceLastApplication: number | null = null
  const appliedDates = allAppliedJobs.filter(j => j.dateApplied).map(j => new Date(j.dateApplied! + 'T00:00:00Z').getTime())
  if (appliedDates.length > 0) {
    daysSinceLastApplication = Math.floor((now - Math.max(...appliedDates)) / 86_400_000)
  }
  const matchQualityRate = viewJobs.length > 0
    ? (viewJobs.filter(j => j.recommendation === 'apply').length / viewJobs.length) * 100
    : 0
  const statCards = { daysSinceLastApplication, matchQualityRate }

  // ── Sparklines (per active day) ──
  const scrapedByDate: Record<string, { total: number; apply: number }> = {}
  for (const j of viewJobs) {
    if (!j.dateScraped) continue
    const d = j.dateScraped.slice(0, 10)
    if (!scrapedByDate[d]) scrapedByDate[d] = { total: 0, apply: 0 }
    scrapedByDate[d].total++
    if (j.recommendation === 'apply') scrapedByDate[d].apply++
  }
  const matchQualitySpark = Object.entries(scrapedByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, c]) => ({ date, rate: c.total > 0 ? (c.apply / c.total) * 100 : 0 }))

  const appsByDate: Record<string, number> = {}
  for (const j of appliedJobs) {
    if (!j.dateApplied) continue
    const d = j.dateApplied.slice(0, 10)
    appsByDate[d] = (appsByDate[d] ?? 0) + 1
  }
  const costByDate: Record<string, number> = {}
  for (const r of runRows) {
    const d = r.runAt.slice(0, 10)
    costByDate[d] = (costByDate[d] ?? 0) + (r.costUsd ?? 0)
  }
  let cumApps = 0
  const costPerAppSpark = Object.keys(appsByDate).sort((a, b) => a.localeCompare(b)).map(date => {
    cumApps += appsByDate[date]
    let cumCost = 0
    for (const [cd, cv] of Object.entries(costByDate)) if (cd <= date) cumCost += cv
    return { date, costPerApp: cumApps > 0 ? cumCost / cumApps : 0 }
  })

  // ── Next action ──
  const applyMatchesWaiting = allUserJobs.filter(j => j.recommendation === 'apply' && !j.applied && !j.archived).length
  const fourteenDaysMs = 14 * 86_400_000
  const latestEventByJob = new Map<number, number>()
  for (const e of allStatusEvents) {
    const t = new Date(e.timestamp).getTime()
    const prev = latestEventByJob.get(e.jobId)
    if (prev === undefined || t > prev) latestEventByJob.set(e.jobId, t)
  }
  let staleApplications = 0
  for (const j of allAppliedJobs) {
    if (!j.dateApplied) continue
    const appliedMs = new Date(j.dateApplied + 'T00:00:00Z').getTime()
    if (now - appliedMs <= fourteenDaysMs) continue
    const latestEvent = latestEventByJob.get(j.id)
    if (latestEvent === undefined || now - latestEvent > fourteenDaysMs) staleApplications++
  }
  const nextAction = { applyMatchesWaiting, staleApplications }

  // ── Hero sentence ──
  const thirtyDaysAgoIso = new Date(now - 30 * 86_400_000).toISOString()
  const recentApps = allAppliedJobs.filter(j => j.dateApplied && (j.dateApplied + 'T00:00:00Z') >= thirtyDaysAgoIso).length
  const momentumStatus = recentApps >= 3 ? 'Active search' : recentApps >= 1 ? 'Moderate activity' : 'Search paused'
  const conversionPct = applied > 0 && hasStatusData ? Math.round((response / applied) * 100) : null
  const hrs = Math.round(timeSavedHours)
  let heroSentence = `${momentumStatus} — ${recentApps} application${recentApps !== 1 ? 's' : ''} in the last 30 days.`
  if (conversionPct !== null) heroSentence += ` Pipeline converting at ${conversionPct}%.`
  heroSentence += ` HITLobster saved you ~${hrs} hrs ($${totalCostUsd.toFixed(2)}).`

  // ── Detail: apply→response ──
  const applyResponseRate = { hasData: hasStatusData, applied, responded: response }

  // ── Detail: source effectiveness ──
  const sourceMap: Record<string, { scraped: number; applied: number; responded: number }> = {}
  for (const j of viewJobs) {
    if (!j.source) continue
    const src = j.source
    if (!sourceMap[src]) sourceMap[src] = { scraped: 0, applied: 0, responded: 0 }
    sourceMap[src].scraped++
    if (j.applied) sourceMap[src].applied++
    if (j.statusOverride !== null) sourceMap[src].responded++
  }
  const sourceEffectiveness = Object.entries(sourceMap).map(([source, c]) => ({ source, ...c }))

  // ── Detail: stage-aging (from statusEvents, ≥3 data points per stage) ──
  const eventsByJob = new Map<number, { status: string; timestamp: string }[]>()
  for (const e of allStatusEvents) {
    const arr = eventsByJob.get(e.jobId)
    if (arr) arr.push({ status: e.status, timestamp: e.timestamp })
    else eventsByJob.set(e.jobId, [{ status: e.status, timestamp: e.timestamp }])
  }
  const stageDurations: Record<string, number[]> = {}
  for (const events of eventsByJob.values()) {
    const sorted = events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    for (let i = 0; i < sorted.length - 1; i++) {
      const days = (new Date(sorted[i + 1].timestamp).getTime() - new Date(sorted[i].timestamp).getTime()) / 86_400_000
      if (!stageDurations[sorted[i].status]) stageDurations[sorted[i].status] = []
      stageDurations[sorted[i].status].push(days)
    }
  }
  const stageAging = Object.entries(stageDurations)
    .filter(([, durs]) => durs.length >= 3)
    .map(([stage, durs]) => ({ stage, medianDays: median(durs) }))

  // ── Detail: activity heatmap (last 90 days) ──
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

  // ── Detail: cumulative time-saved ──
  const savedByDate: Record<string, number> = {}
  const addSaved = (dateStr: string | null, minutes: number) => {
    if (!dateStr) return
    const d = dateStr.slice(0, 10)
    savedByDate[d] = (savedByDate[d] ?? 0) + minutes
  }
  for (const j of allUserJobs) {
    addSaved(j.dateScraped, NET_MIN.source)
    if (j.dateAnalyzed) addSaved(j.dateAnalyzed, NET_MIN.analyze)
    if (j.resumeGeneratedAt) addSaved(j.resumeGeneratedAt, NET_MIN.resume)
  }
  for (const cl of coverLetterRows) addSaved(cl.createdAt, NET_MIN.coverLetter)
  let cumMinutes = 0
  const cumulativeTimeSaved = Object.keys(savedByDate)
    .sort((a, b) => a.localeCompare(b))
    .map(date => {
      cumMinutes += savedByDate[date]
      return { date, totalHours: cumMinutes / 60 }
    })

  // ── Detail: time-saved by workflow ──
  const timeSavedByWorkflow = [
    { workflow: 'Discovery', hours: allUserJobs.length * NET_MIN.source / 60 },
    { workflow: 'Analysis', hours: analyzedCount * NET_MIN.analyze / 60 },
    { workflow: 'Cover Letter', hours: coverLetterCount * NET_MIN.coverLetter / 60 },
    { workflow: 'Resume', hours: resumeCount * NET_MIN.resume / 60 },
  ]

  // ── Automation (period-filtered) ──
  const totalRuns = runRows.length
  const totalTokens = runRows.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0)
  const WORKFLOW_KEYS = ['Discovery', 'Analysis', 'Cover Letter', 'Resume'] as const
  const autoDailyMap: Record<string, Record<string, number>> = {}
  for (const run of runRows) {
    const date = run.runAt.slice(0, 10)
    if (!autoDailyMap[date]) autoDailyMap[date] = Object.fromEntries(WORKFLOW_KEYS.map(k => [k, 0]))
    const wf = parseWorkflow(run.name)
    if ((WORKFLOW_KEYS as readonly string[]).includes(wf)) autoDailyMap[date][wf]++
  }
  const autoPerDay = Object.entries(autoDailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      Discovery: counts['Discovery'] ?? 0,
      Analysis: counts['Analysis'] ?? 0,
      'Cover Letter': counts['Cover Letter'] ?? 0,
      Resume: counts['Resume'] ?? 0,
    }))
  const costMap: Record<string, number> = Object.fromEntries(WORKFLOW_KEYS.map(k => [k, 0]))
  for (const run of runRows) {
    const wf = parseWorkflow(run.name)
    if ((WORKFLOW_KEYS as readonly string[]).includes(wf)) costMap[wf] += (run.costUsd ?? 0)
  }
  const costByWorkflow = WORKFLOW_KEYS.map(k => ({ workflow: k, cost: costMap[k] }))

  return c.json({
    heroSentence,
    nextAction,
    funnel,
    value,
    fitVsOutcome,
    statCards,
    sparklines: { matchQuality: matchQualitySpark, costPerApp: costPerAppSpark },
    detail: { applyResponseRate, sourceEffectiveness, stageAging, activityHeatmap, cumulativeTimeSaved, timeSavedByWorkflow },
    automation: { totalRuns, totalTokens, perDay: autoPerDay, costByWorkflow },
  })
})

export default app
