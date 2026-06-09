import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { profile, userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import { generatePdf } from './generate-pdf'
import { loadEffectivePrompt } from './prompt-defaults'
import { resumeDataSchema } from '../../shared/schemas'
import type { Job } from '../../shared/schemas'

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

export async function generateResume(job: Job, userId?: number): Promise<{ pdf: Buffer; inputTokens: number; outputTokens: number }> {
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
  const promptConfig = loadEffectivePrompt('resume')

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
    .replace(/\{\{CANDIDATE_PROFILE\}\}/g, profileText)

  const jobDetails =
    'Target Role: ' + job.company + ' — ' + job.jobTitle + '\n' +
    'Location: ' + (job.location ?? '') + '\n' +
    'Description: ' + (job.jobDescription ?? '')

  const userMessage = promptConfig.userMessage
    .replace(/\{\{JOB_DETAILS\}\}/g, jobDetails)

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

  if (/\band\b/i.test(parsed.data.title_02) || parsed.data.title_02.includes('&')) {
    throw new Error('Resume generation failed: title_02 contains "and" or "&" — violates template rendering rule')
  }

  const templatePath = join(import.meta.dir, '../../../../resume_templates/resume_template(1).html')
  const templateHtml = await readFile(templatePath, 'utf-8')
  const injectedHtml = templateHtml.replace(
    /<script id="resume-data" type="application\/json">[\s\S]*?<\/script>/,
    `<script id="resume-data" type="application/json">\n${JSON.stringify(parsed.data, null, 2)}\n</script>`
  )
  if (injectedHtml === templateHtml) {
    throw new Error('Resume generation failed: template injection point not found — template may be corrupted')
  }

  return {
    pdf: await generatePdf(injectedHtml),
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }
}
