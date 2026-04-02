interface AssessmentSectionProps {
  label: string
  content: string | null
}

export function AssessmentSection({ label, content }: AssessmentSectionProps) {
  if (!content) return null
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-zinc-200 leading-relaxed">{content}</p>
    </div>
  )
}
