import { z } from 'zod'

// Scraper-sourced input record (no id, no user-owned fields)
// Used for POST /api/ingest payload validation
export const jobInputSchema = z.object({
  company: z.string(),
  jobTitle: z.string(),
  fitScore: z.number().int().min(0).max(100).nullable(),
  recommendation: z.enum(['apply', 'investigate', 'skip']).nullable(),
  jobReqsMet: z.string().nullable(),
  jobReqsMissed: z.string().nullable(),
  candidateReqsMet: z.string().nullable(),
  candidateReqsMissed: z.string().nullable(),
  jobDescription: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  dateScraped: z.string().nullable(),
  source: z.string().nullable(),
  location: z.string().nullable(),
  salary: z.string().nullable(),
  benefits: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  analysisStatus: z.enum(['pending', 'analyzing', 'done', 'failed']).nullable(),
  externalJobId: z.string().nullable(),
})

// Full Job record — as returned by GET /api/jobs and used throughout client
export const jobSchema = jobInputSchema.extend({
  id: z.number().int(),
  applied: z.boolean(),
  status: z.string().nullable(),
  statusOverride: z.string().nullable(),
  coverLetterSentAt: z.string().nullable(),
  generationContext: z.string().nullable(),
  dateApplied: z.string().nullable(),
  appliedAt: z.string().nullable(),
  dateArchived: z.string().nullable(),
  archived: z.boolean(),
  resumeGeneratedAt: z.string().nullable(),
  latestStatus: z.string().nullable(),
  dateAnalyzed: z.string().nullable(),
  relevanceScore: z.number().nullable(),
})

// POST /api/ingest body — array of scraper-sourced records
export const ingestPayloadSchema = z.array(jobInputSchema)

// Success response for POST /api/ingest
export const syncResultSchema = z.object({
  added: z.number().int(),
  updated: z.number().int(),
})

// POST /api/webhooks/analysis body — optional. Absent body means a normal batch run.
// Supplying jobIds targets those jobs specifically, which is how a 'failed' job is retried
// (the batch path never selects failures). The cap keeps a targeted run comparable in cost to a
// batch one; the server still scopes every id to the caller's userId.
//
// The client clamps its request to this same constant, so a user who selects more failed rows than
// the cap gets a smaller retry rather than a 400.
export const ANALYSIS_RETRY_MAX = 25

export const analysisRequestSchema = z.object({
  jobIds: z.array(z.number().int().positive()).min(1).max(ANALYSIS_RETRY_MAX).optional(),
})

export const statusEventSchema = z.object({
  id: z.number().int(),
  jobId: z.number().int(),
  status: z.string(),
  timestamp: z.string(), // ISO 8601 full datetime
  source: z.enum(['manual', 'email']),
  emailSubject: z.string().optional(),
  emailSender: z.string().optional(),
})

export const COVER_LETTER_SOURCES = ['generated', 'edited'] as const
export const COVER_LETTER_MAX_CHARS = 20000

export const coverLetterSchema = z.object({
  id: z.number().int(),
  jobId: z.number().int(),
  content: z.string().min(1),
  createdAt: z.string(),
  source: z.enum(COVER_LETTER_SOURCES),
})
export type CoverLetter = z.infer<typeof coverLetterSchema>

// PUT /api/jobs/:id/cover-letter body. A blank letter is not a letter, so trim-then-min(1) rather
// than min(1) — '   ' must not save.
export const coverLetterEditSchema = z.object({
  content: z.string().trim().min(1).max(COVER_LETTER_MAX_CHARS),
})

// A row in the version list. Content is deliberately absent — the list renders id/source/date only,
// and shipping every draft's full prose to populate a dropdown would be wasteful.
export const coverLetterVersionSchema = z.object({
  id: z.number().int(),
  source: z.enum(COVER_LETTER_SOURCES),
  createdAt: z.string(),
})
export type CoverLetterVersion = z.infer<typeof coverLetterVersionSchema>

export const MESSAGE_TYPES = ['Submitted', 'Rejected', 'Screening', 'Interview', 'Offer', 'Other'] as const

