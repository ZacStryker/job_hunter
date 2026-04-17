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
})
export type WebhookRun = z.infer<typeof webhookRunSchema>

export const STATS_PERIODS = ['24h', '7d', '30d', 'all'] as const
export type StatsPeriod = typeof STATS_PERIODS[number]

export const statsSchema = z.object({
  pipeline: z.object({
    total: z.number(),
    byRecommendation: z.array(z.object({ name: z.string(), value: z.number() })),
    byFitScore: z.array(z.object({ bucket: z.string(), count: z.number() })),
  }),
  scraped: z.object({
    total: z.number(),
    perDay: z.array(z.object({
      date: z.string(),
      apply: z.number(),
      investigate: z.number(),
      skip: z.number(),
      none: z.number(),
    })),
  }),
  archived: z.object({
    total: z.number(),
  }),
  applications: z.object({
    total: z.number(),
    byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
    responseRate: z.number().nullable(),
  }),
  emails: z.object({
    total: z.number(),
    byType: z.array(z.object({ type: z.string(), count: z.number() })),
  }),
  automation: z.object({
    totalRuns: z.number(),
    successRate: z.number().nullable(),
    byWorkflow: z.array(z.object({ workflow: z.string(), success: z.number(), failed: z.number() })),
    coverLettersGenerated: z.number(),
  }),
})
export type Stats = z.infer<typeof statsSchema>

export const profileSchema = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  summary: z.string().nullable(),
  experience: z.string().nullable(),
  skills: z.string().nullable(),
  education: z.string().nullable(),
})

export const profileInputSchema = profileSchema.omit({ id: true })

export type Profile = z.infer<typeof profileSchema>
export type ProfileInput = z.infer<typeof profileInputSchema>

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
