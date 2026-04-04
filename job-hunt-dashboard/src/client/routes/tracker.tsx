import { useState } from 'react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { TrackerTable } from '../components/tracker/TrackerTable'
import { JobDrawer } from '../components/detail/JobDrawer'

export function TrackerRoute() {
  const { data: jobs = [] } = useJobsQuery()
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  return (
    <>
      <div className="p-4">
        <TrackerTable
          jobs={jobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
        />
      </div>
      <JobDrawer
        job={jobs.find((j) => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
      />
    </>
  )
}
