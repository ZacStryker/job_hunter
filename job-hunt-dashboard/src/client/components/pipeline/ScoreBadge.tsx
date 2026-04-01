import type { Job } from '@shared/schemas'

interface ScoreBadgeProps {
  score: Job['fitScore']
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score === null) {
    return <span className="text-xs text-zinc-500">—</span>
  }

  const colorClass =
    score >= 75
      ? 'border-emerald-600 text-emerald-400'
      : score >= 50
        ? 'border-amber-500 text-amber-400'
        : 'border-red-700 text-red-500'

  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-6 text-xs font-semibold border rounded bg-transparent ${colorClass}`}
    >
      {score}
    </span>
  )
}
