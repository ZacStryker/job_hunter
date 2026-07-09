import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { prompts } from '../../db/schema'

export const PROMPT_FLOWS = ['analysis', 'cover_letter', 'resume'] as const
export type PromptFlow = typeof PROMPT_FLOWS[number]

export interface PromptConfig {
  systemPrompt: string | null
  userMessage: string
}

// Boundary between the cacheable stable prefix and the volatile per-job section of the analysis
// prompt. analysis-service splits the (possibly user-customised) template here to place the prompt
// cache breakpoint. A custom prompt that omits this marker simply sends one uncached block.
export const ANALYSIS_JOB_LISTING_MARKER = 'JOB LISTING:'

export const DEFAULT_PROMPTS: Record<PromptFlow, PromptConfig> = {
  analysis: {
    systemPrompt: null,
    // The stable prefix (intro + profile + preferences + scoring + output schema) comes first so it
    // is byte-identical across every job in a run and can be prompt-cached. The volatile per-job
    // section ("JOB LISTING:" + the listing JSON) is last; analysis-service splits on the
    // ANALYSIS_JOB_LISTING_MARKER below and places the cache breakpoint at the end of the prefix.
    userMessage:
      'You are evaluating a job opportunity for {{CANDIDATE_NAME}}.\n\n' +
      'CANDIDATE BACKGROUND:\n{{CANDIDATE_PROFILE_JSON}}\n\n' +
      'JOB PREFERENCES: full-time, English-speaking environment\n\n' +
      'Analyze this job for {{CANDIDATE_NAME}}. First fill in the four assessment fields and the ' +
      'recommendation, then weigh them to compute the score last. Always fill in every field below ' +
      '\u2014 never return null for the four assessment fields.\n\n' +
      'Respond with this JSON structure:\n' +
      '{ "job_reqs_met": "<string>", "job_reqs_missed": "<string>", "candidate_reqs_met": "<string>", "candidate_reqs_missed": "<string>", "salary": "<string or null>", "benefits": "<string or null>", "contact_name": "<string or null>", "contact_email": "<string or null>", "contact_phone": "<string or null>", "recommended_action": "apply or investigate or skip", "score": <integer 0-100> }\n\n' +
      'FIELD MEANINGS — the four assessment fields are two distinct axes:\n' +
      'ROLE/LOGISTICS FIT (the job measured against the candidate\'s preferences):\n' +
      '- job_reqs_met: ways this job fits the candidate\'s preferences — work arrangement (full-time, remote/hybrid), language, location, compensation, benefits, seniority, industry/company type, growth. NOT skills or experience.\n' +
      '- job_reqs_missed: ways this job falls short of those preferences.\n' +
      'QUALIFICATION FIT (the candidate measured against the job\'s requirements):\n' +
      '- candidate_reqs_met: skills, years of experience, education, and certifications the job requires that the candidate has.\n' +
      '- candidate_reqs_missed: those the job requires that the candidate lacks.\n\n' +
      'ROUTING RULE: each observation belongs to exactly ONE field. Skills, experience, education, ' +
      'certifications go on the candidate_reqs_* axis. Preferences, logistics, compensation, benefits, ' +
      'company attributes go on the job_reqs_* axis. Never place the same fact on both axes.\n\n' +
      'FORMAT for those four fields: a single string of comma-separated shorthand bullets. The comma ' +
      'is a reserved delimiter that separates one bullet from the next — NEVER use a comma inside ' +
      'a bullet\'s text. Use a different separator (e.g. "/", ";", "and", or just a space) if you need ' +
      'to list things within one bullet. Prefix EVERY bullet with exactly one marker character:\n' +
      '- "+" = full match / met\n' +
      '- "~" = partial match or an equivalent/transferable substitute\n' +
      '- "-" = not met / missing\n' +
      'Example candidate_reqs_met: "+5+ yrs TypeScript, ~Go (Rust transferable), -No Kubernetes exp"\n\n' +
      'SCORING: compute the score AFTER the four fields, deriving it from them. It reflects both ' +
      'qualification fit and role/logistics fit. Bands (0-100):\n' +
      '- 90-100 exceptional: strongly qualified AND the role fits the candidate\'s preferences well.\n' +
      '- 75-89 strong: well qualified and a good preference fit, only minor gaps.\n' +
      '- 55-74 moderate: meaningful gaps in qualifications or preference fit.\n' +
      '- 35-54 weak: substantial gaps on one or both axes.\n' +
      '- 0-34 poor: largely unqualified or a clear preference mismatch.\n' +
      'Choose the band the four fields above justify, then pick a specific number within it that ' +
      'reflects this job in particular. Use the full range and vary within the band — do not ' +
      'default to a habitual round number.\n\n' +
      'Respond with ONLY valid JSON \u2014 no markdown, no code blocks, no explanation.\n\n' +
      'JOB LISTING:\n{{JOB_LISTING_JSON}}',
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
      '  "projects": [{ "name": "string", "desc": "string", "stack": "string", "url": "string" }],\n' +
      '  "experience": [{ "company": "string", "location": "string", "dates": "string", "role": "string", "bullets": ["string"] }]\n' +
      '}\n\n' +
      'HARD RULES \u2014 never violate:\n' +
      '- Return ONLY the JSON object. No text before or after it.\n' +
      '- No invented content \u2014 every value must come from the candidate profile.\n' +
      '- experience: output one object for every work entry in the candidate profile, including contract, freelance, and part-time roles; do not omit, merge, or combine any entry.\n' +
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
      '- bullets: maximize relevance to the role; never trim metrics, named technologies, or most-recent-job entries; never remove an entire experience entry to create space.\n' +
      '- projects: choose those most relevant to the job; filter out the rest. stack is a "\u00b7"-separated string (e.g. "TypeScript \u00b7 Bun \u00b7 SQLite").\n' +
      '- url: copy the chosen project\'s URL verbatim into its "url" field (it appears as "[URL: ...]" in the profile); use an empty string "" when the project has no URL.',
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
