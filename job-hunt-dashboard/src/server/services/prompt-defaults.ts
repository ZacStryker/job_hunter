import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { prompts } from '../../db/schema'

export const PROMPT_FLOWS = ['analysis', 'cover_letter', 'resume'] as const
export type PromptFlow = typeof PROMPT_FLOWS[number]

export interface PromptConfig {
  systemPrompt: string | null
  userMessage: string
}

export const DEFAULT_PROMPTS: Record<PromptFlow, PromptConfig> = {
  analysis: {
    systemPrompt: null,
    userMessage:
      'You are evaluating a job opportunity for {{CANDIDATE_NAME}}.\n\n' +
      'CANDIDATE BACKGROUND:\n{{CANDIDATE_PROFILE_JSON}}\n\n' +
      'JOB PREFERENCES: full-time, English-speaking environment\n\n' +
      'JOB LISTING:\n{{JOB_LISTING_JSON}}\n\n' +
      'Analyze this job for {{CANDIDATE_NAME}}. Respond with ONLY valid JSON \u2014 no markdown, no code blocks, no explanation:\n' +
      '{ "score": <integer 1-99>, "role_fit": "<string>", "red_flags": "<string>", "requirements_met": "<string>", "requirements_missed": "<string>", "salary": "<string or null>", "benefits": "<string or null>", "contact_name": "<string or null>", "contact_email": "<string or null>", "contact_phone": "<string or null>", "recommended_action": "<apply|investigate|skip>" }',
  },
  cover_letter: {
    systemPrompt:
      'You are an expert cover letter writer. Write compelling, concise, personalized cover letters.\n\n' +
      'CANDIDATE PROFILE:\n{{CANDIDATE_PROFILE}}\n\n' +
      'TARGET: ML/GenAI engineering roles in the Netherlands and remote internationally.',
    userMessage:
      'Write a tailored cover letter for this role. No emdashes. Be specific \u2014 reference 2-3 of my relevant achievements. ' +
      'Keep it to 3 paragraphs. Do not add a date or address block, just start with the salutation.\n\n' +
      '{{JOB_DETAILS}}',
  },
  resume: {
    systemPrompt:
      'You are an expert resume writer. Return ONLY valid HTML \u2014 no markdown, no code fences, no explanatory text.\n\n' +
      'CANDIDATE PROFILE:\n{{CANDIDATE_PROFILE}}',
    userMessage:
      'Generate a tailored functional HTML resume for this role. ' +
      'Reorder and reword skills and bullets for maximum relevance. ' +
      'No emdashes. Descending chronological order for experience.\n\n' +
      '{{JOB_DETAILS}}',
  },
}

export function loadEffectivePrompt(flow: PromptFlow): PromptConfig {
  const row = db.select().from(prompts).where(eq(prompts.flow, flow)).get()
  if (row) return { systemPrompt: row.systemPrompt, userMessage: row.userMessage }
  return DEFAULT_PROMPTS[flow]
}
