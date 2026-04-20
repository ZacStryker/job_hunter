import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { loadEffectivePrompt } from './prompt-defaults'
import type { Job } from '../../shared/schemas'

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

export async function generateCoverLetter(job: Job): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
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

  return { content: coverLetter, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }
}
