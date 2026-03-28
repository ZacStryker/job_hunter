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
})

// Full Job record — as returned by GET /api/jobs and used throughout client
export const jobSchema = jobInputSchema.extend({
  id: z.number().int(),
  applied: z.boolean(),
  status: z.string().nullable(),
  statusOverride: z.string().nullable(),
  coverLetterSentAt: z.string().nullable(),
  dateApplied: z.string().nullable(),
})

// POST /api/ingest body — array of Sheets-sourced records
export const ingestPayloadSchema = z.array(jobInputSchema)

// Success response for POST /api/ingest and POST /api/sync
export const syncResultSchema = z.object({
  added: z.number().int(),
  updated: z.number().int(),
})

export type Job = z.infer<typeof jobSchema>
export type JobInput = z.infer<typeof jobInputSchema>
export type IngestPayload = z.infer<typeof ingestPayloadSchema>
export type SyncResult = z.infer<typeof syncResultSchema>
