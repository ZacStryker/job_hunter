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

const NO_OVERRIDE = '__none__'

const STATUS_OPTIONS = [
  { value: NO_OVERRIDE, label: 'No Override' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'technical', label: 'Technical Round' },
  { value: 'offer', label: 'Offer Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'ghosted', label: 'Ghosted' },
]

interface StatusOverrideProps {
  job: Job
}

export function StatusOverride({ job }: StatusOverrideProps) {
  const mutation = useJobMutation(job.id)

  useEffect(() => {
    mutation.reset()
  }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Status Override</p>
      <Select
        value={job.statusOverride ?? NO_OVERRIDE}
        disabled={mutation.isPending}
        onValueChange={(value) =>
          mutation.mutate({ id: job.id, patch: { statusOverride: value === NO_OVERRIDE ? null : value } })
        }
      >
        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-200">
          <SelectValue placeholder="No Override" />
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
