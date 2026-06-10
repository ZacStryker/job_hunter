import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, searchConfigs, userSecrets, sourceSettings, profile, companyBlacklist } from '../../db/schema'
import { decrypt, encrypt } from '../lib/crypto'
import type { ScraperSource } from '../../shared/schemas'
import { getOrComputeResumeEmbedding } from './resume-embedding-cache'
import { embed, cosineSimilarity } from './embedding-service'

interface ScraperResult {
  id: string
  title: string
  company: string
  location: string | null
  url: string | null
}

const DB_SOURCE: Record<ScraperSource, string> = {
  linkedin: 'linkedin', indeed: 'indeed', indeed_nl: 'indeed_nl', arc: 'arc',
}

async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Buffer.from(buf).toString('hex')
}

export async function runDiscovery(
  onProgress?: (msg: string) => void,
  userId?: number,
  onJobsInserted?: (count: number, source: string) => void,
): Promise<{ inserted: number; bySource: Record<string, number>; errors: Array<{ source: string; error: string }> }> {
  const scraperUrl = process.env.SCRAPER_URL
  const scraperToken = process.env.SCRAPER_TOKEN
  if (!scraperUrl) throw new Error('SCRAPER_URL not configured')

  const _debugStart = Date.now()
  console.log(`[DISCOVERY] start — userId=${userId ?? 'none'} scraperUrl=${scraperUrl}`)

  const globallyEnabledSources = new Set(
    db.select({ source: sourceSettings.source })
      .from(sourceSettings)
      .where(eq(sourceSettings.enabled, true))
      .all()
      .map((r) => r.source)
  )

  const searches = db.select().from(searchConfigs)
    .where(and(
      eq(searchConfigs.enabled, true),
      userId !== undefined ? eq(searchConfigs.userId, userId) : sql`1=1`,
    ))
    .all()
    .filter((s) => globallyEnabledSources.has(s.source))

  console.log(`[DISCOVERY] ${searches.length} enabled search config(s): ${searches.map((s) => `${s.source}:"${s.query}"`).join(', ') || '(none)'}`)

  const errors: Array<{ source: string; error: string }> = []

  let storageStateContent: string | undefined
  let indeedStorageStateContent: string | undefined

  if (userId !== undefined) {
    const linkedinSecret = db
      .select({ ciphertext: userSecrets.ciphertext })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'linkedin_storage_state')))
      .get()

    if (!linkedinSecret) {
      const linkedinSearches = searches.filter((s) => s.source === 'linkedin')
      if (linkedinSearches.length > 0) {
        const errMsg = 'LinkedIn not connected — add your session in Config > Connections'
        errors.push({ source: 'linkedin', error: errMsg })
        onProgress?.(`LinkedIn skipped: ${errMsg}`)
      }
    } else {
      const linkedinSearches = searches.filter((s) => s.source === 'linkedin')
      if (linkedinSearches.length > 0) {
        let decrypted: string | undefined
        try {
          decrypted = decrypt(linkedinSecret.ciphertext)
        } catch {
          const errMsg = 'Failed to read LinkedIn session — re-upload in Config > Connections'
          errors.push({ source: 'linkedin', error: errMsg })
          onProgress?.(`LinkedIn skipped: ${errMsg}`)
        }
        if (decrypted !== undefined) {
          storageStateContent = decrypted
        }
      }
    }

    const indeedSecret = db
      .select({ ciphertext: userSecrets.ciphertext })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'indeed_storage_state')))
      .get()

    if (!indeedSecret) {
      const indeedSearches = searches.filter((s) => s.source === 'indeed' || s.source === 'indeed_nl')
      if (indeedSearches.length > 0) {
        const errMsg = 'Indeed not connected — add your session in Config > Connections'
        errors.push({ source: 'indeed', error: errMsg })
        onProgress?.(`Indeed skipped: ${errMsg}`)
      }
    } else {
      const indeedSearches = searches.filter((s) => s.source === 'indeed' || s.source === 'indeed_nl')
      if (indeedSearches.length > 0) {
        let decrypted: string | undefined
        try {
          decrypted = decrypt(indeedSecret.ciphertext)
        } catch {
          const errMsg = 'Failed to read Indeed session — re-upload in Config > Connections'
          errors.push({ source: 'indeed', error: errMsg })
          onProgress?.(`Indeed skipped: ${errMsg}`)
        }
        if (decrypted !== undefined) {
          indeedStorageStateContent = decrypted
        }
      }
    }
  }

  const skippedSources = new Set(errors.map((e) => e.source))
  const activeSearches = skippedSources.size > 0
    ? searches.filter((s) => {
        if (skippedSources.has(s.source)) return false
        if (s.source === 'indeed_nl' && skippedSources.has('indeed')) return false
        return true
      })
    : searches

  // Load shared filtering state before any fetches begin
  const existing = db
    .select({ externalJobId: jobs.externalJobId })
    .from(jobs)
    .where(and(
      isNotNull(jobs.externalJobId),
      userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`,
    ))
    .all()
  const existingIds = new Set(existing.map((r) => r.externalJobId!))

  const blacklistedNames = userId !== undefined
    ? new Set(
        db.select({ companyName: companyBlacklist.companyName })
          .from(companyBlacklist)
          .where(eq(companyBlacklist.userId, userId))
          .all()
          .map((r) => r.companyName.toLowerCase())
      )
    : new Set<string>()

  // Shared state mutated synchronously between await points — safe in single-threaded JS
  const seen = new Set<string>()
  const bySource: Record<string, number> = {}
  const allInsertedJobs: Array<{ id: string; title: string }> = []
  let totalInserted = 0

  const dateScraped = new Date().toISOString()

  const processSearch = async (s: typeof activeSearches[number]) => {
    const dbSource = DB_SOURCE[s.source as ScraperSource] ?? s.source
    onProgress?.(`Searching ${s.source}: ${s.query}…`)

    const requestBody: Record<string, unknown> = {
      source: s.source, query: s.query, location: s.location,
    }
    if (s.source === 'linkedin' && storageStateContent) {
      requestBody.storageStateContent = storageStateContent
    }
    if ((s.source === 'indeed' || s.source === 'indeed_nl') && indeedStorageStateContent) {
      requestBody.storageStateContent = indeedStorageStateContent
    }

    const _fetchStart = Date.now()
    console.log(`[DISCOVERY] → fetch ${s.source} query="${s.query}" location="${s.location ?? ''}"`)

    let res: Response
    try {
      res = await fetch(`${scraperUrl}/scrape/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120_000),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[DISCOVERY] ← ${s.source} fetch threw: ${msg} (after ${Date.now() - _fetchStart}ms)`)
      errors.push({ source: s.source, error: msg })
      return
    }

    const elapsed = Date.now() - _fetchStart
    console.log(`[DISCOVERY] ← ${s.source} HTTP ${res.status} (${elapsed}ms)`)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[DISCOVERY] ← ${s.source} error body: ${body.slice(0, 200)}`)
      errors.push({ source: s.source, error: `Scraper error ${res.status} for "${s.query}"` })
      return
    }

    const data = await res.json() as { results?: ScraperResult[]; updatedStorageStateContent?: string }
    console.log(`[DISCOVERY] ← ${s.source} results: ${data.results?.length ?? 0} jobs`)

    if (userId !== undefined && data.updatedStorageStateContent) {
      const keyName = s.source === 'linkedin'
        ? 'linkedin_storage_state'
        : (s.source === 'indeed' || s.source === 'indeed_nl')
          ? 'indeed_storage_state'
          : null
      if (keyName) {
        try {
          const ciphertext = encrypt(data.updatedStorageStateContent)
          const updatedAt = new Date().toISOString()
          db.insert(userSecrets)
            .values({ userId, keyName, ciphertext, updatedAt })
            .onConflictDoUpdate({
              target: [userSecrets.userId, userSecrets.keyName],
              set: { ciphertext, updatedAt },
            })
            .run()
        } catch { /* best-effort */ }
      }
    }

    const newForSource = (data.results ?? []).filter((r) => {
      if (!r.id || !r.company || !r.title || existingIds.has(r.id) || seen.has(r.id)) return false
      if (blacklistedNames.size > 0 && blacklistedNames.has(r.company.toLowerCase())) return false
      seen.add(r.id)
      return true
    })

    if (newForSource.length > 0) {
      bySource[dbSource] = (bySource[dbSource] ?? 0) + newForSource.length
    }

    if (newForSource.length > 0 && userId !== undefined) {
      onProgress?.(`Inserting ${newForSource.length} jobs from ${dbSource}…`)
      db.transaction((tx) => {
        for (const job of newForSource) {
          tx
            .insert(jobs)
            .values({
              company: job.company,
              jobTitle: job.title,
              location: job.location ?? null,
              sourceUrl: job.url ?? null,
              source: dbSource,
              externalJobId: job.id,
              dateScraped,
              analysisStatus: 'pending',
              userId,
            })
            .onConflictDoNothing()
            .run()
        }
      })
      totalInserted += newForSource.length
      for (const job of newForSource) {
        allInsertedJobs.push({ id: job.id, title: job.title })
      }
      onJobsInserted?.(newForSource.length, dbSource)
    }
  }

  await Promise.allSettled(activeSearches.map(processSearch))

  console.log(`[DISCOVERY] all sources done, deduped new=${totalInserted}`)

  if (userId !== undefined && allInsertedJobs.length > 0) {
    const profileRow = db.select().from(profile)
      .where(eq(profile.userId, userId)).get()

    const resumeText = profileRow
      ? [profileRow.summary, profileRow.experience, profileRow.skills]
          .filter(Boolean).join('\n')
      : ''

    if (resumeText) {
      try {
        const profileHash = await hashText(resumeText)
        const resumeEmbedding = await getOrComputeResumeEmbedding(userId, resumeText, profileHash)

        for (const job of allInsertedJobs) {
          try {
            const titleEmbedding = await embed(job.title)
            const score = cosineSimilarity(resumeEmbedding, titleEmbedding)
            db.update(jobs)
              .set({ relevanceScore: score })
              .where(and(eq(jobs.userId, userId), eq(jobs.externalJobId, job.id)))
              .run()
          } catch {
            console.error(`[DISCOVERY] embed failed for job "${job.id}"; stays with null relevanceScore`)
          }
        }
      } catch {
        console.error('[DISCOVERY] resume embedding failed; batch stays with null relevanceScore')
      }
    }
  }

  const inserted = userId !== undefined ? totalInserted : 0
  console.log(`[DISCOVERY] done — inserted=${inserted} bySource=${JSON.stringify(bySource)} errors=${errors.length} total=${Date.now() - _debugStart}ms`)
  return { inserted, bySource, errors }
}
