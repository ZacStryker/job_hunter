import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu'
import { useCoverLetterVersionsQuery } from '../../hooks/useCoverLetterVersionsQuery'
import { useCoverLetterRestoreMutation } from '../../hooks/useCoverLetterRestoreMutation'

interface Props {
  jobId: number
  sentAt: string
}

// REPLACES the date in the Documents header; it does not sit beside it. The date was already a
// de-facto version stamp, so this costs zero new pixels — same size, same colour, now a trigger.
//
// "A control with nothing to say does not render": with one version there is no chevron and no menu,
// and this renders EXACTLY the plain date the column rendered before this feature existed.
export function CoverLetterVersions({ jobId, sentAt }: Props) {
  const { data: versions = [] } = useCoverLetterVersionsQuery(jobId)
  const { mutate: restore, isPending, isError, error } = useCoverLetterRestoreMutation(jobId)

  const currentDate = new Date(sentAt).toLocaleDateString()

  // A failed restore must not look like a successful one. Without this the menu just closes and the
  // user walks away believing the letter reverted — then sends the wrong document. Inline, per the
  // UX spec's "all feedback is inline and contextual to the triggering element"; no toast.
  if (isError) {
    return (
      <span className="text-xs text-red-400" title={error?.message}>
        {error?.message || 'Restore failed'}
      </span>
    )
  }

  if (versions.length <= 1) {
    return <p className="text-xs text-zinc-600">{currentDate}</p>
  }

  // Newest first from the server, so the newest carries the highest version number.
  const total = versions.length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
      >
        v{total} · {currentDate}
        <ChevronDown size={11} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {versions.map((v, i) => {
          const versionNumber = total - i
          const isCurrent = i === 0
          return (
            <DropdownMenuItem
              key={v.id}
              disabled={isCurrent || isPending}
              onSelect={() => restore({ versionId: v.id })}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="text-zinc-300">
                v{versionNumber} <span className="text-zinc-600">{v.source}</span>
              </span>
              <span className="text-zinc-600">
                {isCurrent ? 'current' : new Date(v.createdAt).toLocaleDateString()}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
