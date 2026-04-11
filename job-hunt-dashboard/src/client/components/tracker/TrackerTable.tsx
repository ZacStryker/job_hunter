import { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { SortingState } from '@tanstack/react-table'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import type { Job } from '@shared/schemas'

const columnHelper = createColumnHelper<Job>()

function formatDate(dateApplied: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateApplied + 'T00:00:00'))
}

const columns = [
  columnHelper.accessor('company', {
    header: 'Company',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('jobTitle', {
    header: 'Job Title',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('latestStatus', {
    header: 'Status',
    cell: (info) => info.getValue() ?? '—',
    sortUndefined: 1,
  }),
  columnHelper.accessor('dateApplied', {
    header: 'Date Applied',
    cell: (info) => {
      const v = info.getValue()
      return v ? formatDate(v) : '—'
    },
    sortUndefined: 1,
  }),
]

interface TrackerTableProps {
  jobs: Job[]
  onRowClick: (job: Job) => void
  selectedJobId: number | null
}

export function TrackerTable({ jobs, onRowClick, selectedJobId }: TrackerTableProps) {
  const appliedJobs = jobs.filter((j) => j.applied)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'dateApplied', desc: true }])

  const table = useReactTable({
    data: appliedJobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    state: { sorting },
    onSortingChange: setSorting,
  })

  if (appliedJobs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <p className="text-sm text-zinc-400">
            No applied jobs yet. Mark jobs as applied in the Jobs view.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
      <div className="overflow-auto flex-1">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-0 hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className="px-3 h-9 text-xs font-medium uppercase text-zinc-400 cursor-pointer select-none"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick(row.original)}
                className={`border-zinc-800 cursor-pointer ${
                  row.original.id === selectedJobId ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-1.5 px-3 text-sm text-zinc-200">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
