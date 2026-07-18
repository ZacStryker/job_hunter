// Focused NL/EU coverage spike — follow-up to jsearch-coverage.ts.
// The broad spike showed strong US coverage but patchy EU results. This run
// answers: is the EU patchiness real market sparsity, or a param nuance
// (e.g. does country=nl need a city)? Dogfoods the real provider.
//
//   JSEARCH_API_KEY=<key> bun run spike/jsearch-coverage-nl.ts
//
// ~24 calls against the free tier (200/mo). Throttled to dodge 429s.

import { getJobSearchProvider, JobSearchNotConfiguredError, type JobSearchQuery } from '../src/server/services/job-search'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Realistic NL role×city matrix + no-city rows to test the param nuance.
const NL_MATRIX: JobSearchQuery[] = [
  { query: 'software engineer', country: 'nl', city: 'Amsterdam' },
  { query: 'software engineer', country: 'nl', city: 'Rotterdam' },
  { query: 'software engineer', country: 'nl', city: 'Utrecht' },
  { query: 'software engineer', country: 'nl', city: 'Eindhoven' },
  { query: 'software engineer', country: 'nl', city: 'Den Haag' },
  { query: 'software engineer', country: 'nl' }, // NO city — does NL need one?
  { query: 'frontend developer', country: 'nl', city: 'Amsterdam' },
  { query: 'data engineer', country: 'nl', city: 'Amsterdam' },
  { query: 'devops engineer', country: 'nl', city: 'Amsterdam' },
  { query: 'product manager', country: 'nl', city: 'Amsterdam' },
  { query: 'backend developer java', country: 'nl', city: 'Amsterdam' },
  { query: 'engineering manager', country: 'nl', city: 'Amsterdam' },
]

// Other EU markets for comparison — each with and without a city.
const EU_MATRIX: JobSearchQuery[] = [
  { query: 'software engineer', country: 'de', city: 'Berlin' },
  { query: 'software engineer', country: 'de' },
  { query: 'software engineer', country: 'de', city: 'Munich' },
  { query: 'software engineer', country: 'gb', city: 'London' },
  { query: 'software engineer', country: 'gb' },
  { query: 'software engineer', country: 'ie', city: 'Dublin' },
  { query: 'software engineer', country: 'ie' },
  { query: 'software engineer', country: 'fr', city: 'Paris' },
]

function pct(n: number, total: number): string {
  return total === 0 ? '  —' : `${Math.round((n / total) * 100)}%`.padStart(4)
}

async function runSection(title: string, queries: JobSearchQuery[]) {
  const provider = getJobSearchProvider('jsearch')
  console.log(`\n${title}`)
  console.log('role @ geo'.padEnd(42), 'n'.padStart(3), 'apply'.padStart(6), 'salary'.padStart(7), 'employers')
  console.log('-'.repeat(78))

  let total = 0
  let nonZero = 0
  for (const q of queries) {
    const geo = q.city ? `${q.city}, ${q.country}` : `${q.country} (no city)`
    const label = `${q.query} @ ${geo}`.slice(0, 42).padEnd(42)
    try {
      const jobs = await provider.search(q)
      total += jobs.length
      if (jobs.length > 0) nonZero++
      const apply = jobs.filter((j) => j.sourceUrl).length
      const salary = jobs.filter((j) => j.salary).length
      const employers = new Set(jobs.map((j) => j.company).filter(Boolean)).size
      console.log(label, String(jobs.length).padStart(3), pct(apply, jobs.length), pct(salary, jobs.length), `${employers}`.padStart(5))
    } catch (err) {
      if (err instanceof JobSearchNotConfiguredError) {
        console.error('\nJSEARCH_API_KEY not set. Export it and re-run.')
        process.exit(1)
      }
      console.log(label, `ERROR: ${(err as Error).message}`)
    }
    await sleep(400) // throttle for the free tier
  }
  console.log('-'.repeat(78))
  console.log(`${title}: ${nonZero}/${queries.length} queries returned results, ${total} jobs total`)
}

async function main() {
  await runSection('=== NETHERLANDS ===', NL_MATRIX)
  await runSection('=== OTHER EU MARKETS ===', EU_MATRIX)
  console.log('\nRead the "n=0 with vs without city" rows: if country-only is 0 but')
  console.log('country+city is 10, the gap is a param nuance, not missing coverage.')
}

main()
