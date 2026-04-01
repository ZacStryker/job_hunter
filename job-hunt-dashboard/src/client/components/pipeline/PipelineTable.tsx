import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
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
]

interface PipelineTableProps {
  jobs: Job[]
}

export function PipelineTable({ jobs }: PipelineTableProps) {
  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-88px)]">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-0 hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="px-3 h-9 text-xs font-medium uppercase text-zinc-400"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
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
