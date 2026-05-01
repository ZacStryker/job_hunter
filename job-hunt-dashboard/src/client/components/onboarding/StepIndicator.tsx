export function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <ol
      role="list"
      aria-label={`Onboarding progress: step ${currentStep + 1} of ${totalSteps}`}
      className="flex gap-2"
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const color = i < currentStep ? 'bg-emerald-500' : i === currentStep ? 'bg-blue-500' : 'bg-zinc-700'
        const label = i < currentStep ? `Step ${i + 1}: complete` : i === currentStep ? `Step ${i + 1}: current` : `Step ${i + 1}: upcoming`
        return (
          <li key={i} role="listitem" className={`w-3 h-3 rounded-full ${color}`}>
            <span className="sr-only">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
