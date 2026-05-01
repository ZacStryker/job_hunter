import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, profile, userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import { loadEffectivePrompt } from './prompt-defaults'

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

interface AnalysisResult {
  score: number
  role_fit: string
  red_flags: string
  requirements_met: string
  requirements_missed: string
  salary: string
  benefits: string
  contact_name: string
  contact_email: string
  contact_phone: string
  recommended_action: string
}

function applyAnalysisTemplate(
  template: string,
  candidateName: string,
  profileJson: string,
  jobJson: string
): string {
  return template
    .replaceAll('{{CANDIDATE_NAME}}', candidateName)
    .replaceAll('{{CANDIDATE_PROFILE_JSON}}', profileJson)
    .replaceAll('{{JOB_LISTING_JSON}}', jobJson)
}

export async function runAnalysis(onProgress?: (msg: string) => void, userId?: number): Promise<{ processed: number; failed: number; matched: number; archived: number; inputTokens: number; outputTokens: number }> {
  let apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey && userId !== undefined) {
    const row = db.select({ ciphertext: userSecrets.ciphertext })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'anthropic_api_key')))
      .get()
    if (row) apiKey = decrypt(row.ciphertext)
  }
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const scraperUrl = process.env.SCRAPER_URL
  const scraperToken = process.env.SCRAPER_TOKEN

  const profileRow = db.select().from(profile).limit(1).get() ?? null
  const promptConfig = loadEffectivePrompt('analysis')

  const pendingJobs = db
    .select()
    .from(jobs)
    .where(and(
      eq(jobs.analysisStatus, 'pending'),
      eq(jobs.archived, false),
      userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`,
    ))
    .limit(10)
    .all()

  onProgress?.(`Found ${pendingJobs.length} jobs to analyze`)

  let processed = 0
  let failed = 0
  let archivedInRun = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let i = 0

  for (const job of pendingJobs) {
    i++
    onProgress?.(`Analyzing ${i} / ${pendingJobs.length}: ${job.company} — ${job.jobTitle}`)
    db.update(jobs).set({ analysisStatus: 'analyzing' })
      .where(and(eq(jobs.id, job.id), userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`))
      .run()

    try {
      let description = ''
      if (scraperUrl && job.sourceUrl) {
        try {
          const hostname = (() => { try { return new URL(job.sourceUrl).hostname.replace(/^www\./, '') } catch { return '' } })()
          const scraperSource =
            hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com') ? 'linkedin' :
            hostname === 'nl.indeed.com' ? 'indeed_nl' :
            hostname === 'indeed.com' || hostname.endsWith('.indeed.com') ? 'indeed' :
            null
          if (!scraperSource) throw new Error(`No scraper for host: ${hostname}`)
          const scraperRes = await fetch(`${scraperUrl}/scrape/listing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
            },
            body: JSON.stringify({ source: scraperSource, url: job.sourceUrl }),
            signal: AbortSignal.timeout(60_000),
          })
          if (!scraperRes.ok) throw new Error(`Scraper HTTP ${scraperRes.status}`)
          const scraperData = await scraperRes.json() as { description?: string }
          description = scraperData.description?.replace(/[\r\n]+/g, ' ').trim() ?? ''
        } catch (scraperErr) {
          console.error(`[analysis] scraper failed for job ${job.id}:`, scraperErr instanceof Error ? scraperErr.message : String(scraperErr))
        }
      }

      const candidateName = profileRow?.name ?? 'a candidate'
      const profileJson = JSON.stringify({
        Name: profileRow?.name ?? null,
        Email: profileRow?.email ?? null,
        Phone: profileRow?.phone ?? null,
        Location: profileRow?.location ?? null,
        Summary: profileRow?.summary ?? null,
        Experience: profileRow?.experience ?? null,
        Skills: profileRow?.skills ?? null,
        Education: profileRow?.education ?? null,
      })
      const jobJson = JSON.stringify({
        Company: job.company,
        Title: job.jobTitle,
        Location: job.location ?? null,
        Description: description || null,
      })
      const userMessage = applyAnalysisTemplate(promptConfig.userMessage, candidateName, profileJson, jobJson)

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 1024,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

      const anthropicData = await anthropicRes.json() as AnthropicMessage
      totalInputTokens += anthropicData.usage?.input_tokens ?? 0
      totalOutputTokens += anthropicData.usage?.output_tokens ?? 0
      const text = anthropicData.content.find((b) => b.type === 'text')?.text ?? ''

      let result: AnalysisResult
      try {
        result = JSON.parse(text) as AnalysisResult
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON found in Anthropic response')
        result = JSON.parse(jsonMatch[0]) as AnalysisResult
      }

      db.update(jobs)
        .set({
          fitScore: typeof result.score === 'number' ? result.score : null,
          recommendation: result.recommended_action ?? null,
          roleFit: result.role_fit ?? null,
          requirementsMet: result.requirements_met ?? null,
          requirementsMissed: result.requirements_missed ?? null,
          redFlags: result.red_flags ?? null,
          jobDescription: description || null,
          salary: result.salary ?? null,
          benefits: result.benefits ?? null,
          contactName: result.contact_name ?? null,
          contactEmail: result.contact_email ?? null,
          contactPhone: result.contact_phone ?? null,
          analysisStatus: 'done',
          dateAnalyzed: new Date().toLocaleDateString('en-CA'),
          ...(result.recommended_action === 'skip' ? { archived: true } : {}),
        })
        .where(and(eq(jobs.id, job.id), userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`))
        .run()

      if (result.recommended_action === 'skip') archivedInRun++
      processed++
    } catch (err) {
      console.error(`[analysis] job ${job.id} failed:`, err instanceof Error ? err.message : String(err))
      db.update(jobs).set({ analysisStatus: 'failed' })
        .where(and(eq(jobs.id, job.id), userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`))
        .run()
      failed++
    }
  }

  return { processed, failed, matched: processed - archivedInRun, archived: archivedInRun, inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
}
