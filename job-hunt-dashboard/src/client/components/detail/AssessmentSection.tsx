interface AssessmentSectionProps {
  label: string
  content: string | null
  // Fallback icon polarity for backfilled bullets that lack a +/~/- marker:
  // true → green ✓ (used by the *_met fields), false → red ✕ (used by the *_missed fields).
  defaultMet: boolean
}

type Marker = 'met' | 'partial' | 'missing'

const MARKER_ICON: Record<Marker, { glyph: string; className: string }> = {
  met: { glyph: '✓', className: 'text-emerald-500' },
  partial: { glyph: '○', className: 'text-amber-500' },
  missing: { glyph: '✕', className: 'text-red-400' },
}

function parseBullet(raw: string, defaultMet: boolean): { marker: Marker; text: string } {
  const lead = raw[0]
  if (lead === '+') return { marker: 'met', text: raw.slice(1).trim() }
  if (lead === '~') return { marker: 'partial', text: raw.slice(1).trim() }
  if (lead === '-') return { marker: 'missing', text: raw.slice(1).trim() }
  // Marker-less (backfilled data): default by field polarity.
  return { marker: defaultMet ? 'met' : 'missing', text: raw }
}

export function AssessmentSection({ label, content, defaultMet }: AssessmentSectionProps) {
  if (!content) return null
  const bullets = content
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseBullet(s, defaultMet))
    .filter((b) => b.text.length > 0)
  if (bullets.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <ul className="space-y-0.5">
        {bullets.map((b, i) => {
          const icon = MARKER_ICON[b.marker]
          return (
            <li key={`${i}-${b.text}`} className="flex gap-1.5 text-sm text-zinc-200 leading-relaxed">
              <span className={`${icon.className} shrink-0`}>{icon.glyph}</span>
              {b.text}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
