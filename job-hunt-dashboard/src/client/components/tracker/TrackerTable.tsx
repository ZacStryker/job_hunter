import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { SortingState, ColumnSizingState } from '@tanstack/react-table'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Button } from '../ui/button'
import type { Job } from '@shared/schemas'
import { ScoreBadge } from '../pipeline/ScoreBadge'
import { parseLocation } from '../../utils/parseLocation'

const PAGE_SIZE = 20
const SIZING_KEY = 'hitlobster-column-sizing-tracker'

function loadSizing(): ColumnSizingState {
  try {
    const stored = localStorage.getItem(SIZING_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: ColumnSizingState = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && isFinite(v)) result[k] = v
    }
    return result
  } catch {
    return {}
  }
}

function saveSizing(state: ColumnSizingState) {
  try {
    localStorage.setItem(SIZING_KEY, JSON.stringify(state))
  } catch {
    // ignore storage errors
  }
}

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
    size: 160,
    cell: (info) => (
      <span className="whitespace-nowrap overflow-hidden text-ellipsis block">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('jobTitle', {
    header: 'Job Title',
    size: 220,
    cell: (info) => (
      <span className="whitespace-nowrap overflow-hidden text-ellipsis block">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('location', {
    header: 'Location',
    size: 140,
    cell: (info) => {
      const { place } = parseLocation(info.getValue())
      return place
        ? <span className="whitespace-nowrap overflow-hidden text-ellipsis block">{place}</span>
        : '—'
    },
    sortingFn: (rowA, rowB) => {
      const a = parseLocation(rowA.original.location).place ?? ''
      const b = parseLocation(rowB.original.location).place ?? ''
      return a.localeCompare(b)
    },
  }),
  columnHelper.accessor('location', {
    id: 'locationType',
    header: 'Type',
    size: 90,
    cell: (info) => {
      const { type } = parseLocation(info.getValue())
      return type
        ? <span className="whitespace-nowrap overflow-hidden text-ellipsis block">{type}</span>
        : '—'
    },
    sortingFn: (rowA, rowB) => {
      const a = parseLocation(rowA.original.location).type ?? ''
      const b = parseLocation(rowB.original.location).type ?? ''
      return a.localeCompare(b)
    },
  }),
  columnHelper.accessor('fitScore', {
    header: 'Score',
    size: 70,
    cell: (info) => <ScoreBadge score={info.getValue()} />,
  }),
  columnHelper.accessor('latestStatus', {
    header: 'Status',
    size: 140,
    cell: (info) => {
      const v = info.getValue()
      return v
        ? <span className="whitespace-nowrap overflow-hidden text-ellipsis block">{v}</span>
        : '—'
    },
    sortUndefined: 1,
  }),
  columnHelper.accessor('dateApplied', {
    header: 'Date Applied',
    size: 120,
    cell: (info) => {
      const v = info.getValue()
      return v
        ? <span className="whitespace-nowrap overflow-hidden text-ellipsis block">{formatDate(v)}</span>
        : '—'
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
  const appliedJobs = useMemo(() => jobs.filter((j) => j.applied), [jobs])
  const [sorting, setSorting] = useState<SortingState>([{ id: 'dateApplied', desc: true }])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadSizing())
  const containerRef = useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data: appliedJobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    defaultColumn: { minSize: 40 },
    enableMultiSort: false,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    initialState: { pagination: { pageSize: PAGE_SIZE, pageIndex: 0 } },
    state: { sorting, columnSizing },
    onSortingChange: (updater) => {
      table.setPageIndex(0)
      setSorting(updater)
    },
    onColumnSizingChange: (updater) => {
      setColumnSizing((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        saveSizing(next)
        return next
      })
    },
  })

  useLayoutEffect(() => {
    if (Object.keys(columnSizing).length > 0 || !containerRef.current) return
    const containerWidth = containerRef.current.clientWidth
    if (containerWidth === 0) return
    const visibleCols = table.getVisibleLeafColumns()
    const totalSize = visibleCols.reduce((sum, col) => sum + col.getSize(), 0)
    if (totalSize === 0) return
    const newSizing: ColumnSizingState = {}
    let allocated = 0
    visibleCols.forEach((col, i) => {
      if (i === visibleCols.length - 1) {
        newSizing[col.id] = Math.max(col.columnDef.minSize ?? 40, containerWidth - allocated)
      } else {
        const w = Math.max(col.columnDef.minSize ?? 40, Math.floor(col.getSize() / totalSize * containerWidth))
        newSizing[col.id] = w
        allocated += w
      }
    })
    setColumnSizing(newSizing)
    saveSizing(newSizing)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { pageIndex, pageSize } = table.getState().pagination
  const totalRows = table.getFilteredRowModel().rows.length
  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, totalRows)

  if (appliedJobs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <p className="text-sm text-zinc-400">
            No applications yet. Mark jobs as applied on the Matches page to populate.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
      <div ref={containerRef} className="overflow-auto flex-1">
        <table className="caption-bottom text-sm" style={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
          <TableHeader className="sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-0 hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className="px-3 h-9 text-xs font-medium uppercase text-zinc-400 cursor-pointer select-none relative overflow-hidden"
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}
                      </span>
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); header.getResizeHandler()(e) }}
                        onTouchStart={header.getResizeHandler()}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none ${
                          header.column.getIsResizing()
                            ? 'bg-zinc-400 opacity-100'
                            : 'bg-zinc-700 opacity-0 hover:opacity-100'
                        }`}
                      />
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
                  <TableCell
                    key={cell.id}
                    className="h-[40.8px] py-1.5 px-3 text-sm text-zinc-200 overflow-hidden"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-500">
          {totalRows === 0 ? '0 applications' : `${from}–${to} of ${totalRows}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ←
          </Button>
          <span className="text-xs text-zinc-400 px-2">
            {pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            →
          </Button>
        </div>
      </div>
    </div>
  )
}
