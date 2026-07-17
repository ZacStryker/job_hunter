import type { JobSearchProvider } from './provider'
import { jsearchProvider } from './jsearch-provider'

export type { JobSearchProvider, JobSearchQuery, JobSearchDatePosted } from './provider'
export { JobSearchNotConfiguredError } from './provider'

export type JobSearchVendor = 'jsearch' | 'serpapi'

// Selection seam. JSearch is the sole implemented provider today.
//
// SerpApi Google Jobs is the documented drop-in fallback (2026-07-16 go/no-go,
// anti-lock-in commit): same Google-for-Jobs data from a more established vendor.
// To add it, implement a `serpapiProvider: JobSearchProvider` reading its own
// SERPAPI_API_KEY and normalizing its `jobs_results[]` into jobInputSchema, then
// wire it into the switch below. No caller changes required — that is the point
// of the interface.
export function getJobSearchProvider(vendor: JobSearchVendor = 'jsearch'): JobSearchProvider {
  switch (vendor) {
    case 'jsearch':
      return jsearchProvider
    case 'serpapi':
      throw new Error('SerpApi provider is documented but not implemented')
  }
}
