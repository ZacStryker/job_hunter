import { Button } from '@/components/ui/button'

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
  </svg>
)

export function ConnectionTestButton({
  state,
  onTest,
  disabled,
}: {
  state: 'idle' | 'loading' | 'pass' | 'fail'
  onTest: () => void
  disabled?: boolean
}) {
  if (state === 'idle') return <Button onClick={onTest} disabled={disabled}>Test Connection</Button>
  if (state === 'loading') return <Button disabled><Spinner />Testing…</Button>
  if (state === 'pass') return <Button variant="outline" className="border-emerald-600 text-emerald-400" disabled>✓ Connected</Button>
  return <Button variant="outline" className="border-red-700 text-red-400" disabled>✗ Failed</Button>
}
