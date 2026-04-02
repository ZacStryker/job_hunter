import type { Table } from '@tanstack/react-table'
import type { Job } from '@shared/schemas'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const OPTIONAL_COLUMNS: Array<{ id: string; label: string }> = [
  { id: 'reqs_met', label: 'Reqs Met' },
  { id: 'reqs_missed', label: 'Reqs Missed' },
  { id: 'notes', label: 'Notes' },
]

interface ColumnVisibilityToggleProps {
  table: Table<Job>
}

export function ColumnVisibilityToggle({ table }: ColumnVisibilityToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONAL_COLUMNS.map(({ id, label }) => {
          const column = table.getColumn(id)
          if (!column) return null
          return (
            <DropdownMenuCheckboxItem
              key={id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(value)}
            >
              {label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
