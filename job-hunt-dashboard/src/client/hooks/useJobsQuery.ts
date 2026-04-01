import { useQuery } from '@tanstack/react-query'
import type { Job } from '@shared/schemas'

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch('/api/jobs')
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json() as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON error body — use statusText
    }
    throw new Error(message)
  }
  const body = await res.json() as { jobs: Job[] }
  return body.jobs
}

export function useJobsQuery() {
  return useQuery<Job[], Error>({ queryKey: ['jobs'], queryFn: fetchJobs })
}
