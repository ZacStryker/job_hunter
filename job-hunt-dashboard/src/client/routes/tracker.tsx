import { useState, useEffect } from 'react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useJobDrawerSearch } from '../hooks/useJobDrawerSearch'
import { TrackerTable } from '../components/tracker/TrackerTable'
import { JobDrawer } from '../components/detail/JobDrawer'

export function TrackerRoute() {
  const { data: jobs = [] } = useJobsQuery()
  const activeJobs = jobs.filter(j => !j.archived)
  const { job: jobFromUrl, tab: tabFromUrl } = useJobDrawerSearch()
  const [selectedJobId, setSelectedJobId] = useState<number | null>(jobFromUrl ?? null)

  useEffect(() => {
    if (selectedJobId !== null && !activeJobs.find(j => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [activeJobs, selectedJobId])

  return (
    <>
      <div className="p-4">
        <TrackerTable
          jobs={activeJobs}
          onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
          selectedJobId={selectedJobId}
        />
      </div>
      <JobDrawer
        job={activeJobs.find((j) => j.id === selectedJobId) ?? null}
        open={selectedJobId !== null}
        onClose={() => setSelectedJobId(null)}
        defaultTab={tabFromUrl}
      />
    </>
  )
}
