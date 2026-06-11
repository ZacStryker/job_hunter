import { z } from 'zod'

// Scraper-sourced input record (no id, no user-owned fields)
// Used for POST /api/ingest payload validation
export const jobInputSchema = z.object({
  company: z.string(),
  jobTitle: z.string(),
  fitScore: z.number().int().min(0).max(100).nullable(),
  recommendation: z.enum(['apply', 'investigate', 'skip']).nullable(),
  roleFit: z.string().nullable(),
  requirementsMet: z.string().nullable(),
  requirementsMissed: z.string().nullable(),
  redFlags: z.string().nullable(),
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
  dateApplied: z.string().nullable(),
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

export const statusEventSchema = z.object({
  id: z.number().int(),
  jobId: z.number().int(),
  status: z.string(),
  timestamp: z.string(), // ISO 8601 full datetime
  source: z.enum(['manual', 'email']),
  emailSubject: z.string().optional(),
  emailSender: z.string().optional(),
})

export const coverLetterSchema = z.object({
  id: z.number().int(),
  jobId: z.number().int(),
  content: z.string().min(1),
  createdAt: z.string(),
})
export type CoverLetter = z.infer<typeof coverLetterSchema>

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

export const STATS_PERIODS = ['24h', '7d', '30d', 'all'] as const
export type StatsPeriod = typeof STATS_PERIODS[number]

export const statsSchema = z.object({
  jobs: z.object({
    total: z.number(),
    companies: z.number(),
    sources: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      linkedin: z.number(),
      indeed: z.number(),
      indeed_nl: z.number(),
      arc: z.number(),
      manual: z.number(),
    })),
    bySource: z.array(z.object({ name: z.string(), value: z.number() })),
  }),
  matches: z.object({
    total: z.number(),
    apply: z.number(),
    investigate: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      apply: z.number(),
      investigate: z.number(),
    })),
    byRecommendation: z.array(z.object({ name: z.string(), value: z.number() })),
    byScore: z.array(z.object({ score: z.string(), count: z.number() })),
  }),
  applications: z.object({
    total: z.number(),
    companies: z.number(),
    responses: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      'No Response': z.number(),
      Submitted: z.number(),
      Rejected: z.number(),
      Screening: z.number(),
      Interview: z.number(),
      Offer: z.number(),
      Other: z.number(),
    })),
    byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
  }),
  automation: z.object({
    totalRuns: z.number(),
    totalTokens: z.number(),
    totalCost: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      Discovery: z.number(),
      Analysis: z.number(),
      'Cover Letter': z.number(),
      Resume: z.number(),
    })),
    costByWorkflow: z.array(z.object({ workflow: z.string(), cost: z.number() })),
  }),
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
export type StatusEvent = z.infer<typeof statusEventSchema>
export type Message = z.infer<typeof messageSchema>

export const SCRAPER_SOURCES = ['linkedin', 'indeed', 'indeed_nl', 'arc'] as const
export const scraperSourceSchema = z.enum(SCRAPER_SOURCES)
export const searchConfigSchema = z.object({
  id: z.number().int(),
  source: scraperSourceSchema,
  query: z.string(),
  location: z.string().nullable(),
  enabled: z.boolean(),
})
export const searchConfigInputSchema = z.object({
  source: scraperSourceSchema,
  query: z.string().min(1),
  location: z.string().nullable(),
})
export type SearchConfig = z.infer<typeof searchConfigSchema>
export type SearchConfigInput = z.infer<typeof searchConfigInputSchema>
export type ScraperSource = z.infer<typeof scraperSourceSchema>

export const sourceSettingSchema = z.object({
  source: scraperSourceSchema,
  enabled: z.boolean(),
})
export type SourceSetting = z.infer<typeof sourceSettingSchema>

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

export const resumeDataSchema = z.object({
  first_name:   z.string(),
  last_name:    z.string(),
  title_01:     z.string(),
  title_02:     z.string(),
  email:        z.string(),
  website:      z.string(),
  linkedin:     z.string(),
  location:     z.string(),
  summary:      z.string(),
  skill_groups: z.array(z.object({ label: z.string(), skills: z.array(z.string()) })),
  education:    z.array(z.object({ school: z.string(), degree: z.string(), year: z.string() })),
  projects:     z.array(z.object({ name: z.string(), desc: z.string(), stack: z.string() })),
  experience:   z.array(z.object({
    company:  z.string(),
    location: z.string(),
    dates:    z.string(),
    role:     z.string(),
    bullets:  z.array(z.string()).min(1),
  })).min(1),
})
export type ResumeData = z.infer<typeof resumeDataSchema>
