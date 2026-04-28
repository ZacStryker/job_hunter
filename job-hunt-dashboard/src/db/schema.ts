import { integer, real, text, sqliteTable, uniqueIndex, primaryKey, index } from 'drizzle-orm/sqlite-core'

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Scraper-owned (refreshed on every ingest)
  company: text('company').notNull(),
  jobTitle: text('job_title').notNull(),
  sourceUrl: text('source_url'),
  dateScraped: text('date_scraped'),
  source: text('source'),
  location: text('location'),
  // Scraper/pipeline (set on INSERT — never overwritten on conflict)
  externalJobId: text('external_job_id'),
  // Analysis-owned (set by Analysis service — never overwrite on ingest)
  analysisStatus: text('analysis_status'),
  dateAnalyzed: text('date_analyzed'),
  fitScore: integer('fit_score'),
  recommendation: text('recommendation'),
  roleFit: text('role_fit'),
  requirementsMet: text('requirements_met'),
  requirementsMissed: text('requirements_missed'),
  redFlags: text('red_flags'),
  jobDescription: text('job_description'),
  salary: text('salary'),
  benefits: text('benefits'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  // User-owned (NEVER overwritten on ingest — protected by ON CONFLICT clause)
  applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
  status: text('status'),
  statusOverride: text('status_override'),
  coverLetterSentAt: text('cover_letter_sent_at'),
  dateApplied: text('date_applied'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  resumeGeneratedAt: text('resume_generated_at'),
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

export const webhookRuns = sqliteTable('webhook_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  runAt: text('run_at').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  itemCount: integer('item_count'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: real('cost_usd'),
  matchedCount: integer('matched_count'),
  archivedCount: integer('archived_count'),
  sourceBreakdown: text('source_breakdown'),
})

export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  location: text('location'),
  linkedinUrl: text('linkedin_url'),
  githubUrl: text('github_url'),
  summary: text('summary'),
  experience: text('experience'),
  skills: text('skills'),
  education: text('education'),
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

export const searchConfigs = sqliteTable('search_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  query: text('query').notNull(),
  location: text('location'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
})

export const prompts = sqliteTable('prompts', {
  flow: text('flow').primaryKey(),
  systemPrompt: text('system_prompt'),
  userMessage: text('user_message').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('standard'), // 'standard' | 'admin'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  activationToken: text('activation_token'),
  activationTokenExpiresAt: text('activation_token_expires_at'),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: text('reset_token_expires_at'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('users_activation_token_idx').on(table.activationToken),
  uniqueIndex('users_reset_token_idx').on(table.resetToken),
])

export const inviteKeys = sqliteTable('invite_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  usedByUserId: integer('used_by_user_id').references(() => users.id),
  usedAt: text('used_at'),
})

export const userSecrets = sqliteTable('user_secrets', {
  userId: integer('user_id').notNull().references(() => users.id),
  keyName: text('key_name').notNull(),
  ciphertext: text('ciphertext').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.keyName] }),
])

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),         // 32-byte hex string; NOT autoincrement
  userId: integer('user_id').notNull().references(() => users.id),
  data: text('data'),                  // JSON blob; null is valid
  expiresAt: text('expires_at').notNull(),
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_expires_at_idx').on(table.expiresAt),
])
