import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '../components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Loader2, Search, Plus, Wand2 } from 'lucide-react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useBulkArchiveMutation } from '../hooks/useBulkArchiveMutation'
import { useWebhookStream } from '../hooks/useWebhookStream'
import { PipelineTable } from '../components/pipeline/PipelineTable'
import { JobDrawer } from '../components/detail/JobDrawer'
import { AddJobDrawer } from '../components/pipeline/AddJobDrawer'

type ActiveAlert =
  | { kind: 'webhook-success'; label: string; message: string | null }
  | { kind: 'error'; label: string; message: string }
  | null

type AddJobMode = 'idle' | 'url-input' | 'scraping' | 'scrape-failed' | 'job-exists'

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
  const discoveryStream = useWebhookStream('/api/webhooks/discovery')
  const analysisStream = useWebhookStream('/api/webhooks/analysis')
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [activeAlert, setActiveAlert] = useState<ActiveAlert>(null)
  const [addJobMode, setAddJobMode] = useState<AddJobMode>('idle')
  const [addJobUrl, setAddJobUrl] = useState('')
  const [isAddJobDrawerOpen, setIsAddJobDrawerOpen] = useState(false)
  const queryClient = useQueryClient()

  async function handleScrapeSubmit() {
    setAddJobMode('scraping')
    try {
      const scrapeRes = await fetch('/api/jobs/scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: addJobUrl }),
      })
      if (scrapeRes.ok) {
        const scraped = await scrapeRes.json() as { company: string; jobTitle: string; location: string | null }
        const createRes = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company: scraped.company, jobTitle: scraped.jobTitle, location: scraped.location, sourceUrl: addJobUrl }),
        })
        if (createRes.ok) {
          await queryClient.invalidateQueries({ queryKey: ['jobs'] })
          setAddJobMode('idle')
          setAddJobUrl('')
          return
        }
        if (createRes.status === 409) {
          setAddJobMode('job-exists')
          return
        }
      }
    } catch { /* network error — fall through to scrape-failed */ }
    setAddJobMode('scrape-failed')
  }

  const activeJobs = (jobs ?? []).filter(j => !j.archived && j.fitScore == null)

  useEffect(() => {
    if (selectedJobId !== null && !activeJobs.find((j) => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [activeJobs, selectedJobId])

  useEffect(() => {
    if (discoveryStream.isSuccess) {
      setActiveAlert({ kind: 'webhook-success', label: 'Discovery', message: discoveryStream.statusMessage })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [discoveryStream.isSuccess])

  useEffect(() => {
    if (discoveryStream.isError) {
      setActiveAlert({ kind: 'error', label: 'Discovery', message: discoveryStream.error ?? 'Unknown error' })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [discoveryStream.isError])

  useEffect(() => {
    if (analysisStream.isSuccess) {
      setActiveAlert({ kind: 'webhook-success', label: 'Analysis', message: analysisStream.statusMessage })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [analysisStream.isSuccess])

  useEffect(() => {
    if (analysisStream.isError) {
      setActiveAlert({ kind: 'error', label: 'Analysis', message: analysisStream.error ?? 'Unknown error' })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [analysisStream.isError])

  const pendingStatusMessage =
    discoveryStream.isPending ? discoveryStream.statusMessage :
    analysisStream.isPending ? analysisStream.statusMessage :
    null

  const actionBar = (
    <div className="flex items-center px-4 pt-4 gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={discoveryStream.isPending || analysisStream.isPending}
        onClick={() => discoveryStream.trigger()}
      >
        {discoveryStream.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Discovering…
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" />
            Discover Jobs
          </>
        )}
      </Button>

      {addJobMode === 'idle' && (
        <Button
          variant="outline"
          size="sm"
          disabled={discoveryStream.isPending || analysisStream.isPending}
          onClick={() => setAddJobMode('url-input')}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Job by URL
        </Button>
      )}

      {addJobMode === 'url-input' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Job URL:</span>
          <input
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-64"
            value={addJobUrl}
            onChange={e => setAddJobUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
          />
          <Button size="sm" variant="outline" onClick={handleScrapeSubmit} disabled={!addJobUrl.trim()}>
            Submit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddJobMode('idle'); setAddJobUrl('') }}>
            Cancel
          </Button>
        </div>
      )}

      {addJobMode === 'scraping' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Job URL:</span>
          <input className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-64" value={addJobUrl} disabled />
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scraping…
          </Button>
          <Button size="sm" variant="ghost" disabled>Cancel</Button>
        </div>
      )}

      {addJobMode === 'scrape-failed' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Unable to scrape, add manually?</span>
          <Button size="sm" variant="outline" onClick={() => { setIsAddJobDrawerOpen(true) }}>Yes</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddJobMode('idle'); setAddJobUrl('') }}>No</Button>
        </div>
      )}

      {addJobMode === 'job-exists' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-red-400">This job already exists.</span>
          <Button size="sm" variant="ghost" onClick={() => { setAddJobMode('idle'); setAddJobUrl('') }}>OK</Button>
        </div>
      )}

      <div className="flex-1 min-w-32">
        {(activeAlert || pendingStatusMessage) && (
          <>
            {(discoveryStream.isPending || analysisStream.isPending) && pendingStatusMessage && (
              <Alert className="py-2">
                <AlertTitle className="text-sm">
                  {discoveryStream.isPending ? 'Discovery running…' : 'Analysis running…'}
                </AlertTitle>
                <AlertDescription className="text-xs">{pendingStatusMessage}</AlertDescription>
              </Alert>
            )}
            {activeAlert?.kind === 'webhook-success' && (
              <Alert className="py-2">
                <AlertTitle className="text-sm">{activeAlert.label} complete</AlertTitle>
                <AlertDescription className="text-xs">
                  {activeAlert.message ?? 'Workflow started successfully.'}
                </AlertDescription>
              </Alert>
            )}
            {activeAlert?.kind === 'error' && (
              <Alert variant="destructive" className="py-2">
                <AlertTitle className="text-sm">{activeAlert.label} failed</AlertTitle>
                <AlertDescription className="text-xs">{activeAlert.message}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={analysisStream.isPending || discoveryStream.isPending}
        onClick={() => analysisStream.trigger()}
      >
        {analysisStream.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analyzing…
          </>
        ) : (
          <>
            <Wand2 className="mr-2 h-4 w-4" />
            Analyze Jobs
          </>
        )}
      </Button>
    </div>
  )

  if (isPending) {
    return <SkeletonCard />
  }

  const addJobDrawer = (
    <AddJobDrawer
      key={addJobUrl}
      open={isAddJobDrawerOpen}
      prefillUrl={addJobUrl}
      onClose={() => { setIsAddJobDrawerOpen(false); setAddJobMode('idle'); setAddJobUrl('') }}
      onSuccess={() => { /* invalidation handled inside useAddJobMutation.onSuccess */ }}
    />
  )

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
        {addJobDrawer}
      </>
    )
  }

  return (
    <>
      {actionBar}
      <EmptyState />
      {addJobDrawer}
    </>
  )
}
