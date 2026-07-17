import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { profile, userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import { generatePdf } from './generate-pdf'
import { loadEffectivePrompt } from './prompt-defaults'
import { buildResumeHtml } from '../../shared/resume-html'
import { resumeDataSchema, profileDataSchema, sanitizeTitle02 } from '../../shared/schemas'
import type { Job, ProfileData, ResumeData } from '../../shared/schemas'

const EMPTY_PROFILE_DATA: ProfileData = {
  personal: { fullName: '', email: '', phone: null, location: null, summary: null, skills: null, websites: [] },
  experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] },
}

function parseProfileData(raw: string | null | undefined): ProfileData {
  if (!raw) return EMPTY_PROFILE_DATA
  try {
    const p = profileDataSchema.safeParse(JSON.parse(raw))
    return p.success ? p.data : EMPTY_PROFILE_DATA
  } catch { return EMPTY_PROFILE_DATA }
}

function buildProfileText(pd: ProfileData): string {
  const websiteLines = pd.personal.websites.map(w => `${w.label}: ${w.url}`).join('\n')
  const jobLines = pd.experience.jobs.map(j =>
    `${j.company} — ${j.title} (${j.startDate}${j.endDate ? ` – ${j.endDate}` : j.current ? ' – Present' : ''})\n${j.bullets.map(b => `  • ${b}`).join('\n')}`
  ).join('\n\n')
  const projectLines = pd.experience.projects.map(p => `${p.name}: ${p.description}${p.url ? ` [URL: ${p.url}]` : ''}`).join('\n')
  const eduLines = pd.experience.education.map(e =>
    `${e.school} — ${e.name}${e.degrees.length ? ` (${e.degrees.map(d => `${d.degreeType} ${d.degreeSubject}`).join(', ')})` : ''}`
  ).join('\n')
  const certLines = pd.experience.certifications.map(c => `${c.name} — ${c.issuer} (${c.year})`).join('\n')
  const licenceLines = pd.experience.licences.map(l => `${l.name} — ${l.issuer} (${l.year})`).join('\n')
  const awardLines = pd.experience.awards.map(a => `${a.name} — ${a.issuer} (${a.year})`).join('\n')
  return [
    `Name: ${pd.personal.fullName}`,
    `Email: ${pd.personal.email}`,
    pd.personal.phone ? `Phone: ${pd.personal.phone}` : null,
    pd.personal.location ? `Location: ${pd.personal.location}` : null,
    pd.personal.summary ? `Summary: ${pd.personal.summary}` : null,
    pd.personal.skills ? `Skills: ${pd.personal.skills}` : null,
    websiteLines ? `Websites:\n${websiteLines}` : null,
    jobLines ? `Jobs:\n${jobLines}` : null,
    projectLines ? `Projects:\n${projectLines}` : null,
    eduLines ? `Education:\n${eduLines}` : null,
    certLines ? `Certifications:\n${certLines}` : null,
    licenceLines ? `Licences:\n${licenceLines}` : null,
    awardLines ? `Awards:\n${awardLines}` : null,
  ].filter(Boolean).join('\n')
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

const TEMPLATE_PATH = join(import.meta.dir, '../../../resume_templates/resume_template(1).html')

// The single source of truth for the template bytes. The server renders from this file and the
// client previews from these same bytes (served by GET /api/resume-template), so the two cannot
// drift — which is the entire reason buildResumeHtml takes the template as a parameter.
export function readResumeTemplate(): Promise<string> {
  return readFile(TEMPLATE_PATH, 'utf-8')
}

// The render half, shared by edit and restore. No Anthropic call: these are renders, not
// generations. Kept next to generateResume so both paths render through exactly one code path.
export async function renderResumePdf(data: ResumeData): Promise<Buffer> {
  return generatePdf(buildResumeHtml(data, await readResumeTemplate()))
}

// `userId` is REQUIRED, not optional: a resumes row cannot be written without it, and making it
// required means typecheck enforces that forever rather than a null slipping through at runtime.
export async function generateResume(job: Job, userId: number): Promise<{ data: ResumeData; pdf: Buffer; inputTokens: number; outputTokens: number }> {
  let apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const row = db.select({ ciphertext: userSecrets.ciphertext })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'anthropic_api_key')))
      .get()
    if (row) apiKey = decrypt(row.ciphertext)
  }
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const profileRow = db.select().from(profile).where(eq(profile.userId, userId)).get() ?? null
  const promptConfig = loadEffectivePrompt('resume')
  const profileData = parseProfileData(profileRow?.profileData)
  const profileText = buildProfileText(profileData)

  // Replacement must use the function form: the string form expands $$, $&, $` and $' in the
  // REPLACEMENT, so user-typed text (a note mentioning "$5k", a profile with "$") would corrupt
  // the prompt rather than be inserted literally.
  const systemPrompt = (promptConfig.systemPrompt ?? '')
    .replace(/\{\{CANDIDATE_PROFILE\}\}/g, () => profileText)

  const jobDetails =
    'Target Role: ' + job.company + ' — ' + job.jobTitle + '\n' +
    'Location: ' + (job.location ?? '') + '\n' +
    'Description: ' + (job.jobDescription ?? '') +
    (job.generationContext?.trim()
      ? '\nAdditional context from the candidate: ' + job.generationContext.trim()
      : '')

  const userMessage = promptConfig.userMessage
    .replace(/\{\{JOB_DETAILS\}\}/g, () => jobDetails)

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

  const data = await anthropicRes.json() as AnthropicResponse
  let rawText = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
  if (!rawText) throw new Error('Anthropic returned empty resume')

  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```[\s\S]*$/, '')
  }

  let resumeJson: unknown
  try {
    resumeJson = JSON.parse(rawText)
  } catch {
    throw new Error(`Resume generation failed: LLM output was not valid JSON — ${rawText.slice(0, 120)}`)
  }

  const parsed = resumeDataSchema.safeParse(resumeJson)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Resume generation failed: LLM output did not conform to schema — ${issues}`)
  }

  // title_02 is SANITIZED, never rejected: a connective the model slipped past the prompt rule is a
  // cosmetic flaw in a two-word field, not a reason to discard an entire paid generation. The user
  // can further adjust it in the editor. (The manual edit route still rejects, because there the
  // typing is direct and the 400 is immediate, actionable feedback rather than a lost generation.)
  const resume = { ...parsed.data, title_02: sanitizeTitle02(parsed.data.title_02) }

  // The validated JSON is RETURNED, not discarded. It used to die here — which is why a resume could
  // be rerolled but never edited, diffed, or reverted. The caller persists it as a resumes row.
  return {
    data: resume,
    pdf: await renderResumePdf(resume),
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }
}
