import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs } from '../../db/schema'
import type { JobInput } from '../../shared/schemas'

export function ingestJobs(rows: JobInput[], userId: number): { added: number; updated: number } {
  const existing = db
    .select({ company: jobs.company, jobTitle: jobs.jobTitle })
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .all()
  const existingKeys = new Set(existing.map((r) => `${r.company}\x00${r.jobTitle}`))

  let added = 0
  let updated = 0

  db.transaction((tx) => {
    for (const row of rows) {
      tx
        .insert(jobs)
        .values({ ...row, userId })
        .onConflictDoUpdate({
          target: [jobs.company, jobs.jobTitle, jobs.userId],
          set: {
            sourceUrl: sql`excluded.source_url`,
            dateScraped: sql`excluded.date_scraped`,
            source: sql`excluded.source`,
            location: sql`excluded.location`,
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
