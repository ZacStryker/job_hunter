import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { profile, userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import { loadEffectivePrompt } from './prompt-defaults'
import { generatePdf } from './generate-pdf'
import { buildCoverLetterHtml } from '../../shared/cover-letter-html'
import { profileDataSchema } from '../../shared/schemas'
import type { Job, ProfileData } from '../../shared/schemas'

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
  const projectLines = pd.experience.projects.map(p => `${p.name}: ${p.description}`).join('\n')
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

// Renders an EXISTING letter to a PDF. No Anthropic call — this is the path an edit and a restore
// take, where the prose is already decided and only the artifact needs rebuilding.
export async function renderCoverLetterPdf(content: string, userId: number): Promise<Buffer> {
  const profileRow = db.select().from(profile).where(eq(profile.userId, userId)).get() ?? null
  const profileData = parseProfileData(profileRow?.profileData)
  return generatePdf(buildCoverLetterHtml(content, profileData.personal))
}

export async function generateCoverLetter(job: Job, userId?: number): Promise<{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }> {
  let apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey && userId !== undefined) {
    const row = db.select({ ciphertext: userSecrets.ciphertext })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'anthropic_api_key')))
      .get()
    if (row) apiKey = decrypt(row.ciphertext)
  }
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const profileRow = (userId !== undefined ? db.select().from(profile).where(eq(profile.userId, userId)).get() : null) ?? null
  const promptConfig = loadEffectivePrompt('cover_letter')
  const profileData = parseProfileData(profileRow?.profileData)
  const profileText = buildProfileText(profileData)

  // Replacement must use the function form: the string form expands $$, $&, $` and $' in the
  // REPLACEMENT, so user-typed text (a note mentioning "$5k", a profile with "$") would corrupt
  // the prompt rather than be inserted literally.
  const systemPrompt = (promptConfig.systemPrompt ?? '')
    .replaceAll('{{CANDIDATE_PROFILE}}', () => profileText)

  const jobDetails =
    'Role: Company: ' + job.company +
    ' Title: ' + job.jobTitle +
    ' Location: ' + (job.location ?? '') +
    ' Description: ' + (job.jobDescription ?? '') +
    (job.generationContext?.trim()
      ? ' Additional context from the candidate: ' + job.generationContext.trim()
      : '')

  const userMessage = promptConfig.userMessage
    .replaceAll('{{JOB_DETAILS}}', () => jobDetails)

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

  const data = await anthropicRes.json() as AnthropicResponse
  const coverLetter = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
  if (!coverLetter) throw new Error('Anthropic returned empty cover letter')

  const pdf = await generatePdf(buildCoverLetterHtml(coverLetter, profileData.personal))
  return { content: coverLetter, pdf, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }
}
