import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, profile, userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import { loadEffectivePrompt, ANALYSIS_JOB_LISTING_MARKER } from './prompt-defaults'
import { profileDataSchema } from '../../shared/schemas'
import type { ProfileData } from '../../shared/schemas'

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

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

type TextBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

interface AnalysisResult {
  score: number
  role_fit: string | null
  red_flags: string | null
  requirements_met: string | null
  requirements_missed: string | null
  salary: string | null
  benefits: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  recommended_action: string
}

// Builds the user-message content blocks. The candidate-dependent prefix (everything before the
// JOB LISTING marker) is a single cacheable block — byte-identical across every job in a run — with
// an ephemeral cache breakpoint; the per-job listing is a separate trailing block with no
// cache_control. A custom template that lacks the marker degrades gracefully to one uncached block.
function buildAnalysisContent(
  template: string,
  candidateName: string,
  profileJson: string,
  jobJson: string
): TextBlock[] {
  const applyStable = (s: string) =>
    s.replaceAll('{{CANDIDATE_NAME}}', candidateName).replaceAll('{{CANDIDATE_PROFILE_JSON}}', profileJson)

  const markerIndex = template.indexOf(ANALYSIS_JOB_LISTING_MARKER)
  if (markerIndex === -1) {
    const full = applyStable(template).replaceAll('{{JOB_LISTING_JSON}}', jobJson)
    return [{ type: 'text', text: full }]
  }

  const prefix = applyStable(template.slice(0, markerIndex)).trimEnd()
  const listing = applyStable(template.slice(markerIndex)).replaceAll('{{JOB_LISTING_JSON}}', jobJson)
  return [
    { type: 'text', text: prefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: listing },
  ]
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

  const profileRow = (userId !== undefined ? db.select().from(profile).where(eq(profile.userId, userId)).get() : null) ?? null
  const promptConfig = loadEffectivePrompt('analysis')

  let linkedinStorageState: string | undefined
  if (userId !== undefined) {
    const linkedinSecret = db
      .select({ ciphertext: userSecrets.ciphertext })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'linkedin_storage_state')))
      .get()
    if (linkedinSecret) {
      try { linkedinStorageState = decrypt(linkedinSecret.ciphertext) } catch { /* best-effort */ }
    }
  }

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

  // Candidate name + profile JSON are constant for the whole run — compute once so the cached
  // prefix is byte-identical across all per-job calls (call 1 writes the cache, calls 2+ read it).
  const profileData = parseProfileData(profileRow?.profileData)
  const candidateName = profileData.personal.fullName || 'a candidate'
  const profileJson = JSON.stringify({
    Name: profileData.personal.fullName || null,
    Email: profileData.personal.email || null,
    Phone: profileData.personal.phone,
    Location: profileData.personal.location,
    Summary: profileData.personal.summary,
    ...(profileData.personal.skills ? { Skills: profileData.personal.skills } : {}),
    Websites: profileData.personal.websites,
    Jobs: profileData.experience.jobs,
    Education: profileData.experience.education,
    Projects: profileData.experience.projects.map(p => ({ name: p.name, description: p.description })),
    Certifications: profileData.experience.certifications,
    Licences: profileData.experience.licences,
    Awards: profileData.experience.awards,
  })

  let processed = 0
  let failed = 0
  let archivedInRun = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheCreationTokens = 0
  let totalCacheReadTokens = 0
  let i = 0

  for (const job of pendingJobs) {
    i++
    onProgress?.(`Analyzing ${i} / ${pendingJobs.length}: ${job.company} — ${job.jobTitle}`)
    db.update(jobs).set({ analysisStatus: 'analyzing' })
      .where(and(eq(jobs.id, job.id), userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`))
      .run()

    try {
      let description = job.jobDescription ?? ''
      if (!description && scraperUrl && job.sourceUrl) {
        try {
          const hostname = (() => { try { return new URL(job.sourceUrl).hostname.replace(/^www\./, '') } catch { return '' } })()
          const scraperSource =
            hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com') ? 'linkedin' :
            hostname === 'nl.indeed.com' ? 'indeed_nl' :
            hostname === 'indeed.com' || hostname.endsWith('.indeed.com') ? 'indeed' :
            hostname === 'arc.dev' ? 'arc' :
            null
          if (!scraperSource) throw new Error(`No scraper for host: ${hostname}`)
          const scraperRes = await fetch(`${scraperUrl}/scrape/listing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
            },
            body: JSON.stringify({
              source: scraperSource,
              url: job.sourceUrl,
              ...(scraperSource === 'linkedin' && linkedinStorageState ? { storageStateContent: linkedinStorageState } : {}),
            }),
            signal: AbortSignal.timeout(60_000),
          })
          if (!scraperRes.ok) throw new Error(`Scraper HTTP ${scraperRes.status}`)
          const scraperData = await scraperRes.json() as { description?: string }
          description = scraperData.description?.replace(/[\r\n]+/g, ' ').trim() ?? ''
        } catch (scraperErr) {
          console.error(`[analysis] scraper failed for job ${job.id}:`, scraperErr instanceof Error ? scraperErr.message : String(scraperErr))
        }
      }

      const jobJson = JSON.stringify({
        Company: job.company,
        Title: job.jobTitle,
        Location: job.location ?? null,
        Description: description || null,
      })
      const userContent = buildAnalysisContent(promptConfig.userMessage, candidateName, profileJson, jobJson)

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: userContent }],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

      const anthropicData = await anthropicRes.json() as AnthropicMessage
      const cacheCreation = anthropicData.usage?.cache_creation_input_tokens ?? 0
      const cacheRead = anthropicData.usage?.cache_read_input_tokens ?? 0
      // input_tokens from the API is the uncached remainder; fold the cached portions back in so the
      // returned inputTokens stays the true total prompt size (preserves the existing cost contract).
      totalInputTokens += (anthropicData.usage?.input_tokens ?? 0) + cacheCreation + cacheRead
      totalOutputTokens += anthropicData.usage?.output_tokens ?? 0
      totalCacheCreationTokens += cacheCreation
      totalCacheReadTokens += cacheRead
      const text = anthropicData.content.find((b) => b.type === 'text')?.text ?? ''

      let result: AnalysisResult
      try {
        result = JSON.parse(text) as AnalysisResult
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON found in Anthropic response')
        result = JSON.parse(jsonMatch[0]) as AnalysisResult
      }
      result.recommended_action = result.recommended_action?.replace(/^<|>$/g, '') ?? result.recommended_action

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
          ...(result.recommended_action === 'skip' ? { archived: true, dateArchived: new Date().toISOString() } : {}),
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

  // Per-run cache visibility (not surfaced in the UI). cache_read > 0 on calls 2+ confirms the
  // profile prefix is being reused; both staying 0 means the prefix is under Sonnet 4.6's ~2048-token
  // minimum (caching silently no-ops) or a custom prompt omitted the JOB LISTING marker.
  console.log(`[analysis] prompt cache — creation: ${totalCacheCreationTokens}, read: ${totalCacheReadTokens} tokens`)
  if (totalCacheCreationTokens === 0 && totalCacheReadTokens === 0) {
    console.log('[analysis] prompt caching did not engage (prefix likely below the ~2048-token minimum, or no cache breakpoint)')
  }

  return { processed, failed, matched: processed - archivedInRun, archived: archivedInRun, inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
}
