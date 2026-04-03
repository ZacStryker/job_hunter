import { useEffect } from 'react'
import { Switch } from '../ui/switch'
import type { Job } from '@shared/schemas'
import { useJobMutation } from '../../hooks/useJobMutation'

interface AppliedToggleProps {
  job: Job
}

export function AppliedToggle({ job }: AppliedToggleProps) {
  const mutation = useJobMutation(job.id)

  useEffect(() => {
    mutation.reset()
  }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const label = job.applied && job.dateApplied
    ? `Applied · ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(job.dateApplied + 'T00:00:00'))}`
    : 'Applied'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Switch
          checked={job.applied}
          disabled={mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate({ id: job.id, patch: { applied: checked } })}
        />
        <span className="text-sm text-zinc-200">{label}</span>
      </div>
      {mutation.isError && (
        <p className="text-xs text-red-400">{mutation.error?.message ?? 'Update failed'}</p>
      )}
    </div>
  )
}
