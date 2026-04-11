import { z } from 'zod'

// Sheets-sourced input record (no id, no user-owned fields)
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
  latestStatus: z.string().nullable(),
})

// POST /api/ingest body — array of Sheets-sourced records
export const ingestPayloadSchema = z.array(jobInputSchema)

// Success response for POST /api/ingest and POST /api/sync
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

export type Job = z.infer<typeof jobSchema>
export type JobInput = z.infer<typeof jobInputSchema>
export type IngestPayload = z.infer<typeof ingestPayloadSchema>
export type SyncResult = z.infer<typeof syncResultSchema>
export type StatusEvent = z.infer<typeof statusEventSchema>
export type Message = z.infer<typeof messageSchema>
