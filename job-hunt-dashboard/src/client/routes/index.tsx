import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useSyncMutation } from '../hooks/useSyncMutation'
import { PipelineTable } from '../components/pipeline/PipelineTable'

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
                {['Company', 'Job Title', 'Score', 'Action', 'Reqs Met', 'Reqs Missed', 'Notes'].map((col) => (
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
                  <td className="px-3 py-1.5"><Skeleton className="h-5 w-10 rounded-full" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ syncMutation }: { syncMutation: ReturnType<typeof useSyncMutation> }) {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-400">
              No jobs yet. Hit Sync to pull from Google Sheets.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? 'Syncing…' : 'Sync'}
            </Button>
            {syncMutation.isError && (
              <p className="text-xs text-red-400">Sync failed. Try again.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PipelineRoute() {
  const { data: jobs, isPending } = useJobsQuery()
  const syncMutation = useSyncMutation()

  if (isPending) {
    return <SkeletonCard />
  }

  if (jobs && jobs.length > 0) {
    return (
      <div className="p-4">
        <PipelineTable jobs={jobs} />
      </div>
    )
  }

  return <EmptyState syncMutation={syncMutation} />
}