export const inboxFolderMappingSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  folderPath: z.string(),
  jobStatus: z.enum(MESSAGE_TYPES),
  createdAt: z.string(),
})
export const inboxFolderMappingInputSchema = z.array(z.object({
  folderPath: z.string().min(1),
  jobStatus: z.enum(MESSAGE_TYPES),
}))
export type InboxFolderMapping = z.infer<typeof inboxFolderMappingSchema>
export type InboxFolderMappingInput = z.infer<typeof inboxFolderMappingInputSchema>

export const gmailLabelMappingSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  label: z.string(),
  jobStatus: z.enum(MESSAGE_TYPES),
  createdAt: z.string(),
})
export const gmailLabelMappingInputSchema = z.array(z.object({
  label: z.string().min(1),
  jobStatus: z.enum(MESSAGE_TYPES),
})).refine(
  (rows) => new Set(rows.map((r) => r.label)).size === rows.length,
  { message: 'Duplicate label' },
)
export type GmailLabelMapping = z.infer<typeof gmailLabelMappingSchema>
export type GmailLabelMappingInput = z.infer<typeof gmailLabelMappingInputSchema>

export const messageSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  receivedAt: z.string(),
  fromAddress: z.string(),
  subject: z.string(),
  type: z.enum(MESSAGE_TYPES).nullable(),
  company: z.string().nullable(),
  jobTitle: z.string().nullable(),
})

export const webhookRunSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  runAt: z.string(),
  success: z.boolean(),
  itemCount: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  costUsd: z.number().nullable(),
  matchedCount: z.number().int().nullable(),
  archivedCount: z.number().int().nullable(),
  sourceBreakdown: z.record(z.string(), z.number()).nullable(),
})
export type WebhookRun = z.infer<typeof webhookRunSchema>

export const activityRunTypeSchema = z.enum(['discovery', 'analysis', 'cover_letter', 'resume'])
export const activityRunStateSchema = z.enum(['running', 'done', 'failed'])
export const activityCountProgressSchema = z.object({
  count: z.number().int(),
  total: z.number().int().nullable(),
})
export const activityDocProgressSchema = z.object({
  company: z.string(),
  role: z.string(),
})
export const activityProgressSchema = z.union([activityCountProgressSchema, activityDocProgressSchema])
export const activityRunSchema = z.object({
  id: z.string(),
  type: activityRunTypeSchema,
  state: activityRunStateSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  progress: activityProgressSchema,
})
export type ActivityRunType = z.infer<typeof activityRunTypeSchema>
export type ActivityRunState = z.infer<typeof activityRunStateSchema>
export type ActivityProgress = z.infer<typeof activityProgressSchema>
export type ActivityRun = z.infer<typeof activityRunSchema>

export const STATS_PERIODS = ['24h', '7d', '30d', 'all'] as const
export type StatsPeriod = typeof STATS_PERIODS[number]

export const ACTIVITY_EVENT_TYPES = ['applied', 'status_change', 'resume', 'cover_letter'] as const
export type ActivityEventType = typeof ACTIVITY_EVENT_TYPES[number]

export const statsSchema = z.object({
  totalJobs: z.number(),
  kpis: z.object({
    hoursSaved: z.number(),
    strongMatches: z.number(),
    applicationsSent: z.number(),
    inPlay: z.number(),
  }),
  recentActivity: z.array(z.object({
    type: z.enum(ACTIVITY_EVENT_TYPES),
    timestamp: z.string(),
    jobTitle: z.string(),
    company: z.string(),
    status: z.string().nullable(),
  })),
  jobsByFitScore: z.array(z.object({ fitRange: z.string(), count: z.number() })),
  timeSavedByWorkflow: z.array(z.object({ workflow: z.string(), hours: z.number() })),
  workflowCostOverTime: z.array(z.object({
    date: z.string(),
    Discovery: z.number(),
    Analysis: z.number(),
    'Cover Letter': z.number(),
    Resume: z.number(),
  })),
})
export type Stats = z.infer<typeof statsSchema>

export const websiteSchema = z.object({ label: z.string(), url: z.string() })

export const jobEntrySchema = z.object({
  title: z.string(),
  company: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  current: z.boolean().default(false),
  employmentType: z.string().optional(),
  bullets: z.array(z.string()).default([]),
})

