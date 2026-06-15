import type { Job } from '@shared/schemas'

export function jobMatchesKeyword(job: Job, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    job.company,
    job.jobTitle,
    job.location,
    job.source,
    job.status,
    job.statusOverride,
    job.latestStatus,
    job.recommendation,
    job.roleFit,
    job.requirementsMet,
    job.requirementsMissed,
    job.redFlags,
    job.jobDescription,
    job.salary,
    job.benefits,
  ]
    .filter((f): f is string => typeof f === 'string')
    .join(' ')
    .toLowerCase()
  return q.split(/\s+/).every((token) => haystack.includes(token))
}
