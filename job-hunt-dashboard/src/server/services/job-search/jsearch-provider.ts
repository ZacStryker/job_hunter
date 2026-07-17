import type { JobInput } from '../../../shared/schemas'
import { JobSearchNotConfiguredError, type JobSearchProvider, type JobSearchQuery } from './provider'

const JSEARCH_HOST = 'jsearch.p.rapidapi.com'
const JSEARCH_URL = `https://${JSEARCH_HOST}/search`

// Shape of a single item in the JSearch `data[]` array. Only the fields we map
// are declared; everything is optional because the feed is sparse (notably salary).
interface JSearchJob {
  job_id?: string | null
  job_title?: string | null
  employer_name?: string | null
  job_description?: string | null
  job_apply_link?: string | null
  job_city?: string | null
  job_state?: string | null
  job_country?: string | null
  job_min_salary?: number | null
  job_max_salary?: number | null
  job_salary_period?: string | null
}

interface JSearchResponse {
  status?: string
  data?: JSearchJob[] | null
}

function formatLocation(job: JSearchJob): string | null {
  const parts = [job.job_city, job.job_state, job.job_country].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  return parts.length > 0 ? parts.join(', ') : null
}

function formatSalary(job: JSearchJob): string | null {
  const { job_min_salary: min, job_max_salary: max, job_salary_period: period } = job
  if (min == null && max == null) return null
  const range = min != null && max != null ? `${min}–${max}` : `${min ?? max}`
  return period ? `${range} / ${period.toLowerCase()}` : range
}

// Pure mapping from a JSearch item to the canonical jobInputSchema shape.
// Exported so it can be unit-tested without the network. Analysis-owned columns
// stay null; the ingest/analysis pipeline fills them later.
export function normalize(job: JSearchJob): JobInput {
  return {
    company: job.employer_name ?? '',
    jobTitle: job.job_title ?? '',
    jobDescription: job.job_description ?? null,
    sourceUrl: job.job_apply_link ?? null,
    dateScraped: new Date().toISOString(),
    source: 'jsearch',
    location: formatLocation(job),
    salary: formatSalary(job),
    externalJobId: job.job_id ?? null,
    analysisStatus: 'pending',
    fitScore: null,
    recommendation: null,
    jobReqsMet: null,
    jobReqsMissed: null,
    candidateReqsMet: null,
    candidateReqsMissed: null,
    benefits: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  }
}

function buildQueryString(query: JobSearchQuery): string {
  const q = query.location ? `${query.query} in ${query.location}` : query.query
  const params = new URLSearchParams({
    query: q,
    page: String(query.page ?? 1),
    num_pages: String(query.numPages ?? 1),
  })
  if (query.remoteOnly) params.set('remote_jobs_only', 'true')
  if (query.datePosted) params.set('date_posted', query.datePosted)
  return params.toString()
}

// Primary provider: JSearch (OpenWeb Ninja) reselling Google-for-Jobs via RapidAPI.
// Single shared HITLOBSTER key; the entity is the paying customer for all users.
export const jsearchProvider: JobSearchProvider = {
  async search(query: JobSearchQuery): Promise<JobInput[]> {
    const apiKey = process.env.JSEARCH_API_KEY
    if (!apiKey) {
      throw new JobSearchNotConfiguredError('JSEARCH_API_KEY is not configured')
    }

    const res = await fetch(`${JSEARCH_URL}?${buildQueryString(query)}`, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': JSEARCH_HOST,
      },
    })

    if (!res.ok) {
      // Deliberately omit the body — it can echo the key or upstream detail.
      throw new Error(`JSearch request failed: ${res.status}`)
    }

    const body = (await res.json()) as JSearchResponse
    return (body.data ?? []).map(normalize)
  },
}
