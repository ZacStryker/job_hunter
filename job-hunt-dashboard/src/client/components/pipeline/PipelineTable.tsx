import { useState, useRef, useLayoutEffect, useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { SortingState, VisibilityState, Updater, RowSelectionState, ColumnSizingState } from '@tanstack/react-table'
import { Button } from '../ui/button'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import type { Job } from '@shared/schemas'
import { Check, Minus } from 'lucide-react'
import { ScoreBadge } from './ScoreBadge'
import { ActionChip } from './ActionChip'
import { ColumnVisibilityToggle } from './ColumnVisibilityToggle'
import { parseLocation } from '../../utils/parseLocation'
import { jobMatchesKeyword } from '../../utils/jobMatchesKeyword'
import { cn } from '../../lib/utils'
import { KeywordFilterInput } from '../shared/KeywordFilterInput'
import { TablePagination } from '../shared/TablePagination'

const NO_STATUS = '__none__'

function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  onClick,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void
  label: string
}) {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate
        }}
        onChange={onChange}
        onClick={onClick}
        aria-label={label}
        className="peer h-4 w-4 cursor-pointer appearance-none rounded-[3px] border border-zinc-600 bg-zinc-800 transition-colors hover:border-zinc-500 checked:border-zinc-100 checked:bg-zinc-100 indeterminate:border-zinc-100 indeterminate:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"
      />
      <Check
        className="pointer-events-none absolute h-3 w-3 text-zinc-900 opacity-0 peer-checked:opacity-100"
        strokeWidth={3}
      />
      <Minus
        className="pointer-events-none absolute h-3 w-3 text-zinc-900 opacity-0 peer-indeterminate:opacity-100 peer-checked:opacity-0"
        strokeWidth={3}
      />
    </span>
  )
}

