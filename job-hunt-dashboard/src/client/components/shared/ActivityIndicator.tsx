import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Activity, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useActivityStream } from '@/hooks/useActivityStream'
import type { ActivityRun } from '@shared/schemas'
import { cn } from '@/lib/utils'

export function runTitle(type: ActivityRun['type']): string {
  switch (type) {
    case 'discovery': return 'Discovery'
    case 'analysis': return 'Analysis'
    case 'cover_letter': return 'Cover Letter'
    case 'resume': return 'Resume'
  }
}

export function runStatusLine(run: ActivityRun): string {
  switch (run.type) {
    case 'discovery': return `${'count' in run.progress ? run.progress.count : 0} jobs discovered so far`
    case 'analysis': return `${'count' in run.progress ? run.progress.count : 0} jobs analyzed so far`
    case 'cover_letter': return `Generating cover letter — ${'company' in run.progress ? `${run.progress.company} · ${run.progress.role}` : ''}`
    case 'resume': return `Generating resume — ${'company' in run.progress ? `${run.progress.company} · ${run.progress.role}` : ''}`
  }
}

function RunStatusGlyph({ state }: { state: ActivityRun['state'] }) {
  switch (state) {
    case 'running': return <Loader2 className="h-4 w-4 animate-spin text-zinc-400 shrink-0" />
    case 'done': return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
    case 'failed': return <XCircle className="h-4 w-4 text-red-500 shrink-0" />
  }
}

export function ActivityIndicator() {
  const { runs, isActive } = useActivityStream()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Activity"
          aria-busy={isActive}
          title="Activity"
          className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <span className="relative inline-flex items-center justify-center">
            {isActive && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -m-1 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin motion-reduce:animate-none"
              />
            )}
            <Activity className={cn('h-5 w-5', isActive && 'animate-pulse text-zinc-200')} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        {runs.length === 0 ? (
          <p className="text-zinc-500 text-sm">No active workflows</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-100 text-sm font-medium">{runTitle(run.type)}</p>
                  <p className="text-zinc-400 text-xs truncate">{runStatusLine(run)}</p>
                </div>
                <RunStatusGlyph state={run.state} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <Link
            to="/config/logs"
            onClick={() => setOpen(false)}
            className="block text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
          >
            View all in Logs →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
