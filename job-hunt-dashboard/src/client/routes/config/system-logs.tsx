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
import { TablePagination } from '@/components/shared/TablePagination'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { WebhookRun } from '@shared/schemas'
import { useWebhookRunsQuery } from '@/hooks/useWebhookRunsQuery'
import { KeywordFilterInput } from '@/components/shared/KeywordFilterInput'

const PAGE_SIZE = 20
const SIZING_KEY = 'hitlobster-column-sizing-logs'
const SORTING_KEY = 'hitlobster-column-sorting-logs'

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

function parseName(name: string): { workflow: string; job: string } {
  if (name.startsWith('Cover Letter - ')) return { workflow: 'Cover Letter', job: name.slice('Cover Letter - '.length) }
  if (name.startsWith('Resume - ')) return { workflow: 'Resume', job: name.slice('Resume - '.length) }
  return { workflow: name, job: '' }
}

const columnHelper = createColumnHelper<WebhookRun>()

const ELLIPSIS = 'whitespace-nowrap overflow-hidden text-ellipsis block'

const columns = [
  columnHelper.accessor('runAt', {
    header: 'Run Date',
    size: 150,
    cell: (info) => (
      <span className={ELLIPSIS}>
        {new Date(info.getValue()).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </span>
    ),
  }),
  columnHelper.accessor((row) => parseName(row.name).workflow, {
    id: 'workflow',
    header: 'Workflow',
    size: 130,
    cell: (info) => <span className={ELLIPSIS}>{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row, {
    id: 'detail',
    header: 'Detail',
    size: 280,
    cell: (info) => {
      const row = info.getValue()
      if (row.name === 'Analysis' && row.itemCount !== null) {
        return (
          <span className={`text-zinc-300 ${ELLIPSIS}`}>
            {row.itemCount} analyzed, {row.matchedCount ?? 0} matched, {row.archivedCount ?? 0} archived
          </span>
        )
      }
      if (row.name === 'Discovery' && row.itemCount !== null) {
        const breakdown = row.sourceBreakdown
        const parts = breakdown
          ? Object.entries(breakdown).filter(([, count]) => count >= 1).map(([src, count]) => `${src}: ${count}`)
          : []
        return (
          <span className={`text-zinc-300 ${ELLIPSIS}`}>
            {row.itemCount} added{parts.length > 0 ? ` (${parts.join(', ')})` : ''}
          </span>
        )
      }
      const job = parseName(row.name).job
      return job
        ? <span className={ELLIPSIS}>{job}</span>
        : <span className="text-zinc-600">—</span>
    },
  }),
  columnHelper.accessor('success', {
    header: 'Success',
    size: 110,
    cell: (info) => {
      const ok = info.getValue()
      const errorMessage = info.row.original.errorMessage
      return ok ? (
        <span className="text-green-400">✓</span>
      ) : (
        <span className="text-red-400 flex items-center gap-1.5 overflow-hidden" title={errorMessage ?? undefined}>
          ✗{errorMessage ? <span className="text-xs text-zinc-500 truncate min-w-0">{errorMessage}</span> : null}
        </span>
      )
    },
  }),
  columnHelper.accessor('durationMs', {
    header: 'Duration',
    size: 90,
    cell: (info) => {
      const val = info.getValue()
      return val !== null
        ? <span className={ELLIPSIS}>{(val / 1000).toFixed(1) + 's'}</span>
        : <span className="text-zinc-600">—</span>
    },
  }),
  columnHelper.accessor('inputTokens', {
    header: 'Input Tokens',
    size: 110,
    cell: (info) => {
      const val = info.getValue()
      return val !== null
        ? <span className={ELLIPSIS}>{String(val)}</span>
        : <span className="text-zinc-600">—</span>
    },
  }),
  columnHelper.accessor('outputTokens', {
    header: 'Output Tokens',
    size: 120,
    cell: (info) => {
      const val = info.getValue()
      return val !== null
        ? <span className={ELLIPSIS}>{String(val)}</span>
        : <span className="text-zinc-600">—</span>
    },
  }),
  columnHelper.accessor('costUsd', {
    header: 'Cost',
    size: 90,
    cell: (info) => {
      const val = info.getValue()
      return val !== null
        ? <span className={ELLIPSIS}>{'$' + Number(val).toFixed(4)}</span>
        : <span className="text-zinc-600">—</span>
    },
  }),
]

export function SystemLogsRoute() {
  const { data: runs = [], isPending, isError, error } = useWebhookRunsQuery()
  const [sorting, setSorting] = useState<SortingState>(() => loadSorting() ?? [{ id: 'runAt', desc: true }])
  const [keyword, setKeyword] = useState('')
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadSizing())
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredRuns = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return runs
    const tokens = q.split(/\s+/)
    return runs.filter((run) => {
      const haystack = [run.name, run.errorMessage]
        .filter((f): f is string => typeof f === 'string')
        .join(' ')
        .toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
  }, [runs, keyword])

  const table = useReactTable({
    data: filteredRuns,
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
    if (totalSize === 0 || totalSize >= containerWidth) return
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

  return (
    <div className="p-4 space-y-3">
      {!isPending && (
        <div className="text-sm text-zinc-400">
          {runs.length} run{runs.length !== 1 ? 's' : ''}
        </div>
      )}

      {isPending && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center py-16">
          <p className="text-sm text-zinc-400">Loading…</p>
        </div>
      )}
      {isError && <div className="text-sm text-red-400">{error.message}</div>}
      {!isPending && !isError && runs.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center py-16">
          <p className="text-sm text-zinc-400">No webhook runs yet.</p>
        </div>
      )}
      {!isPending && !isError && runs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
            <KeywordFilterInput value={keyword} onChange={setKeyword} placeholder="Filter logs…" />
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
              noun="runs"
            />
          </div>
          <div ref={containerRef} className="overflow-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-zinc-800">
                    {headerGroup.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      return (
                        <TableHead
                          key={header.id}
                          className="text-zinc-400 bg-zinc-900 px-3 h-9 cursor-pointer select-none relative overflow-hidden"
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
                  <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-900/50">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="h-[40.8px] px-3 py-1.5 text-zinc-300 overflow-hidden"
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
      )}
    </div>
  )
}
