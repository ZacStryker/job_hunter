import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { TooltipProvider } from '../ui/tooltip'
import { AgingRow } from './AgingRow'
import { APPLIED } from '../detail/StatusDropdown'
import type { Job } from '@shared/schemas'

interface TrackerTableProps {
  jobs: Job[]
  onRowClick: (job: Job) => void
  selectedJobId: number | null
}

function formatDate(dateApplied: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateApplied + 'T00:00:00'))
}

export function TrackerTable({ jobs, onRowClick, selectedJobId }: TrackerTableProps) {
  const appliedJobs = jobs.filter((j) => j.applied)

  if (appliedJobs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <p className="text-sm text-zinc-400">
            No applied jobs yet. Mark jobs as applied in the Pipeline view.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
      <div className="overflow-auto flex-1">
        <TooltipProvider>
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800">
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Company</TableHead>
                <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Job Title</TableHead>
                <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Status</TableHead>
                <TableHead className="px-3 h-9 text-xs font-medium uppercase text-zinc-400">Date Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appliedJobs.map((job) => (
                <AgingRow
                  key={job.id}
                  dateApplied={job.dateApplied}
                  isSelected={job.id === selectedJobId}
                  onClick={() => onRowClick(job)}
                >
                  <TableCell className="py-1.5 px-3 text-sm text-zinc-200">{job.company}</TableCell>
                  <TableCell className="py-1.5 px-3 text-sm text-zinc-200">{job.jobTitle}</TableCell>
                  <TableCell className="py-1.5 px-3 text-sm text-zinc-200">
                    {job.statusOverride ?? job.status ?? (job.applied ? APPLIED : '—')}
                  </TableCell>
                  <TableCell className="py-1.5 px-3 text-sm text-zinc-200">
                    {job.dateApplied ? formatDate(job.dateApplied) : '—'}
                  </TableCell>
                </AgingRow>
              ))}
            </TableBody>
          </table>
        </TooltipProvider>
      </div>
    </div>
  )
}
