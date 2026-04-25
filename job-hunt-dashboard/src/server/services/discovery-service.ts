import { eq, isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, searchConfigs } from '../../db/schema'

interface ScraperResult {
  id: string
  title: string
  company: string
  location: string | null
  url: string | null
}

const DB_SOURCE: Record<string, string> = {
  linkedin: 'linkedin', indeed: 'indeed', indeed_nl: 'indeed_nl', arc: 'arc',
}

export async function runDiscovery(onProgress?: (msg: string) => void): Promise<{ inserted: number; bySource: Record<string, number> }> {
  const scraperUrl = process.env.SCRAPER_URL
  const scraperToken = process.env.SCRAPER_TOKEN
  if (!scraperUrl) throw new Error('SCRAPER_URL not configured')

  const searches = db.select().from(searchConfigs).where(eq(searchConfigs.enabled, true)).all()

  const responses = await Promise.all(
    searches.map((s) => {
      onProgress?.(`Searching ${s.source}: ${s.query}…`)
      return fetch(`${scraperUrl}/scrape/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
        },
        body: JSON.stringify({ source: s.source, query: s.query, location: s.location }),
        signal: AbortSignal.timeout(60_000),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Scraper error ${res.status} for "${s.query}"`)
        const data = await res.json() as { results?: ScraperResult[] }
        return { source: DB_SOURCE[s.source] ?? s.source, results: data.results ?? [] }
      })
    })
  )

  const allResults = responses.flatMap((r) =>
    r.results.map((job) => ({ ...job, source: r.source }))
  )

  const existing = db
    .select({ externalJobId: jobs.externalJobId })
    .from(jobs)
    .where(isNotNull(jobs.externalJobId))
    .all()
  const existingIds = new Set(existing.map((r) => r.externalJobId!))

  const seen = new Set<string>()
  const newJobs = allResults.filter((r) => {
    if (!r.id || !r.company || !r.title || existingIds.has(r.id) || seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  if (newJobs.length === 0) return { inserted: 0, bySource: {} }

  onProgress?.(`Inserting ${newJobs.length} new jobs…`)

  const dateScraped = new Date().toISOString()

  db.transaction((tx) => {
    for (const job of newJobs) {
      tx
        .insert(jobs)
        .values({
          company: job.company,
          jobTitle: job.title,
          location: job.location ?? null,
          sourceUrl: job.url ?? null,
          source: job.source,
          externalJobId: job.id,
          dateScraped,
          analysisStatus: 'pending',
        })
        .onConflictDoNothing()
        .run()
    }
  })

  const bySource: Record<string, number> = {}
  for (const job of newJobs) {
    bySource[job.source] = (bySource[job.source] ?? 0) + 1
  }

  return { inserted: newJobs.length, bySource }
}
