import type { Job } from '@shared/schemas'

interface ActionChipProps {
  recommendation: Job['recommendation']
}

const CHIP_STYLES: Record<'apply' | 'investigate' | 'skip', string> = {
  apply: 'bg-blue-950 text-blue-300',
  investigate: 'bg-amber-950 text-amber-300',
  skip: 'bg-zinc-800 text-zinc-400',
}

export function ActionChip({ recommendation }: ActionChipProps) {
  if (recommendation === null) {
    return <span className="text-xs text-zinc-500">—</span>
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${CHIP_STYLES[recommendation]}`}
    >
      {recommendation}
    </span>
  )
}
