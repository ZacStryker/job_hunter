import type { Job } from '@shared/schemas'
import { scoreColor } from '../../utils/scoreColors'

interface ScoreBadgeProps {
  score: Job['fitScore']
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score === null) {
    return <span className="text-xs text-zinc-500">—</span>
  }

  const color = scoreColor(score)

  return (
    <span
      className="inline-flex items-center justify-center w-10 h-6 text-xs font-semibold border border-zinc-700 rounded bg-transparent"
      style={{ color }}
    >
      {score}
    </span>
  )
}
