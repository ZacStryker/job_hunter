// JSearch coverage spike — 2026-07-16 go/no-go condition #1.
// Runs real HITLOBSTER-style queries against the JSearch free tier and prints a
// quality table so we can validate coverage BEFORE subscribing to a paid plan.
//
//   JSEARCH_API_KEY=<your-rapidapi-key> bun run spike/jsearch-coverage.ts
//
// Free tier is 200 calls/mo; each query below is one call. Keep the list small.

import { getJobSearchProvider, JobSearchNotConfiguredError } from '../src/server/services/job-search'

const QUERIES: { query: string; location?: string; remoteOnly?: boolean }[] = [
  { query: 'senior frontend engineer', location: 'Amsterdam, Netherlands' },
  { query: 'react developer', location: 'Berlin, Germany' },
  { query: 'full stack engineer', location: 'London, United Kingdom' },
  { query: 'typescript developer', remoteOnly: true },
  { query: 'platform engineer', location: 'Remote' },
  { query: 'staff software engineer', location: 'San Francisco, CA' },
  { query: 'backend engineer golang', location: 'Austin, TX' },
  { query: 'devops engineer kubernetes', location: 'Toronto, Canada' },
  { query: 'data engineer', location: 'New York, NY' },
  { query: 'machine learning engineer', remoteOnly: true },
  { query: 'product designer', location: 'Amsterdam, Netherlands' },
  { query: 'engineering manager', location: 'Dublin, Ireland' },
  { query: 'python developer', location: 'Utrecht, Netherlands' },
  { query: 'site reliability engineer', location: 'Remote' },
  { query: 'security engineer', location: 'Seattle, WA' },
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
      const label = q.location ? `${q.query} @ ${q.location}` : `${q.query} (remote)`
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
