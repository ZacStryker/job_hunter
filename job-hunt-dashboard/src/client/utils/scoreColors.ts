// Shared 10-step score gradient — used by the dashboard Score Breakdown bars
// and the ScoreBadge chips so they stay visually consistent.
export const SCORE_COLORS = [
  '#ef4444',
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#facc15',
  '#a3e635',
  '#4ade80',
  '#34d399',
  '#22d3ee',
  '#60a5fa',
]

const FALLBACK = '#a1a1aa'

export function scoreColor(score: number): string {
  return SCORE_COLORS[Math.min(Math.floor(score / 10), 9)] ?? FALLBACK
}
