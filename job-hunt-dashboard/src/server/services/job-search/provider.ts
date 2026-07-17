import type { JobInput } from '../../../shared/schemas'

// Vendor-neutral seam for managed job-search feeds. JSearch is the primary
// implementation; SerpApi Google Jobs is the documented drop-in fallback.
// Anti-lock-in commit from the 2026-07-16 go/no-go.

export type JobSearchDatePosted = 'all' | 'today' | '3days' | 'week' | 'month'

export interface JobSearchQuery {
  // Free-text query, e.g. "react developer in Amsterdam".
  query: string
  // 1-based page index (provider default: 1).
  page?: number
  // Number of pages to fetch in one call (provider default: 1).
  numPages?: number
  // Optional location filter, appended to the query when the provider has no
  // dedicated location parameter.
  location?: string
  remoteOnly?: boolean
  datePosted?: JobSearchDatePosted
}

export interface JobSearchProvider {
  // Returns records already normalized into the canonical jobInputSchema shape.
  search(query: JobSearchQuery): Promise<JobInput[]>
}

// Thrown when the provider's API key env var is absent. The feature is optional,
// so callers translate this to a 503 rather than a 500 (mirrors the Anthropic /
// Gmail "not configured" pattern). No network call is made before this throws.
export class JobSearchNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobSearchNotConfiguredError'
  }
}
