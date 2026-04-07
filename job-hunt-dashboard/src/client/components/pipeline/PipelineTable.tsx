import { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { SortingState, VisibilityState, Updater } from '@tanstack/react-table'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import type { Job } from '@shared/schemas'
import { ScoreBadge } from './ScoreBadge'
import { ActionChip } from './ActionChip'
import { ColumnVisibilityToggle } from './ColumnVisibilityToggle'

const VISIBILITY_KEY = 'job-hunt-column-visibility'

function loadVisibility(): VisibilityState {
  try {
    const stored = localStorage.getItem(VISIBILITY_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as VisibilityState
  } catch {
    return {}
  }
}

const columnHelper = createColumnHelper<Job>()

const columns = [
  columnHelper.accessor('company', {
    header: 'Company',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('jobTitle', {
    header: 'Job Title',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('fitScore', {
    header: 'Score',
    cell: (info) => <ScoreBadge score={info.getValue()} />,
  }),
  columnHelper.accessor('recommendation', {
    header: 'Action',
    cell: (info) => <ActionChip recommendation={info.getValue()} />,
  }),
  columnHelper.accessor('roleFit', {
    id: 'notes',
    header: 'Notes',
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="max-w-[200px] truncate block text-zinc-300">{v}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('dateScraped', {
    id: 'date_scraped',
    header: 'Date Scraped',
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="text-zinc-300">{v.slice(0, 10)}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="text-zinc-300">{v}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
]

interface PipelineTableProps {
  jobs: Job[]
  onRowClick: (job: Job) => void
  selectedJobId: number | null
}

export function PipelineTable({ jobs, onRowClick, selectedJobId }: PipelineTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadVisibility)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'fitScore', desc: true }])

  function handleVisibilityChange(updater: Updater<VisibilityState>) {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try {
        localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors (quota exceeded, private mode)
      }
      return next
    })
  }

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    state: { columnVisibility, sorting },
    onColumnVisibilityChange: handleVisibilityChange,
    onSortingChange: setSorting,
  })

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
      <div className="flex items-center justify-end px-3 py-2 border-b border-zinc-800 shrink-0">
        <ColumnVisibilityToggle table={table} />
      </div>
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
                  row.original.id === selectedJobId
                    ? 'bg-zinc-800'
                    : 'hover:bg-zinc-800/50'
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