export const degreeEntrySchema = z.object({
  degreeType: z.string(),
  degreeSubject: z.string(),
  graduationDate: z.string().nullable(),
})

export const educationEntrySchema = z.object({
  name: z.string(),
  school: z.string(),
  current: z.boolean().default(false),
  degrees: z.array(degreeEntrySchema).default([]),
})

export const projectEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string().nullable().default(null),
})

export const certEntrySchema = z.object({
  name: z.string(),
  issuer: z.string(),
  year: z.string(),
})

export const licenceEntrySchema = certEntrySchema
export const awardEntrySchema = certEntrySchema

export const profilePersonalSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  summary: z.string().nullable(),
  skills: z.string().nullable().default(null),
  websites: z.array(websiteSchema).default([]),
})

export const profileExperienceSchema = z.object({
  jobs: z.array(jobEntrySchema).default([]),
  education: z.array(educationEntrySchema).default([]),
  projects: z.array(projectEntrySchema).default([]),
  certifications: z.array(certEntrySchema).default([]),
  licences: z.array(licenceEntrySchema).default([]),
  awards: z.array(awardEntrySchema).default([]),
})

export const profileDataSchema = z.object({
  personal: profilePersonalSchema,
  experience: profileExperienceSchema,
})

export const profileDataInputSchema = profileDataSchema

export type ProfileData = z.infer<typeof profileDataSchema>
export type ProfileDataInput = z.infer<typeof profileDataInputSchema>

export const jobDetailSchema = jobSchema.pick({
  company: true,
  jobTitle: true,
  location: true,
  jobDescription: true,
})
export type JobDetail = z.infer<typeof jobDetailSchema>

export type Job = z.infer<typeof jobSchema>
export type JobInput = z.infer<typeof jobInputSchema>
export type IngestPayload = z.infer<typeof ingestPayloadSchema>
export type SyncResult = z.infer<typeof syncResultSchema>
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>
export type StatusEvent = z.infer<typeof statusEventSchema>
export type Message = z.infer<typeof messageSchema>

// Note: 'jsearch' is not scraped — it's the managed JSearch/Google-for-Jobs feed
// (see job-search/ provider). The enum name is now a slight misnomer; kept as-is
// because renaming ripples across the schema, admin toggles, DB_SOURCE, and the UI.
export const SCRAPER_SOURCES = ['linkedin', 'indeed', 'indeed_nl', 'arc', 'jsearch'] as const
export const scraperSourceSchema = z.enum(SCRAPER_SOURCES)
export const searchConfigSchema = z.object({
  id: z.number().int(),
  source: scraperSourceSchema,
  query: z.string(),
  location: z.string().nullable(),
  // country (ISO alpha-2) + city are used only by the 'jsearch' source; scraper
  // sources read `location`. See spec-jsearch-discovery-wiring.
  country: z.string().nullable(),
  city: z.string().nullable(),
  enabled: z.boolean(),
})
export const searchConfigInputSchema = z.object({
  source: scraperSourceSchema,
  query: z.string().min(1),
  location: z.string().nullable(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
}).superRefine((val, ctx) => {
  // JSearch v2 requires a structured country; a location baked into the query returns
  // zero. The refine only *requires* country for jsearch — it does not forbid it elsewhere.
  if (val.source === 'jsearch' && (val.country == null || val.country.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['country'],
      message: 'country is required for the jsearch source (ISO alpha-2, e.g. "nl")',
    })
  }
})
export type SearchConfig = z.infer<typeof searchConfigSchema>
export type SearchConfigInput = z.infer<typeof searchConfigInputSchema>
export type ScraperSource = z.infer<typeof scraperSourceSchema>

export const sourceSettingSchema = z.object({
  source: scraperSourceSchema,
  enabled: z.boolean(),
})
export type SourceSetting = z.infer<typeof sourceSettingSchema>

export const featureSettingsSchema = z.object({
  emailFeatures: z.boolean(),
})
export type FeatureSettings = z.infer<typeof featureSettingsSchema>

