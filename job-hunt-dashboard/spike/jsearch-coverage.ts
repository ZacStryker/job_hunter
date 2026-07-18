// JSearch coverage spike — 2026-07-16 go/no-go condition #1.
// Runs real HITLOBSTER-style queries against the JSearch free tier and prints a
// quality table so we can validate coverage BEFORE subscribing to a paid plan.
//
//   JSEARCH_API_KEY=<your-rapidapi-key> bun run spike/jsearch-coverage.ts
//
// Free tier is 200 calls/mo; each query below is one call. Keep the list small.

import { getJobSearchProvider, JobSearchNotConfiguredError } from '../src/server/services/job-search'

// v2 geo model: structured country (ISO alpha-2) + city, NOT location in the query.
const QUERIES: { query: string; country?: string; city?: string; remoteOnly?: boolean }[] = [
  { query: 'senior frontend engineer', country: 'nl', city: 'Amsterdam' },
  { query: 'react developer', country: 'de', city: 'Berlin' },
  { query: 'full stack engineer', country: 'gb', city: 'London' },
  { query: 'typescript developer', country: 'us', remoteOnly: true },
  { query: 'platform engineer', country: 'nl', city: 'Utrecht' },
  { query: 'staff software engineer', country: 'us', city: 'San Francisco' },
  { query: 'backend engineer golang', country: 'us', city: 'Austin' },
  { query: 'devops engineer kubernetes', country: 'ca', city: 'Toronto' },
  { query: 'data engineer', country: 'us', city: 'New York' },
  { query: 'machine learning engineer', country: 'us', remoteOnly: true },
  { query: 'product designer', country: 'nl', city: 'Amsterdam' },
  { query: 'engineering manager', country: 'ie', city: 'Dublin' },
  { query: 'python developer', country: 'nl', city: 'Rotterdam' },
  { query: 'site reliability engineer', country: 'gb', city: 'London' },
  { query: 'security engineer', country: 'us', city: 'Seattle' },
]

function pct(n: number, total: number): string {
  if (total === 0) return '  —'
  return `${Math.round((n / total) * 100)}%`.padStart(4)
}

async function main() {
  const provider = getJobSearchProvider('jsearch')

  console.log('query'.padEnd(34), 'n'.padStart(4), 'apply'.padStart(6), 'salary'.padStart(7), 'geo')
  console.log('-'.repeat(72))

  let grandTotal = 0
  for (const q of QUERIES) {
    try {
      const jobs = await provider.search(q)
      grandTotal += jobs.length
      const withApply = jobs.filter((j) => j.sourceUrl).length
      const withSalary = jobs.filter((j) => j.salary).length
      const distinctLocations = new Set(jobs.map((j) => j.location).filter(Boolean)).size
      const geo = q.city ? `${q.city}, ${q.country}` : q.remoteOnly ? 'remote' : q.country ?? '—'
      const label = `${q.query} @ ${geo}`
      console.log(
        label.slice(0, 34).padEnd(34),
        String(jobs.length).padStart(4),
        pct(withApply, jobs.length),
        pct(withSalary, jobs.length),
        `${distinctLocations} locs`,
      )
    } catch (err) {
      if (err instanceof JobSearchNotConfiguredError) {
        console.error('\nJSEARCH_API_KEY is not set. Export it and re-run:')
        console.error('  JSEARCH_API_KEY=<your-rapidapi-key> bun run spike/jsearch-coverage.ts')
        process.exit(1)
      }
      console.log(`${q.query.slice(0, 34).padEnd(34)}  ERROR: ${(err as Error).message}`)
    }
  }

  console.log('-'.repeat(72))
  console.log(`total results across ${QUERIES.length} queries: ${grandTotal}`)
  console.log('\nManual review: open a few sourceUrl apply links and confirm they resolve.')
}

main()
