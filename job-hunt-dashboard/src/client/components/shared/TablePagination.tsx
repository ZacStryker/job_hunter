import { Button } from '../ui/button'

interface TablePaginationProps {
  from: number
  to: number
  totalRows: number
  pageIndex: number
  pageCount: number
  canPrevious: boolean
  canNext: boolean
  onPrevious: () => void
  onNext: () => void
  noun: string
}

export function TablePagination({
  from,
  to,
  totalRows,
  pageIndex,
  pageCount,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  noun,
}: TablePaginationProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="px-1 text-xs text-zinc-500">
        {totalRows === 0 ? `0 ${noun}` : `${from}–${to} of ${totalRows}`}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onPrevious}
        disabled={!canPrevious}
      >
        ←
      </Button>
      <span className="px-2 text-xs text-zinc-400">
        {pageIndex + 1} / {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onNext}
        disabled={!canNext}
      >
        →
      </Button>
    </div>
  )
}
