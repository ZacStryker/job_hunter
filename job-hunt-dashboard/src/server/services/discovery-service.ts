import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, searchConfigs, userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import type { ScraperSource } from '../../shared/schemas'

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

export async function runDiscovery(onProgress?: (msg: string) => void, userId?: number): Promise<{ inserted: number; bySource: Record<string, number>; errors: Array<{ source: string; error: string }> }> {
  const scraperUrl = process.env.SCRAPER_URL
  const scraperToken = process.env.SCRAPER_TOKEN
  if (!scraperUrl) throw new Error('SCRAPER_URL not configured')

  const _debugStart = Date.now()
  console.log(`[DISCOVERY] start — userId=${userId ?? 'none'} scraperUrl=${scraperUrl}`)

  const searches = db.select().from(searchConfigs)
    .where(and(
      eq(searchConfigs.enabled, true),
      userId !== undefined ? eq(searchConfigs.userId, userId) : sql`1=1`,
    ))
    .all()

  console.log(`[DISCOVERY] ${searches.length} enabled search config(s): ${searches.map((s) => `${s.source}:"${s.query}"`).join(', ') || '(none)'}`)

  const errors: Array<{ source: string; error: string }> = []

  let storageStatePath: string | undefined

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
          const tempPath = join(tmpdir(), `linkedin-${userId}-${Date.now()}.json`)
          writeFileSync(tempPath, decrypted, 'utf-8')
          storageStatePath = tempPath
        }
      }
    }
  }

  const activeSearches = errors.some((e) => e.source === 'linkedin')
    ? searches.filter((s) => s.source !== 'linkedin')
    : searches

  try {
    const responses = await Promise.all(
      activeSearches.map((s) => {
        onProgress?.(`Searching ${s.source}: ${s.query}…`)
        const requestBody: Record<string, unknown> = {
          source: s.source, query: s.query, location: s.location,
        }
        if (s.source === 'linkedin' && storageStatePath) {
          requestBody.storageStatePath = storageStatePath
        }
        const _fetchStart = Date.now()
        console.log(`[DISCOVERY] → fetch ${s.source} query="${s.query}" location="${s.location ?? ''}"`)
        return fetch(`${scraperUrl}/scrape/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(60_000),
        }).then(async (res) => {
          const elapsed = Date.now() - _fetchStart
          console.log(`[DISCOVERY] ← ${s.source} HTTP ${res.status} (${elapsed}ms)`)
          if (!res.ok) {
            const body = await res.text().catch(() => '')
            console.error(`[DISCOVERY] ← ${s.source} error body: ${body.slice(0, 200)}`)
            throw new Error(`Scraper error ${res.status} for "${s.query}"`)
          }
          const data = await res.json() as { results?: ScraperResult[] }
          console.log(`[DISCOVERY] ← ${s.source} results: ${data.results?.length ?? 0} jobs`)
          return { source: DB_SOURCE[s.source as ScraperSource] ?? s.source, results: data.results ?? [] }
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[DISCOVERY] ← ${s.source} fetch threw: ${msg} (after ${Date.now() - _fetchStart}ms)`)
          throw err
        })
      })
    )

    const allResults = responses.flatMap((r) =>
      r.results.map((job) => ({ ...job, source: r.source }))
    )

    const existing = db
      .select({ externalJobId: jobs.externalJobId })
      .from(jobs)
      .where(and(
        isNotNull(jobs.externalJobId),
        userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`,
      ))
      .all()
    const existingIds = new Set(existing.map((r) => r.externalJobId!))

    const seen = new Set<string>()
    const newJobs = allResults.filter((r) => {
      if (!r.id || !r.company || !r.title || existingIds.has(r.id) || seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

    console.log(`[DISCOVERY] scraped total=${allResults.length}, after dedup new=${newJobs.length}`)
    if (newJobs.length === 0) {
      console.log(`[DISCOVERY] done — 0 new jobs, ${Date.now() - _debugStart}ms total`)
      return { inserted: 0, bySource: {}, errors }
    }

    onProgress?.(`Inserting ${newJobs.length} new jobs…`)

    const dateScraped = new Date().toISOString()

    if (userId !== undefined) {
      db.transaction((tx) => {
        for (const job of newJobs) {
          tx
            .insert(jobs)
            .values({
              company: job.company,
              jobTitle: job.title,
              location: job.location ?? null,
              sourceUrl: job.url ?? null,
              source: job.source,
              externalJobId: job.id,
              dateScraped,
              analysisStatus: 'pending',
              userId,
            })
            .onConflictDoNothing()
            .run()
        }
      })
    }
    // userId undefined: inserts skipped (userId is NOT NULL) — bySource still computed below

    const bySource: Record<string, number> = {}
    for (const job of newJobs) {
      bySource[job.source] = (bySource[job.source] ?? 0) + 1
    }

    const inserted = userId !== undefined ? newJobs.length : 0
    console.log(`[DISCOVERY] done — inserted=${inserted} bySource=${JSON.stringify(bySource)} errors=${errors.length} total=${Date.now() - _debugStart}ms`)
    return { inserted, bySource, errors }
  } finally {
    if (storageStatePath) {
      try { unlinkSync(storageStatePath) } catch { /* best-effort cleanup */ }
    }
  }
}
