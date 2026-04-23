import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { loadEffectivePrompt } from './prompt-defaults'
import { generatePdf } from './generate-pdf'
import type { Job } from '../../shared/schemas'

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildCoverLetterHtml(content: string, p: typeof profile.$inferSelect | null): string {
  const name = p?.name ?? ''
  const contacts = [p?.email, p?.phone, p?.location].filter(Boolean).join(' · ')
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
</body>
</html>`
}

export async function generateCoverLetter(job: Job): Promise<{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const profileRow = db.select().from(profile).limit(1).get() ?? null
  const promptConfig = loadEffectivePrompt('cover_letter')

  const profileText =
    'Name: ' + (profileRow?.name ?? '') + '\n' +
    'Email: ' + (profileRow?.email ?? '') + '\n' +
    'Phone: ' + (profileRow?.phone ?? '') + '\n' +
    'Location: ' + (profileRow?.location ?? '') + '\n' +
    'LinkedIn: ' + (profileRow?.linkedinUrl ?? '') + '\n' +
    'Website: ' + (profileRow?.githubUrl ?? '') + '\n' +
    'Summary: ' + (profileRow?.summary ?? '') + '\n' +
    'Experience: ' + (profileRow?.experience ?? '') + '\n' +
    'Skills: ' + (profileRow?.skills ?? '') + '\n' +
    'Education: ' + (profileRow?.education ?? '')

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

  const pdf = await generatePdf(buildCoverLetterHtml(coverLetter, profileRow))
  return { content: coverLetter, pdf, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }
}