export const PROMPT_FLOWS = ['analysis', 'cover_letter', 'resume'] as const
export const promptFlowSchema = z.enum(PROMPT_FLOWS)
export const promptSchema = z.object({
  flow: promptFlowSchema,
  systemPrompt: z.string().nullable(),
  userMessage: z.string(),
  updatedAt: z.string().nullable(),
  isCustom: z.boolean(),
})
export const promptInputSchema = z.object({
  systemPrompt: z.string().nullable(),
  userMessage: z.string().min(1).refine(s => s.trim().length > 0, { message: 'userMessage must not be blank' }),
})
export type Prompt = z.infer<typeof promptSchema>
export type PromptInput = z.infer<typeof promptInputSchema>
export type PromptFlow = z.infer<typeof promptFlowSchema>

export type AdminUser = {
  id: number
  email: string
  name: string | null
  role: string
  isActive: boolean
  createdAt: string
  lastLoginAt: string | null
}

export type SessionResponse = {
  userId: number
  email: string
  role: string
  impersonating?: { id: number; email: string; name: string | null }
}

export type InviteKey = {
  id: number
  key: string
  status: 'unused' | 'used'
  usedByEmail: string | null
  usedAt: string | null
}

export type OnboardingStatusResponse = {
  hasAnthropicKey: boolean
  hasImap: boolean
  hasLinkedinAuth: boolean
  hasIndeedAuth: boolean
  hasGmail: boolean
  gmailAddress: string | null
  onboardingComplete: boolean
}

export const blacklistEntrySchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  companyName: z.string(),
  createdAt: z.string(),
})
export const blacklistEntryInputSchema = z.object({
  companyName: z.string().min(1).refine(s => s.trim().length > 0, 'Company name cannot be blank'),
})
export type BlacklistEntry = z.infer<typeof blacklistEntrySchema>
export type BlacklistEntryInput = z.infer<typeof blacklistEntryInputSchema>

// Bounds exist because this schema now guards a USER-writable path (PUT /api/jobs/:id/resume), not
// just LLM output. Save hands the parsed data straight to a Playwright chromium launch whose
// pagination engine measures overflow in a loop under a 15s timeout — an unbounded `summary` or a
// 5,000-entry `experience` turns Save into a self-inflicted DoS. Every limit here is several times
// the resume prompt's own CONTENT LIMITS (3–6 skill groups, 3–5 bullets of ~140–170 chars, 1–4
// projects), so a real generation cannot trip them. They bind the generate path too, deliberately:
// an LLM emitting a monster is equally unwelcome.
//
// `.trim().min(1)` marks the fields a resume is meaningless without. z.string() accepts '', so
// without this a user could empty every identity field and Save a blank-but-valid resume — and
// `.min(1)` on an array bounds its LENGTH, not the content of its strings, so each bullet needs its
// own non-blank rule. website / linkedin / location / projects[].url are legitimately empty and are
// left free.
const RESUME_MAX = {
  name: 100, title: 120, email: 200, url: 300, location: 200, summary: 2000,
  groupLabel: 100, skill: 100, groups: 30, skillsPerGroup: 50,
  school: 200, degree: 200, year: 50, education: 30,
  projectName: 200, projectDesc: 1000, stack: 300, projectUrl: 500, projects: 30,
  company: 200, dates: 100, role: 200, experience: 40, bullet: 600, bullets: 20,
} as const

