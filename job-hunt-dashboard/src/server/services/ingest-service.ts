import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs } from '../../db/schema'
import type { JobInput } from '../../shared/schemas'

export function ingestJobs(rows: JobInput[]): { added: number; updated: number } {
  // Pre-query existing keys to count adds vs updates accurately
  const existing = db
    .select({ company: jobs.company, jobTitle: jobs.jobTitle })
    .from(jobs)
    .all()
  const existingKeys = new Set(existing.map((r) => `${r.company}\x00${r.jobTitle}`))

  let added = 0
  let updated = 0

  db.transaction((tx) => {
    for (const row of rows) {
      tx
        .insert(jobs)
        .values(row)
        .onConflictDoUpdate({
          target: [jobs.company, jobs.jobTitle],
          set: {
            fitScore: sql`excluded.fit_score`,
            recommendation: sql`excluded.recommendation`,
            roleFit: sql`excluded.role_fit`,
            requirementsMet: sql`excluded.requirements_met`,
            requirementsMissed: sql`excluded.requirements_missed`,
            redFlags: sql`excluded.red_flags`,
            jobDescription: sql`excluded.job_description`,
            sourceUrl: sql`excluded.source_url`,
            dateScraped: sql`excluded.date_scraped`,
          },
        })
        .run()

      if (existingKeys.has(`${row.company}\x00${row.jobTitle}`)) {
        updated++
      } else {
        added++
      }
    }
  })

  return { added, updated }
}
