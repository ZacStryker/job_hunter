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
      // Both states the analysis queue can never see again. NULL because the payload is allowed to
      // omit the status and the column has no DB default; 'analyzing' because it means "a run has
      // this job in flight", which cannot be true of a row arriving from a scraper — and once
      // written it is invisible to both selection paths until the next process boot.
      const analysisStatus =
        row.analysisStatus == null || row.analysisStatus === 'analyzing' ? 'pending' : row.analysisStatus

      tx
        .insert(jobs)
        .values({ ...row, userId, analysisStatus })
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
