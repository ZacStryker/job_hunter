import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { profile, userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import { loadEffectivePrompt } from './prompt-defaults'
import { generatePdf } from './generate-pdf'
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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildCoverLetterHtml(content: string, personal: ProfileData['personal'] | null): string {
  const name = personal?.fullName ?? ''
  const contacts = [personal?.email, personal?.phone, personal?.location].filter(Boolean).join(' · ')
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 48px 56px; line-height: 1.6; max-width: 760px; }
  .name { font-size: 15pt; font-weight: 700; letter-spacing: 0.3px; }
  .contact { font-size: 9.5pt; color: #555; margin-top: 3px; }
  hr { border: none; border-top: 1.5px solid #1a1a1a; margin: 14px 0 20px; }
  .date { font-size: 10pt; color: #444; margin-bottom: 24px; }
  .body { font-size: 11pt; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="name">${escHtml(name)}</div>
  <div class="contact">${escHtml(contacts)}</div>
  <hr />
  <div class="date">${date}</div>
  <div class="body">${escHtml(content)}</div>
<script>window.__paginationComplete = true;</script>
</body>
</html>`
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

  const systemPrompt = (promptConfig.systemPrompt ?? '')
    .replaceAll('{{CANDIDATE_PROFILE}}', profileText)

  const jobDetails =
    'Role: Company: ' + job.company +
    ' Title: ' + job.jobTitle +
    ' Location: ' + (job.location ?? '') +
    ' Description: ' + (job.jobDescription ?? '')

  const userMessage = promptConfig.userMessage
    .replaceAll('{{JOB_DETAILS}}', jobDetails)

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
