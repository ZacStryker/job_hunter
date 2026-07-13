import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu'

// The version control shared by the cover letter and the resume. Generalized rather than forked: two
// version-dropdown UXs drifting apart is exactly the kind of thing that turns a spare ~340px column
// into a control panel.
//
// REPLACES the date in the Documents header; it does not sit beside it. The date was already a
// de-facto version stamp, so this costs zero new pixels — same size, same colour, now a trigger.
//
// "A control with nothing to say does not render": with one version there is no chevron and no menu,
// and this renders EXACTLY the plain date the column rendered before any of this existed.

export interface DocumentVersion {
  id: number
  source: 'generated' | 'edited'
  createdAt: string
}

interface Props {
  versions: DocumentVersion[]
  /** The timestamp the column already displayed — coverLetterSentAt / resumeGeneratedAt. */
  stampedAt: string
  isPending: boolean
  isError: boolean
  error?: Error | null
  onRestore: (versionId: number) => void
}

export function DocumentVersions({ versions, stampedAt, isPending, isError, error, onRestore }: Props) {
  const currentDate = new Date(stampedAt).toLocaleDateString()

  // A failed restore must not look like a successful one. Without this the menu just closes and the
  // user walks away believing the document reverted — then sends the wrong one. Inline, per the UX
  // spec's "all feedback is inline and contextual to the triggering element"; no toast.
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
              onSelect={() => onRestore(v.id)}
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