const APPLIED = 'Applied'
const STATUS_OPTIONS = [
  { value: NO_STATUS, label: 'No Status' },
  { value: APPLIED, label: 'Applied' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'technical', label: 'Technical Round' },
  { value: 'offer', label: 'Offer Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'ghosted', label: 'Ghosted' },
]

const PAGE_SIZE = 20
const VISIBILITY_KEY = 'hitlobster-column-visibility'

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

function loadSizing(key: string): ColumnSizingState {
  try {
    const stored = localStorage.getItem(key)
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

function saveSizing(key: string, state: ColumnSizingState) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // ignore storage errors
  }
}

const columnHelper = createColumnHelper<Job>()

const staticColumns = [
  columnHelper.accessor('company', {
    header: 'Company',
    size: 180,
    cell: (info) => (
      <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300" title={info.getValue()}>{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('jobTitle', {
    header: 'Job Title',
    size: 240,
    cell: (info) => (
      <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300" title={info.getValue()}>{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('location', {
    header: 'Location',
    size: 160,
    cell: (info) => {
      const { place } = parseLocation(info.getValue())
      return place ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300" title={place}>{place}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
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
      return type ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{type}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
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
  columnHelper.accessor('recommendation', {
    header: 'Recommendation',
    size: 130,
    cell: (info) => <ActionChip recommendation={info.getValue()} />,
  }),
  columnHelper.accessor('dateAnalyzed', {
    id: 'date_analyzed',
    header: 'Date Analyzed',
    size: 120,
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{v.slice(0, 10)}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('roleFit', {
    id: 'notes',
    header: 'Notes',
    size: 180,
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{v}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('source', {
    header: 'Source',
    size: 100,
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{v}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('relevanceScore', {
    header: 'Relevance',
    size: 90,
    cell: (info) => {
      const v = info.getValue()
      return v != null
        ? <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{v.toFixed(2)}</span>
        : <span className="text-zinc-500">—</span>
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.relevanceScore ?? -Infinity
      const b = rowB.original.relevanceScore ?? -Infinity
      return a - b
    },
    enableSorting: true,
  }),
  columnHelper.accessor('dateScraped', {
    id: 'date_scraped',
    header: 'Date Scraped',
    size: 120,
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{v.slice(0, 10)}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor('dateApplied', {
    id: 'date_applied',
    header: 'Date Applied',
    size: 120,
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{v.slice(0, 10)}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
  }),
  columnHelper.accessor(
    (row) => row.statusOverride ?? (row.applied ? APPLIED : NO_STATUS),
    {
      id: 'status',
      header: 'Status',
      size: 120,
      cell: ({ getValue }) => {
        const value = getValue()
        if (value === NO_STATUS) return <span className="text-zinc-500">—</span>
        const label = STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
        return <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{label}</span>
      },
    }
  ),
  columnHelper.accessor('dateArchived', {
    id: 'date_archived',
    header: 'Date Archived',
    size: 120,
    cell: (info) => {
      const v = info.getValue()
      return v ? (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis block text-zinc-300">{v.slice(0, 10)}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.dateArchived
      const b = rowB.original.dateArchived
      if (!a && !b) return 0
      if (!a) return 1   // nulls sink to bottom regardless of sort direction
      if (!b) return -1
      return a < b ? -1 : a > b ? 1 : 0
    },
  }),
]

interface PipelineTableProps {
  jobs: Job[]
  onRowClick: (job: Job) => void
  selectedJobId: number | null
  onBulkArchive?: (ids: number[]) => void
  isBulkArchiving?: boolean
  fixedColumns?: string[]
  initialSort?: SortingState
  sizingStorageKey: string
}

export function PipelineTable({ jobs, onRowClick, selectedJobId, onBulkArchive, isBulkArchiving = false, fixedColumns, initialSort, sizingStorageKey }: PipelineTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (fixedColumns) {
      const state: VisibilityState = {}
      for (const col of staticColumns) {
        const id = col.id ?? (col as { accessorKey?: string }).accessorKey as string
        if (id) state[id] = fixedColumns.includes(id)
      }
      return state
    }
    return loadVisibility()
  })
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [{ id: 'fitScore', desc: true }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadSizing(sizingStorageKey))
  const [keyword, setKeyword] = useState('')
  const filteredJobs = useMemo(() => jobs.filter((job) => jobMatchesKeyword(job, keyword)), [jobs, keyword])
  const lastSelectedIndexRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function handleVisibilityChange(updater: Updater<VisibilityState>) {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (!fixedColumns) {
        try {
          localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next))
        } catch {
          // ignore storage errors (quota exceeded, private mode)
        }
      }
      return next
    })
  }

  const selectionColumn = columnHelper.display({
    id: 'select',
    size: 36,
    minSize: 36,
    header: ({ table }) => (
      <label
        className="absolute inset-0 flex cursor-pointer items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectionCheckbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={(e) => {
            table.getToggleAllRowsSelectedHandler()(e)
            lastSelectedIndexRef.current = null
          }}
          label="Select all"
        />
      </label>
    ),
    cell: ({ row, table }) => {
      const rows = table.getRowModel().rows
      const rowIndex = rows.findIndex((r) => r.id === row.id)

      function handleChange() {
        row.toggleSelected()
        lastSelectedIndexRef.current = rowIndex
      }

      function handleClick(e: React.MouseEvent<HTMLInputElement>) {
        if (e.shiftKey && lastSelectedIndexRef.current !== null) {
          e.preventDefault() // prevent default toggle + onChange
          const from = Math.min(lastSelectedIndexRef.current, rowIndex)
          const to = Math.max(lastSelectedIndexRef.current, rowIndex)
          setRowSelection((prev) => {
            const next = { ...prev }
            for (let i = from; i <= to; i++) {
              next[rows[i].id] = true
            }
            return next
          })
          lastSelectedIndexRef.current = rowIndex
        }
        // non-shift clicks fall through to onChange
      }

      return (
        <label
          className="absolute inset-0 flex cursor-pointer items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <SelectionCheckbox
            checked={row.getIsSelected()}
            onChange={handleChange}
            onClick={handleClick}
            label="Select row"
          />
        </label>
      )
    },
  })

  const columns = [selectionColumn, ...staticColumns]

  const table = useReactTable({
    data: filteredJobs,
    columns,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    defaultColumn: { minSize: 40 },
    enableMultiSort: false,
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    initialState: { pagination: { pageSize: PAGE_SIZE, pageIndex: 0 } },
    state: { columnVisibility, sorting, rowSelection, columnSizing },
    onColumnVisibilityChange: handleVisibilityChange,
    onSortingChange: (updater) => {
      table.setPageIndex(0)
      setSorting(updater)
      lastSelectedIndexRef.current = null
    },
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: (updater) => {
      setColumnSizing((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        saveSizing(sizingStorageKey, next)
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
    saveSizing(sizingStorageKey, newSizing)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { pageIndex, pageSize } = table.getState().pagination
  const totalRows = table.getFilteredRowModel().rows.length
  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, totalRows)

  const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id)
  const selectedCount = selectedIds.length

  function handleBulkArchive() {
    onBulkArchive?.(selectedIds)
    setRowSelection({})
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <KeywordFilterInput value={keyword} onChange={setKeyword} placeholder="Filter jobs…" />
          {onBulkArchive && selectedCount > 0 && (
            <Button size="sm" variant="outline" onClick={handleBulkArchive} disabled={isBulkArchiving}>
              {isBulkArchiving ? 'Archiving…' : `Archive (${selectedCount})`}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            noun="jobs"
          />
          {!fixedColumns && <ColumnVisibilityToggle table={table} />}
        </div>
      </div>
      <div ref={containerRef} className="overflow-auto flex-1">
        <table className="caption-bottom text-sm" style={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
          <TableHeader className="sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-0 hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  if (header.column.id === 'select') {
                    return (
                      <TableHead
                        key={header.id}
                        className="relative h-9 p-0 select-none"
                        style={{ width: header.getSize() }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )
                  }
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
                className={cn(
                  'border-zinc-800 cursor-pointer select-none transition-colors',
                  row.getIsSelected()
                    ? 'bg-zinc-700/60 hover:bg-zinc-700/80'
                    : row.original.id === selectedJobId
                      ? 'bg-zinc-800'
                      : 'hover:bg-zinc-800/50'
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      'h-[40.8px] py-1.5 px-3 text-sm text-zinc-200 overflow-hidden',
                      cell.column.id === 'select' && 'relative p-0'
                    )}
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
