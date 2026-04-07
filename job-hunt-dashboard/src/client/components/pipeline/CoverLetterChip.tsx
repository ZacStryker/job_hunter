interface CoverLetterChipProps {
  sentAt: string | null
}

export function CoverLetterChip({ sentAt }: CoverLetterChipProps) {
  if (!sentAt)
    return <span className="text-zinc-500">—</span>
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-400">
      CL Sent
    </span>
  )
}
