import { useState, useEffect } from 'react'
import { Skeleton } from '../components/ui/skeleton'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useBulkArchiveMutation } from '../hooks/useBulkArchiveMutation'
import { PipelineTable } from '../components/pipeline/PipelineTable'
import { JobDrawer } from '../components/detail/JobDrawer'

function SkeletonCard() {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
        <div className="flex items-center justify-end px-3 py-2 border-b border-zinc-800 shrink-0">
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900/80 border-b border-zinc-800">
              <tr>
                {['Company', 'Job Title', 'Source', 'Date Scraped'].map((col) => (
                  <th key={col} className="px-3 h-9 text-left text-xs font-medium uppercase text-zinc-400">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-36" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-24" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-400">
              No jobs pending analysis. Run the scraper to discover new jobs.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PipelineRoute() {
  const { data: jobs, isPending } = useJobsQuery()
  const bulkArchiveMutation = useBulkArchiveMutation()
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  const activeJobs = (jobs ?? []).filter(j => !j.archived && j.analysisStatus !== 'done')

  useEffect(() => {
    if (selectedJobId !== null && !activeJobs.find((j) => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [activeJobs, selectedJobId])

  if (isPending) {
    return <SkeletonCard />
  }

  if (jobs !== undefined && activeJobs.length > 0) {
    return (
      <>
        <div className="p-4">
          <PipelineTable
            jobs={activeJobs}
            onRowClick={(job) => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
            selectedJobId={selectedJobId}
            onBulkArchive={bulkArchiveMutation.mutate}
            isBulkArchiving={bulkArchiveMutation.isPending}
            fixedColumns={['company', 'jobTitle', 'source', 'date_scraped']}
          />
        </div>
        <JobDrawer
          job={activeJobs.find((j) => j.id === selectedJobId) ?? null}
          open={selectedJobId !== null}
          onClose={() => setSelectedJobId(null)}
        />
      </>
    )
  }

  return <EmptyState />
}
