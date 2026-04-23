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
} from '../components/ui/table'
import type { WebhookRun } from '@shared/schemas'
import { useWebhookRunsQuery } from '../hooks/useWebhookRunsQuery'

function parseName(name: string): { workflow: string; job: string } {
  if (name.startsWith('Cover Letter - ')) return { workflow: 'Cover Letter', job: name.slice('Cover Letter - '.length) }
  if (name.startsWith('Resume - ')) return { workflow: 'Resume', job: name.slice('Resume - '.length) }
  return { workflow: name, job: '' }
}

const columnHelper = createColumnHelper<WebhookRun>()

const columns = [
  columnHelper.accessor('runAt', {
    header: 'Run Date',
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  columnHelper.accessor((row) => parseName(row.name).workflow, {
    id: 'workflow',
    header: 'Workflow',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => parseName(row.name).job, {
    id: 'job',
    header: 'Job',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    meta: { minWidth: 220 } as any,
    cell: (info) => info.getValue() || <span className="text-zinc-600">—</span>,
  }),
  columnHelper.accessor('success', {
    header: 'Success',
    cell: (info) => {
      const ok = info.getValue()
      const errorMessage = info.row.original.errorMessage
      return ok ? (
        <span className="text-green-400">✓</span>
      ) : (
        <span className="text-red-400 flex items-center gap-1.5" title={errorMessage ?? undefined}>
          ✗{errorMessage ? <span className="text-xs text-zinc-500 max-w-[160px] truncate">{errorMessage}</span> : null}
        </span>
      )
    },
  }),
  columnHelper.accessor('itemCount', {
    header: 'Item Count',
    cell: (info) => {
      const val = info.getValue()
      return val !== null ? String(val) : '—'
    },
  }),
  columnHelper.accessor('durationMs', {
    header: 'Duration',
    cell: (info) => {
      const val = info.getValue()
      return val !== null ? (val / 1000).toFixed(1) + 's' : <span className="text-zinc-600">—</span>
    },
  }),
  columnHelper.accessor('inputTokens', {
    header: 'Input Tokens',
    cell: (info) => {
      const val = info.getValue()
      return val !== null ? String(val) : <span className="text-zinc-600">—</span>
    },
  }),
  columnHelper.accessor('outputTokens', {
    header: 'Output Tokens',
    cell: (info) => {
      const val = info.getValue()
      return val !== null ? String(val) : <span className="text-zinc-600">—</span>
    },
  }),
  columnHelper.accessor('costUsd', {
    header: 'Cost',
    cell: (info) => {
      const val = info.getValue()
      return val !== null ? '$' + Number(val).toFixed(4) : <span className="text-zinc-600">—</span>
    },
  }),
]

export function HistoryRoute() {
  const { data: runs = [], isPending, isError, error } = useWebhookRunsQuery()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'runAt', desc: true }])

  const table = useReactTable({
    data: runs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    state: { sorting },
    onSortingChange: setSorting,
  })

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
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-zinc-800">
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    const colMeta = header.column.columnDef.meta as { minWidth?: number } | undefined
                    return (
                      <TableHead
                        key={header.id}
                        className="text-zinc-400 bg-zinc-900 px-3 py-2 cursor-pointer select-none"
                        style={colMeta?.minWidth ? { minWidth: colMeta.minWidth } : undefined}
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
                <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-900/50">
                  {row.getVisibleCells().map((cell) => {
                    const cellMeta = cell.column.columnDef.meta as { minWidth?: number } | undefined
                    return (
                      <TableCell key={cell.id} className="px-3 py-2 text-zinc-300"
                        style={cellMeta?.minWidth ? { minWidth: cellMeta.minWidth } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  )
}
