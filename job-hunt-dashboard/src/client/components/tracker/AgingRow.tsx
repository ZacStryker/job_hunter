import { TableRow } from '../ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { ReactNode } from 'react'

export function computeDaysAgo(dateApplied: string): number {
  return Math.floor((Date.now() - new Date(dateApplied + 'T00:00:00').getTime()) / 86400000)
}

export function computeOpacity(dateApplied: string | null): number {
  if (!dateApplied) return 1.0
  const days = computeDaysAgo(dateApplied)
  if (days <= 7) return 1.0
  if (days <= 14) return 0.75
  if (days <= 21) return 0.55
  return 0.35
}

interface AgingRowProps {
  dateApplied: string | null
  isSelected: boolean
  onClick: () => void
  children: ReactNode
}

export function AgingRow({ dateApplied, isSelected, onClick, children }: AgingRowProps) {
  const days = dateApplied ? computeDaysAgo(dateApplied) : 0
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TableRow
          onClick={onClick}
          style={{ opacity: computeOpacity(dateApplied) }}
          className={`border-zinc-800 cursor-pointer ${
            isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
          }`}
        >
          {children}
        </TableRow>
      </TooltipTrigger>
      <TooltipContent>
        <p>Applied {days} days ago</p>
      </TooltipContent>
    </Tooltip>
  )
}