export const resumeDataSchema = z.object({
  first_name:   z.string().trim().min(1).max(RESUME_MAX.name),
  last_name:    z.string().trim().min(1).max(RESUME_MAX.name),
  title_01:     z.string().trim().min(1).max(RESUME_MAX.title),
  title_02:     z.string().trim().min(1).max(RESUME_MAX.title),
  email:        z.string().max(RESUME_MAX.email),
  website:      z.string().max(RESUME_MAX.url),
  linkedin:     z.string().max(RESUME_MAX.url),
  location:     z.string().max(RESUME_MAX.location),
  summary:      z.string().trim().min(1).max(RESUME_MAX.summary),
  skill_groups: z.array(z.object({
    label:  z.string().max(RESUME_MAX.groupLabel),
    skills: z.array(z.string().max(RESUME_MAX.skill)).max(RESUME_MAX.skillsPerGroup),
  })).max(RESUME_MAX.groups),
  education:    z.array(z.object({
    school: z.string().max(RESUME_MAX.school),
    degree: z.string().max(RESUME_MAX.degree),
    year:   z.string().max(RESUME_MAX.year),
  })).max(RESUME_MAX.education),
  projects:     z.array(z.object({
    name:  z.string().max(RESUME_MAX.projectName),
    desc:  z.string().max(RESUME_MAX.projectDesc),
    stack: z.string().max(RESUME_MAX.stack),
    url:   z.string().max(RESUME_MAX.projectUrl).default(''),
  })).max(RESUME_MAX.projects),
  experience:   z.array(z.object({
    company:  z.string().trim().min(1).max(RESUME_MAX.company),
    location: z.string().max(RESUME_MAX.location),
    dates:    z.string().max(RESUME_MAX.dates),
    role:     z.string().trim().min(1).max(RESUME_MAX.role),
    bullets:  z.array(z.string().trim().min(1).max(RESUME_MAX.bullet)).min(1).max(RESUME_MAX.bullets),
  })).min(1).max(RESUME_MAX.experience),
})
export type ResumeData = z.infer<typeof resumeDataSchema>

// title_02 must not contain "and" or "&" — a TEMPLATE RENDERING constraint, not an LLM-output one,
// so it binds a user's typing exactly as it binds the model's. Shared by the generate path and the
// edit route so the two cannot disagree about what a valid title is.
export function title02Violation(title02: string): boolean {
  return /\band\b/i.test(title02) || title02.includes('&')
}

// The generate path SANITIZES rather than rejects: the model occasionally slips an "and"/"&" into
// title_02 despite the prompt rule, and throwing away an entire paid generation over a two-word
// cosmetic field is the wrong trade. The template renders "title_01 and title_02", so a connective
// inside title_02 doubles it ("Engineer and X and Y"). Keeping only the first clause — everything
// before the first "and"/"&" — restores the intended grammar. The word boundary spares titles like
// "Brand Strategist" (the "and" must stand alone); a literal "&" is always a connective here, so
// "no ampersands" holds even at the cost of clipping a rare "R&D"-style title to its first token.
export function sanitizeTitle02(title02: string): string {
  return title02.replace(/\s*(?:\band\b|&).*$/is, '').trim()
}

export const RESUME_SOURCES = ['generated', 'edited'] as const

// PUT /api/jobs/:id/resume body.
export const resumeEditSchema = z.object({
  data: resumeDataSchema,
})

// A row in the version list. `data` is deliberately absent — the dropdown renders id/source/date
// only, and shipping every version's full JSON to populate it would be wasteful.
export const resumeVersionSchema = z.object({
  id: z.number().int(),
  source: z.enum(RESUME_SOURCES),
  createdAt: z.string(),
})
export type ResumeVersion = z.infer<typeof resumeVersionSchema>

export const SETUP_TASK_ORDER = ['linkedin', 'apiKey', 'profile', 'inboxConnect', 'inboxMapping'] as const

export const setupTaskIdSchema = z.enum(SETUP_TASK_ORDER)
export const setupTaskStateSchema = z.enum(['notStarted', 'partial', 'complete', 'broken'])
export const setupTaskTierSchema = z.enum(['required', 'optional'])

export const setupTaskSchema = z.object({
  id: setupTaskIdSchema,
  state: setupTaskStateSchema,
  tier: setupTaskTierSchema,
  dependsOn: setupTaskIdSchema.nullable(),
  dismissed: z.boolean(),
  progress: z.object({ filled: z.number().int(), total: z.number().int() }).nullable(),
})

export const setupStatusSchema = z.object({
  tasks: z.array(setupTaskSchema),
  ready: z.boolean(),
})

export type SetupTaskId = z.infer<typeof setupTaskIdSchema>
export type SetupTaskState = z.infer<typeof setupTaskStateSchema>
export type SetupTaskTier = z.infer<typeof setupTaskTierSchema>
export type SetupTask = z.infer<typeof setupTaskSchema>
export type SetupStatus = z.infer<typeof setupStatusSchema>
