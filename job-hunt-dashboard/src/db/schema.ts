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
  source: text('source'),
  location: text('location'),
  salary: text('salary'),
  benefits: text('benefits'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  // User-owned (NEVER overwritten on sync — protected by ON CONFLICT clause in Story 2.1)
  applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
  status: text('status'),
  statusOverride: text('status_override'),
  coverLetterSentAt: text('cover_letter_sent_at'),
  dateApplied: text('date_applied'),
  // User-owned (NEVER overwritten on sync — protected by ON CONFLICT clause in Story 2.1)
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle),
])

export const coverLetters = sqliteTable('cover_letters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
})

export const statusEvents = sqliteTable('status_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id),
  status: text('status').notNull(),
  timestamp: text('timestamp').notNull(), // Full ISO 8601 datetime string
  source: text('source').notNull().default('manual'),
})

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique(), // IMAP UID — dedup key (folder:uid)
  messageId: text('message_id').unique(), // RFC 2822 Message-ID — stable across folder moves
  receivedAt: text('received_at').notNull(), // ISO 8601 datetime
  fromAddress: text('from_address').notNull(), // "Name <email>" or "email"
  subject: text('subject').notNull(),
  // User-set fields (all nullable = not yet mapped)
  type: text('type'),     // null | 'Submitted' | 'Rejected' | 'Screening' | 'Interview' | 'Offer' | 'Other'
  company: text('company'),
  jobTitle: text('job_title'),
})
