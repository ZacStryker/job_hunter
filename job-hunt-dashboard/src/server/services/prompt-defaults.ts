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
      'Analyze this job for {{CANDIDATE_NAME}}. First, score the match on a <1-99> scale. \n\n' +
      'If the score is less than 50, respond with this JSON structure:\n' +
      '{ "score": <integer 1-49>, "role_fit": null, "red_flags": null, "requirements_met": null, "requirements_missed": null,  "salary": null, "benefits": null, "contact_name": null, "contact_email": null, "contact_phone": null, "recommended_action": "skip" } \n\n' +
      'If the score is 50 or more, respond with this JSON structure:\n' +
      '{ "score": <integer 50-99>, "role_fit": "<string>", "red_flags": "<string>", "requirements_met": "<string>", "requirements_missed": "<string>", "salary": "<string or null>", "benefits": "<string or null>", "contact_name": "<string or null>", "contact_email": "<string or null>", "contact_phone": "<string or null>", "recommended_action": "apply or investigate or skip" } \n\n' +
      'Respond with ONLY valid JSON \u2014 no markdown, no code blocks, no explanation.',
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
      'You are an expert resume writer. Analyze the candidate profile and job description, ' +
      'then return ONLY a valid JSON object \u2014 no markdown, no code fences, no explanatory text.\n\n' +
      'CANDIDATE PROFILE:\n{{CANDIDATE_PROFILE}}\n\n' +
      'OUTPUT FORMAT \u2014 return exactly this shape:\n' +
      '{\n' +
      '  "first_name": "string",\n' +
      '  "last_name": "string",\n' +
      '  "title_01": "string",\n' +
      '  "title_02": "string",\n' +
      '  "email": "string",\n' +
      '  "website": "string",\n' +
      '  "linkedin": "string",\n' +
      '  "location": "string",\n' +
      '  "summary": "string",\n' +
      '  "skill_groups": [{ "label": "string", "skills": ["string"] }],\n' +
      '  "education": [{ "school": "string", "degree": "string", "year": "string" }],\n' +
      '  "projects": [{ "name": "string", "desc": "string", "stack": "string" }],\n' +
      '  "experience": [{ "company": "string", "location": "string", "dates": "string", "role": "string", "bullets": ["string"] }]\n' +
      '}\n\n' +
      'HARD RULES \u2014 never violate:\n' +
      '- Return ONLY the JSON object. No text before or after it.\n' +
      '- No invented content \u2014 every value must come from the candidate profile.\n' +
      '- experience: ordered most-recent first (descending by start date).\n' +
      '- title_02: must not contain "and" or "&" \u2014 the template renders "title_01 and title_02".\n' +
      '- skills: "/" only when one is a direct subset/superset/prerequisite of the other ' +
      '(e.g. "TypeScript/JavaScript" \u2714; "Python/SQL" \u2718).\n' +
      '- No em-dashes (\u2014) in any string \u2014 use a hyphen (-) or restructure.\n' +
      '- first_name, last_name, email, website, linkedin, location: copy exactly from the candidate profile.\n\n' +
      'CONTENT LIMITS:\n' +
      '- skill_groups: 3\u20136 groups (empty array [] omits the Skills section entirely).\n' +
      '- skills per group: 3\u20135 items.\n' +
      '- projects: 1\u20134 entries (empty array [] omits the Projects section entirely).\n' +
      '- bullets per experience entry: 3\u20135.\n' +
      '- bullet length: ~140\u2013170 characters.\n' +
      '- education: copy exactly if present in profile; use [] if not present.\n\n' +
      'TAILORING GUIDANCE:\n' +
      '- title_01: primary title signaling compatibility with both the candidate background and the target role.\n' +
      '- title_02: secondary title for dual expertise or sub-specialization (no "and"/"&").\n' +
      '- skill_groups: infer relevant group labels from the job description; populate each with skills from the profile.\n' +
      '- summary: 2\u20134 sentences, high-impact professional tone, reference relevant achievements.\n' +
      '- bullets: maximize relevance to the role; never trim metrics, named technologies, or most-recent-job entries unless no other option remains.\n' +
      '- projects: choose those most relevant to the job; filter out the rest. stack is a "\u00b7"-separated string (e.g. "TypeScript \u00b7 Bun \u00b7 SQLite").',
    userMessage:
      'Tailor a resume for this role. Return ONLY the JSON object as specified.\n\n' +
      '{{JOB_DETAILS}}',
  },
}

export function loadEffectivePrompt(flow: PromptFlow): PromptConfig {
  const row = db.select().from(prompts).where(eq(prompts.flow, flow)).get()
  if (row) return { systemPrompt: row.systemPrompt, userMessage: row.userMessage }
  return DEFAULT_PROMPTS[flow]
}
