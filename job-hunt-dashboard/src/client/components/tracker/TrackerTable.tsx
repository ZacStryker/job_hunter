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
import type { Job } from '@shared/schemas'
import { ScoreBadge } from '../pipeline/ScoreBadge'
import { parseLocation } from '../../utils/parseLocation'
import { jobMatchesKeyword } from '../../utils/jobMatchesKeyword'
import { KeywordFilterInput } from '../shared/KeywordFilterInput'
import { TablePagination } from '../shared/TablePagination'

const PAGE_SIZE = 20
const SIZING_KEY = 'hitlobster-column-sizing-tracker'
const SORTING_KEY = 'hitlobster-column-sorting-tracker'

function loadSorting(): SortingState | null {
  try {
    const stored = localStorage.getItem(SORTING_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return null
    if (!parsed.every((e) => typeof e === 'object' && e !== null && typeof (e as { id?: unknown }).id === 'string' && typeof (e as { desc?: unknown }).desc === 'boolean')) return null
    return parsed as SortingState
  } catch {
    return null
  }
}

function saveSorting(state: SortingState) {
  try {
    localStorage.setItem(SORTING_KEY, JSON.stringify(state))
  } catch {
    // ignore storage errors
  }
}

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
  const [keyword, setKeyword] = useState('')
  const filteredAppliedJobs = useMemo(
    () => appliedJobs.filter((job) => jobMatchesKeyword(job, keyword)),
    [appliedJobs, keyword]
  )
  const [sorting, setSorting] = useState<SortingState>(() => loadSorting() ?? [{ id: 'dateApplied', desc: true }])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadSizing())
  const containerRef = useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data: filteredAppliedJobs,
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
      setSorting((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        saveSorting(next)
        return next
      })
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
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
        <KeywordFilterInput value={keyword} onChange={setKeyword} placeholder="Filter applications…" />
        <TablePagination
          from={from}
          to={to}
          totalRows={totalRows}
          pageIndex={pageIndex}
          pageCount={table.getPageCount()}
          canPrevious={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onPrevious={() => table.previousPage()}
          onNext={() => table.nextPage()}
          noun="applications"
        />
      </div>
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
    </div>
  )
}
