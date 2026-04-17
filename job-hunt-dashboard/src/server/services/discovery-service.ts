import { isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs } from '../../db/schema'

interface ScraperResult {
  id: string
  title: string
  company: string
  location: string | null
  url: string | null
}

const SEARCHES = [
  { scraperSource: 'linkedin',  dbSource: 'linkedin', query: 'genai ml',             location: 'The Randstad, Netherlands' },
  { scraperSource: 'indeed',    dbSource: 'indeed',   query: 'genai ml python',      location: 'remote' },
  { scraperSource: 'indeed_nl', dbSource: 'indeed',   query: 'genai ml python',      location: 'Randstad' },
  { scraperSource: 'linkedin',  dbSource: 'linkedin', query: 'Full stack developer', location: 'Remote' },
  { scraperSource: 'indeed',    dbSource: 'indeed',   query: 'full stack developer', location: 'remote' },
  { scraperSource: 'indeed_nl', dbSource: 'indeed',   query: 'full stack developer', location: 'Randstad' },
]

export async function runDiscovery(): Promise<{ inserted: number }> {
  const scraperUrl = process.env.SCRAPER_URL
  const scraperToken = process.env.SCRAPER_TOKEN
  if (!scraperUrl) throw new Error('SCRAPER_URL not configured')

  const responses = await Promise.all(
    SEARCHES.map((s) =>
      fetch(`${scraperUrl}/scrape/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
        },
        body: JSON.stringify({ source: s.scraperSource, query: s.query, location: s.location }),
        signal: AbortSignal.timeout(60_000),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Scraper error ${res.status} for "${s.query}"`)
        const data = await res.json() as { results?: ScraperResult[] }
        return { source: s.dbSource, results: data.results ?? [] }
      })
    )
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

  if (newJobs.length === 0) return { inserted: 0 }

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

  return { inserted: newJobs.length }
}
