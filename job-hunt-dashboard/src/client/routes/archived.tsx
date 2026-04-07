import { useState, useEffect } from 'react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { PipelineTable } from '../components/pipeline/PipelineTable'
import { JobDrawer } from '../components/detail/JobDrawer'

export function ArchivedRoute() {
  const { data: jobs = [] } = useJobsQuery()
  const archivedJobs = jobs.filter(j => j.archived)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  useEffect(() => {
    if (selectedJobId !== null && !archivedJobs.find(j => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [archivedJobs, selectedJobId])

  if (archivedJobs.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-center py-16 px-4">
            <p className="text-sm text-zinc-400">No archived jobs.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="p-4">
        <PipelineTable
          jobs={archivedJobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
        />
      </div>
      <JobDrawer
        job={archivedJobs.find(j => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
      />
    </>
  )
}
