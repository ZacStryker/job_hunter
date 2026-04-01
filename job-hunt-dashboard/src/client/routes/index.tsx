import { Button } from '../components/ui/button'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { PipelineTable } from '../components/pipeline/PipelineTable'

export function PipelineRoute() {
  const { data: jobs } = useJobsQuery()

  if (jobs && jobs.length > 0) {
    return (
      <div className="p-4">
        <PipelineTable jobs={jobs} />
      </div>
    )
  }

  // Empty/loading placeholder — Story 3.4 will replace with skeleton + real empty state
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-400">
              No jobs yet. Hit Sync to pull from Google Sheets.
            </p>
            <Button variant="outline" size="sm" disabled>
              Sync
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
