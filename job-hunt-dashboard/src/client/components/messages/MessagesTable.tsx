import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { SortingState } from '@tanstack/react-table'
import { useState, useMemo, useRef } from 'react'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check } from 'lucide-react'
import { Button } from '../ui/button'
import type { Message } from '@shared/schemas'
import type { Job } from '@shared/schemas'
import { MESSAGE_TYPES } from '@shared/schemas'
import { useMessageMutation } from '../../hooks/useMessageMutation'

const NONE_SENTINEL = '__none__'
const PAGE_SIZE = 20

function formatDateScraped(dateStr: string | null, includeYear: boolean): string {
  if (!dateStr) return '—'
  const datePart = dateStr.slice(0, 10)
  const d = new Date(datePart + 'T00:00:00Z')
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.getUTCDate()
  if (includeYear) return `${month} ${day} ${d.getUTCFullYear()}`
  return `${month} ${day}`
}

function getStatusDotClass(status: string | null): string {
  if (!status) return 'bg-yellow-400'
  const s = status.toLowerCase()
  if (s === 'submitted') return 'bg-blue-400'
  if (s === 'screening' || s === 'interview') return 'bg-green-400'
  return 'bg-orange-400'
}

function formatReceived(isoString: string): string {
  const d = new Date(isoString)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`
}

function CompanyTypeahead({
  value,
  options,
  onCommit,
}: {
  value: string | null
  options: string[]
  onCommit: (v: string | null) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase())),
    [options, inputValue]
  )

  function handleFocus() {
    setInputValue('')
    setOpen(true)
  }

  function handleBlur() {
    setTimeout(() => {
      setOpen(false)
      setInputValue('')
    }, 150)
  }

  function handleSelect(company: string | null) {
    onCommit(company)
    setOpen(false)
    setInputValue('')
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (filtered.length > 0) handleSelect(filtered[0])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setInputValue('')
      inputRef.current?.blur()
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="h-7 w-[150px] bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-2 rounded focus:outline-none focus:border-zinc-500"
        value={open ? inputValue : (value ?? '')}
        placeholder="—"
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-[200px] bg-zinc-800 border border-zinc-700 rounded shadow-lg max-h-60 overflow-y-auto">
          <div
            className="px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 cursor-pointer"
            onMouseDown={(e) => {
              e.preventDefault()
              handleSelect(null)
            }}
          >
            —
          </div>
          {filtered.map((c) => (
            <div
              key={c}
              className="px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(c)
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const columnHelper = createColumnHelper<Message>()

interface MessagesTableProps {
  messages: Message[]
  jobs: Job[]
}

export function MessagesTable({ messages, jobs }: MessagesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'receivedAt', desc: true }])
  const { mutate } = useMessageMutation()

  const distinctCompanies = useMemo(
    () => [...new Set(jobs.map((j) => j.company))].sort(),
    [jobs]
  )

  const companyToJobs = useMemo(() => {
    const map = new Map<string, Job[]>()
    for (const job of jobs.filter((j) => !j.archived)) {
      const list = map.get(job.company)
      if (list) {
        if (!list.some((j) => j.jobTitle === job.jobTitle)) list.push(job)
      } else {
        map.set(job.company, [job])
      }
    }
    for (const list of map.values()) list.sort((a, b) => (b.dateScraped ?? '').localeCompare(a.dateScraped ?? ''))
    return map
  }, [jobs])

  const columns = useMemo(() => [
    columnHelper.accessor('receivedAt', {
      header: 'Received',
      cell: (info) => (
        <span className="text-zinc-300 whitespace-nowrap">{formatReceived(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor('fromAddress', {
      header: 'From',
      cell: (info) => (
        <span className="max-w-[220px] truncate block text-zinc-300">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor('subject', {
      header: 'Subject',
      cell: (info) => (
        <span className="max-w-[280px] truncate block text-zinc-300">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor('type', {
      header: 'Type',
      cell: (info) => {
        const row = info.row.original
        const value = row.type ?? NONE_SENTINEL
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              value={value}
              onValueChange={(v) => {
                mutate({ id: row.id, patch: { type: v === NONE_SENTINEL ? null : v } })
              }}
            >
              <SelectTrigger className="h-7 w-[130px] bg-zinc-800 border-zinc-700 text-zinc-200 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value={NONE_SENTINEL}>—</SelectItem>
                {MESSAGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      },
    }),
    columnHelper.accessor('company', {
      header: 'Company',
      cell: (info) => {
        const row = info.row.original
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <CompanyTypeahead
              value={row.company}
              options={distinctCompanies}
              onCommit={(newCompany) => {
                mutate({ id: row.id, patch: { company: newCompany, jobTitle: null } })
              }}
            />
          </div>
        )
      },
    }),
    columnHelper.accessor('jobTitle', {
      header: 'Job Title',
      cell: (info) => {
        const row = info.row.original
        const hasCompany = Boolean(row.company)
        const filteredJobs = hasCompany ? (companyToJobs.get(row.company!) ?? []) : []
        const selectedMissingFromList = row.jobTitle !== null &&
          row.jobTitle !== undefined &&
          !filteredJobs.some((j) => j.jobTitle === row.jobTitle)
        const uniqueYears = new Set(
          filteredJobs
            .filter((j) => j.dateScraped)
            .map((j) => new Date(j.dateScraped!.slice(0, 10) + 'T00:00:00Z').getUTCFullYear())
        )
        const multiYear = uniqueYears.size > 1
        const value = row.jobTitle ?? NONE_SENTINEL
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              value={value}
              disabled={!hasCompany}
              onValueChange={(v) => {
                mutate({ id: row.id, patch: { jobTitle: v === NONE_SENTINEL ? null : v } })
              }}
            >
              <SelectTrigger className="h-7 w-[180px] bg-zinc-800 border-zinc-700 text-zinc-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed [&>span]:text-left">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto w-[320px]">
                <SelectItem value={NONE_SENTINEL}>—</SelectItem>
                {selectedMissingFromList && (
                  <SelectItem value={row.jobTitle!} className="hidden">{row.jobTitle}</SelectItem>
                )}
                {filteredJobs.map((job) => (
                  <SelectPrimitive.Item
                    key={job.jobTitle}
                    value={job.jobTitle}
                    className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <SelectPrimitive.ItemIndicator>
                        <Check className="h-4 w-4" />
                      </SelectPrimitive.ItemIndicator>
                    </span>
                    <div className="flex items-center gap-2 mr-2 shrink-0">
                      <div className={`w-2 h-2 rounded-full ${getStatusDotClass(job.latestStatus)}`} />
                      <span className="text-zinc-400 text-xs tabular-nums">
                        {formatDateScraped(job.dateScraped, multiYear)}
                      </span>
                    </div>
                    <SelectPrimitive.ItemText>{job.jobTitle}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      },
    }),
  ], [mutate, distinctCompanies, companyToJobs])

  const table = useReactTable({
    data: messages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: false,
    initialState: { pagination: { pageSize: PAGE_SIZE, pageIndex: 0 } },
    state: { sorting },
    onSortingChange: (updater) => {
      table.setPageIndex(0)
      setSorting(updater)
    },
  })

  const { pageIndex, pageSize } = table.getState().pagination
  const totalRows = table.getFilteredRowModel().rows.length
  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, totalRows)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col">
      <div className="overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="border-b border-zinc-800">
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
              <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-800/50">
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

      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-500">
          {totalRows === 0 ? '0 messages' : `${from}–${to} of ${totalRows}`}
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
