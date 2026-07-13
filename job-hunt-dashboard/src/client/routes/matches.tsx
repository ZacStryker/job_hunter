import { useState, useEffect } from 'react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useJobDrawerSearch } from '../hooks/useJobDrawerSearch'
import { useBulkArchiveMutation } from '../hooks/useBulkArchiveMutation'
import { PipelineTable } from '../components/pipeline/PipelineTable'
import { JobDrawer } from '../components/detail/JobDrawer'

export function MatchesRoute() {
  const { data: jobs = [] } = useJobsQuery()
  const bulkArchiveMutation = useBulkArchiveMutation()
  const matchedJobs = jobs.filter(
    j => !j.archived && !j.applied && j.analysisStatus === 'done' && (j.recommendation === 'apply' || j.recommendation === 'investigate')
  )
  const { job: jobFromUrl, tab: tabFromUrl } = useJobDrawerSearch()
  const [selectedJobId, setSelectedJobId] = useState<number | null>(jobFromUrl ?? null)

  useEffect(() => {
    if (selectedJobId !== null && !matchedJobs.find(j => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [matchedJobs, selectedJobId])

  if (matchedJobs.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-center py-16 px-4">
            <p className="text-sm text-zinc-400">No matches yet. Click Analyze Jobs on the Jobs page to populate matches.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="p-4">
        <PipelineTable
          jobs={matchedJobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
          onBulkArchive={bulkArchiveMutation.mutate}
          isBulkArchiving={bulkArchiveMutation.isPending}
          fixedColumns={['company', 'jobTitle', 'location', 'locationType', 'fitScore', 'recommendation', 'date_analyzed']}
          sizingStorageKey="hitlobster-column-sizing-matches"
          sortingStorageKey="hitlobster-column-sorting-matches"
        />
      </div>
      <JobDrawer
        job={matchedJobs.find(j => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
        defaultTab={tabFromUrl}
      />
    </>
  )
}
