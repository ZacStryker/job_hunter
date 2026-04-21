import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs, webhookRuns, messages } from '../../db/schema'
import { and, eq, gte, isNotNull } from 'drizzle-orm'
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

type ArchivedFilter = 'active' | 'archived' | 'all'

function buildBaseWhere(archivedFilter: ArchivedFilter) {
  if (archivedFilter === 'active') return eq(jobs.archived, false)
  if (archivedFilter === 'archived') return eq(jobs.archived, true)
  return undefined
}

app.get('/', (c) => {
  const rawPeriod = c.req.query('period') ?? 'all'
  const period = (STATS_PERIODS as readonly string[]).includes(rawPeriod) ? rawPeriod : 'all'
  const { datetimeCutoff, dateCutoff } = getPeriodCutoffs(period)
  const rawArchivedFilter = c.req.query('archivedFilter')
  const archivedFilter: ArchivedFilter =
    rawArchivedFilter === 'archived' ? 'archived' :
    rawArchivedFilter === 'all'      ? 'all'       : 'active'

  const baseWhere = buildBaseWhere(archivedFilter)

  // All jobs matching archivedFilter + dateScraped cutoff
  const scrapedWhere = and(baseWhere, dateCutoff ? gte(jobs.dateScraped, dateCutoff) : undefined)
  const viewJobs = db.select().from(jobs).where(scrapedWhere).all()

  // ── Jobs section ──
  const scrapedTotal = viewJobs.length
  const companies = new Set(viewJobs.map(j => j.company)).size
  const sources = new Set(viewJobs.filter(j => j.source).map(j => j.source!)).size

  const sourceKeys = ['linkedin', 'indeed', 'indeed_nl', 'arc', 'manual'] as const
  const jobsDailyMap: Record<string, Record<string, number>> = {}
  for (const job of viewJobs) {
    if (!job.dateScraped) continue
    const date = job.dateScraped.slice(0, 10)
    if (!jobsDailyMap[date]) jobsDailyMap[date] = { linkedin: 0, indeed: 0, indeed_nl: 0, arc: 0, manual: 0 }
    const src = (job.source ?? '').toLowerCase()
    if (src in jobsDailyMap[date]) jobsDailyMap[date][src]++
  }
  const jobsPerDay = Object.entries(jobsDailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, linkedin: counts.linkedin, indeed: counts.indeed, indeed_nl: counts.indeed_nl, arc: counts.arc, manual: counts.manual }))

  const sourceCountMap: Record<string, number> = { linkedin: 0, indeed: 0, indeed_nl: 0, arc: 0, manual: 0 }
  for (const job of viewJobs) {
    const src = (job.source ?? '').toLowerCase()
    if (src in sourceCountMap) sourceCountMap[src]++
  }
  const bySource = sourceKeys.map(k => ({ name: k, value: sourceCountMap[k] }))

  // ── Matches section ──
  const applyCount = viewJobs.filter(j => j.recommendation === 'apply').length
  const investigateCount = viewJobs.filter(j => j.recommendation === 'investigate').length

  const matchesDailyMap: Record<string, { apply: number; investigate: number }> = {}
  for (const job of viewJobs) {
    if (job.recommendation !== 'apply' && job.recommendation !== 'investigate') continue
    if (!job.dateScraped) continue
    const date = job.dateScraped.slice(0, 10)
    if (!matchesDailyMap[date]) matchesDailyMap[date] = { apply: 0, investigate: 0 }
    if (job.recommendation === 'apply') matchesDailyMap[date].apply++
    else matchesDailyMap[date].investigate++
  }
  const matchesPerDay = Object.entries(matchesDailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, c]) => ({ date, apply: c.apply, investigate: c.investigate }))

  const byRecommendation = [
    { name: 'Apply', value: applyCount },
    { name: 'Investigate', value: investigateCount },
  ]

  const SCORE_BUCKETS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'] as const
  const scoreCounts: Record<string, number> = Object.fromEntries(SCORE_BUCKETS.map(k => [k, 0]))
  for (const job of viewJobs) {
    if (job.recommendation !== 'apply' && job.recommendation !== 'investigate') continue
    if (job.fitScore === null) continue
    const bucketIdx = Math.min(Math.floor(job.fitScore / 10), 9)
    scoreCounts[SCORE_BUCKETS[bucketIdx]]++
  }
  const byScore = SCORE_BUCKETS.map(k => ({ score: k, count: scoreCounts[k] }))

  // ── Applications section (applied=true, archivedFilter, dateApplied cutoff) ──
  const archivedAppCond =
    archivedFilter === 'active'   ? eq(jobs.archived, false) :
    archivedFilter === 'archived' ? eq(jobs.archived, true)  : undefined
  const appWhere = and(
    eq(jobs.applied, true),
    archivedAppCond,
    dateCutoff ? gte(jobs.dateApplied, dateCutoff) : undefined,
  )
  const appliedJobs = db.select().from(jobs).where(appWhere).all()

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

  const appTotal = appliedJobs.length
  const appCompanies = new Set(appliedJobs.map(j => j.company)).size
  const appResponses = appliedJobs.filter(j => {
    const key = `${j.company.toLowerCase()}|||${j.jobTitle.toLowerCase()}`
    return latestMessageByKey.has(key)
  }).length

  const STATUS_KEYS = ['No Response', 'Submitted', 'Rejected', 'Screening', 'Interview', 'Offer', 'Other'] as const
  const statusCounts: Record<string, number> = Object.fromEntries(STATUS_KEYS.map(k => [k, 0]))
  for (const job of appliedJobs) {
    const msgKey = `${job.company.toLowerCase()}|||${job.jobTitle.toLowerCase()}`
    const status = latestMessageByKey.get(msgKey)?.type ?? null
    const key = status ?? 'No Response'
    const bucket = (STATUS_KEYS as readonly string[]).includes(key) ? key : 'Other'
    statusCounts[bucket]++
  }

  const appDailyMap: Record<string, Record<string, number>> = {}
  for (const job of appliedJobs) {
    if (!job.dateApplied) continue
    const date = job.dateApplied.slice(0, 10)
    if (!appDailyMap[date]) appDailyMap[date] = Object.fromEntries(STATUS_KEYS.map(k => [k, 0]))
    const msgKey = `${job.company.toLowerCase()}|||${job.jobTitle.toLowerCase()}`
    const status = latestMessageByKey.get(msgKey)?.type ?? null
    const key = status ?? 'No Response'
    const bucket = (STATUS_KEYS as readonly string[]).includes(key) ? key : 'Other'
    appDailyMap[date][bucket]++
  }
  const appPerDay = Object.entries(appDailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      'No Response': counts['No Response'] ?? 0,
      Submitted: counts['Submitted'] ?? 0,
      Rejected: counts['Rejected'] ?? 0,
      Screening: counts['Screening'] ?? 0,
      Interview: counts['Interview'] ?? 0,
      Offer: counts['Offer'] ?? 0,
      Other: counts['Other'] ?? 0,
    }))

  const byStatus = STATUS_KEYS.map(k => ({ status: k, count: statusCounts[k] }))

  // ── Automation section (period cutoff on runAt, no archivedFilter) ──
  const runRows = datetimeCutoff
    ? db.select().from(webhookRuns).where(gte(webhookRuns.runAt, datetimeCutoff)).all()
    : db.select().from(webhookRuns).all()

  const totalRuns = runRows.length
  const totalTokens = runRows.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0)
  const totalCost = runRows.reduce((s, r) => s + (r.costUsd ?? 0), 0)

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
  const costByWorkflow = WORKFLOW_KEYS.filter(k => k !== 'Discovery').map(k => ({ workflow: k, cost: costMap[k] }))

  return c.json({
    jobs: { total: scrapedTotal, companies, sources, perDay: jobsPerDay, bySource },
    matches: { total: applyCount + investigateCount, apply: applyCount, investigate: investigateCount, perDay: matchesPerDay, byRecommendation, byScore },
    applications: { total: appTotal, companies: appCompanies, responses: appResponses, perDay: appPerDay, byStatus },
    automation: { totalRuns, totalTokens, totalCost, perDay: autoPerDay, costByWorkflow },
  })
})

export default app
