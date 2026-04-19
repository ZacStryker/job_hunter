import { useState, useEffect } from 'react'
import { Skeleton } from '../components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Loader2 } from 'lucide-react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useBulkArchiveMutation } from '../hooks/useBulkArchiveMutation'
import { useWebhookMutation } from '../hooks/useWebhookMutation'
import { PipelineTable } from '../components/pipeline/PipelineTable'
import { JobDrawer } from '../components/detail/JobDrawer'

type ActiveAlert =
  | { kind: 'webhook-success'; label: string }
  | { kind: 'error'; label: string; message: string }
  | null

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
  const discoveryMutation = useWebhookMutation('/api/webhooks/discovery')
  const analysisMutation = useWebhookMutation('/api/webhooks/analysis')
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [activeAlert, setActiveAlert] = useState<ActiveAlert>(null)

  const activeJobs = (jobs ?? []).filter(j => !j.archived && j.fitScore == null)

  useEffect(() => {
    if (selectedJobId !== null && !activeJobs.find((j) => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [activeJobs, selectedJobId])

  useEffect(() => {
    if (discoveryMutation.isSuccess) {
      setActiveAlert({ kind: 'webhook-success', label: 'Discovery' })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [discoveryMutation.isSuccess])

  useEffect(() => {
    if (discoveryMutation.isError) {
      setActiveAlert({ kind: 'error', label: 'Discovery', message: discoveryMutation.error.message })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [discoveryMutation.isError])

  useEffect(() => {
    if (analysisMutation.isSuccess) {
      setActiveAlert({ kind: 'webhook-success', label: 'Analysis' })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [analysisMutation.isSuccess])

  useEffect(() => {
    if (analysisMutation.isError) {
      setActiveAlert({ kind: 'error', label: 'Analysis', message: analysisMutation.error.message })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [analysisMutation.isError])

  const actionBar = (
    <div className="flex items-center justify-between px-4 pt-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={discoveryMutation.isPending || analysisMutation.isPending}
          onClick={() => discoveryMutation.mutate()}
        >
          {discoveryMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Discovery…
            </>
          ) : (
            'Discovery'
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={analysisMutation.isPending || discoveryMutation.isPending}
          onClick={() => analysisMutation.mutate()}
        >
          {analysisMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analysis…
            </>
          ) : (
            'Analysis'
          )}
        </Button>
      </div>
      {activeAlert && (
        <div className="flex-1 ml-4">
          {activeAlert.kind === 'webhook-success' && (
            <Alert className="py-2">
              <AlertTitle className="text-sm">{activeAlert.label} triggered</AlertTitle>
              <AlertDescription className="text-xs">Workflow started successfully.</AlertDescription>
            </Alert>
          )}
          {activeAlert.kind === 'error' && (
            <Alert variant="destructive" className="py-2">
              <AlertTitle className="text-sm">{activeAlert.label} failed</AlertTitle>
              <AlertDescription className="text-xs">{activeAlert.message}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  )

  if (isPending) {
    return <SkeletonCard />
  }

  if (jobs !== undefined && activeJobs.length > 0) {
    return (
      <>
        {actionBar}
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

  return (
    <>
      {actionBar}
      <EmptyState />
    </>
  )
}
