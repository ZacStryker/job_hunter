import { integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Sheets-owned (overwritten on every sync — do NOT protect)
  company: text('company').notNull(),
  jobTitle: text('job_title').notNull(),
  fitScore: integer('fit_score'),
  recommendation: text('recommendation'),
  roleFit: text('role_fit'),
  requirementsMet: text('requirements_met'),
  requirementsMissed: text('requirements_missed'),
  redFlags: text('red_flags'),
  jobDescription: text('job_description'),
  sourceUrl: text('source_url'),
  dateScraped: text('date_scraped'),
  // User-owned (NEVER overwritten on sync — protected by ON CONFLICT clause in Story 2.1)
  applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
  status: text('status'),
  statusOverride: text('status_override'),
  coverLetterSentAt: text('cover_letter_sent_at'),
  dateApplied: text('date_applied'),
}, (table) => [
  uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle),
])
