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
  relevanceScore: real('relevance_score'),
  // Analysis-owned (set by Analysis service — never overwrite on ingest)
  analysisStatus: text('analysis_status'),
  dateAnalyzed: text('date_analyzed'),
  fitScore: integer('fit_score'),
  recommendation: text('recommendation'),
  jobReqsMet: text('job_reqs_met'),
  jobReqsMissed: text('job_reqs_missed'),
  candidateReqsMet: text('candidate_reqs_met'),
  candidateReqsMissed: text('candidate_reqs_missed'),
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
  generationContext: text('generation_context'),
  dateApplied: text('date_applied'),
  appliedAt: text('applied_at'),
  dateArchived: text('date_archived'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  userId: integer('user_id').notNull().references(() => users.id),
  resumeGeneratedAt: text('resume_generated_at'),
}, (table) => [
  uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle, table.userId),
  index('jobs_user_id_idx').on(table.userId),
])

export const coverLetters = sqliteTable('cover_letters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id),
  userId: integer('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
  // The table is append-only, so the version history already exists — this column only labels it.
  // Defaulted, so every pre-existing row reads back as 'generated' with no backfill.
  source: text('source', { enum: ['generated', 'edited'] }).notNull().default('generated'),
}, (table) => [
  index('cover_letters_user_id_idx').on(table.userId),
])

// The resume's structured JSON — the ONLY editable representation of a resume that ever exists.
// Before this table, generateResume validated it, rendered a PDF, and threw the JSON away, so a
// resume could be rerolled but never fixed, diffed, or reverted. A PDF cannot be reversed into
// structured data, so there is nothing to backfill: this table starts empty and every resume
// generated before it existed has zero rows (see `jobs.resumeGeneratedAt`, which is what tells a
// legacy resume apart from one that was never generated).
//
// Append-only, exactly like cover_letters: edit and restore both INSERT. The row IS the version;
// DATA_DIR/resumes/{jobId}.pdf is merely the current render.
export const resumes = sqliteTable('resumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id),
  userId: integer('user_id').notNull().references(() => users.id),
  // The validated ResumeData, JSON-serialized. Re-parsed against resumeDataSchema on the way out —
  // a row written under an older, looser schema may no longer conform.
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  source: text('source', { enum: ['generated', 'edited'] }).notNull().default('generated'),
}, (table) => [
  index('resumes_user_id_idx').on(table.userId),
])

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
  userId: integer('user_id').notNull().references(() => users.id).default(1),
}, (table) => [
  index('webhook_runs_user_id_idx').on(table.userId),
])

export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  profileData: text('profile_data'),
}, (table) => [
  uniqueIndex('profile_user_id_idx').on(table.userId),
])

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull(), // IMAP UID — dedup key (folder:uid), unique per user
  messageId: text('message_id'), // RFC 2822 Message-ID — stable across folder moves, unique per user
  receivedAt: text('received_at').notNull(), // ISO 8601 datetime
  fromAddress: text('from_address').notNull(), // "Name <email>" or "email"
  subject: text('subject').notNull(),
  // User-set fields (all nullable = not yet mapped)
  type: text('type'),     // null | 'Submitted' | 'Rejected' | 'Screening' | 'Interview' | 'Offer' | 'Other'
  company: text('company'),
  jobTitle: text('job_title'),
  userId: integer('user_id').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('messages_uid_user_id_idx').on(table.uid, table.userId),
  uniqueIndex('messages_message_id_user_id_idx').on(table.messageId, table.userId),
  index('messages_user_id_idx').on(table.userId),
])

export const searchConfigs = sqliteTable('search_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  query: text('query').notNull(),
  location: text('location'),
  // Structured geo for the 'jsearch' source (JSearch v2 needs ISO alpha-2 country
  // + optional city). Scraper sources use `location` and leave these null.
  country: text('country'),
  city: text('city'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  userId: integer('user_id').notNull().references(() => users.id),
}, (table) => [
  index('search_configs_user_id_idx').on(table.userId),
])

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
  role: text('role').notNull().default('standard'), // 'standard' | 'admin' | 'test'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  activationToken: text('activation_token'),
  activationTokenExpiresAt: text('activation_token_expires_at'),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: text('reset_token_expires_at'),
  createdAt: text('created_at').notNull(),
  name: text('name'),
  lastLoginAt: text('last_login_at'),
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

export const inboxFolderMappings = sqliteTable('inbox_folder_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  folderPath: text('folder_path').notNull(),
  jobStatus: text('job_status').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('inbox_folder_mappings_user_id_idx').on(table.userId),
  uniqueIndex('inbox_folder_mappings_user_folder_unique_idx').on(table.userId, table.folderPath),
])

export const gmailLabelMappings = sqliteTable('gmail_label_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  label: text('label').notNull(),
  jobStatus: text('job_status').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('gmail_label_mappings_user_id_idx').on(table.userId),
  uniqueIndex('gmail_label_mappings_user_label_unique_idx').on(table.userId, table.label),
])

export const setupDismissals = sqliteTable('setup_dismissals', {
  userId: integer('user_id').notNull().references(() => users.id),
  taskId: text('task_id').notNull(),
  dismissedAt: text('dismissed_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.taskId] }),
])

export const sourceSettings = sqliteTable('source_settings', {
  source: text('source').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
})

export const featureSettings = sqliteTable('feature_settings', {
  feature: text('feature').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),         // 32-byte hex string; NOT autoincrement
  userId: integer('user_id').notNull().references(() => users.id),
  data: text('data'),                  // JSON blob; null is valid
  expiresAt: text('expires_at').notNull(),
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_expires_at_idx').on(table.expiresAt),
])

export const userEmbeddings = sqliteTable('user_embeddings', {
  userId:      integer('user_id').primaryKey().notNull().references(() => users.id),
  embedding:   text('embedding').notNull(),
  profileHash: text('profile_hash').notNull(),
})

export const companyBlacklist = sqliteTable('company_blacklist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  companyName: text('company_name').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  uniqueIndex('blacklist_user_company_idx').on(t.userId, t.companyName),
])
