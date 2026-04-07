import { useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import type { Job } from '@shared/schemas'
import { useJobMutation } from '../../hooks/useJobMutation'

export const NO_STATUS = '__none__'
export const APPLIED = 'Applied'

export const STATUS_OPTIONS = [
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

interface StatusDropdownProps {
  job: Job
}

export function StatusDropdown({ job }: StatusDropdownProps) {
  const mutation = useJobMutation(job.id)

  useEffect(() => {
    mutation.reset()
  }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // statusOverride takes priority; fall back to applied state
  const displayValue = job.statusOverride ?? (job.applied ? APPLIED : NO_STATUS)

  function handleChange(value: string) {
    if (value === NO_STATUS) {
      mutation.mutate({ id: job.id, patch: { applied: false, statusOverride: null } })
    } else if (value === APPLIED) {
      mutation.mutate({ id: job.id, patch: { applied: true, statusOverride: null } })
    } else {
      mutation.mutate({ id: job.id, patch: { applied: true, statusOverride: value } })
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Status</p>
      <Select
        value={displayValue}
        disabled={mutation.isPending}
        onValueChange={handleChange}
      >
        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-200">
          <SelectValue placeholder="No Status" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border-zinc-700">
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-zinc-200">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.isError && (
        <p className="text-xs text-red-400">{mutation.error?.message ?? 'Update failed'}</p>
      )}
    </div>
  )
}
