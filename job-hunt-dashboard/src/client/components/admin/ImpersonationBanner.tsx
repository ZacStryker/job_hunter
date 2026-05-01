import { useNavigate } from '@tanstack/react-router'
import { useSessionQuery } from '@/hooks/useSessionQuery'
import { useImpersonateExitMutation } from '@/hooks/useImpersonateExitMutation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function ImpersonationBanner() {
  const { data: session } = useSessionQuery()
  const navigate = useNavigate()
  const exitMutation = useImpersonateExitMutation()

  if (!session?.impersonating) return null

  const displayName = session.impersonating.name ?? session.impersonating.email

  async function handleExit() {
    try {
      await exitMutation.mutateAsync()
      navigate({ to: '/admin/users' })
    } catch {
      toast.error('Failed to exit impersonation')
    }
  }

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-50 h-10 bg-amber-900/80 border-b border-amber-700 flex items-center justify-between px-4 gap-4"
    >
      <span className="text-sm text-amber-200 truncate flex-1">
        Impersonating {displayName}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExit}
        disabled={exitMutation.isPending}
        className="border-amber-700 text-amber-300 text-xs hover:bg-amber-900 hover:text-amber-200 h-7 shrink-0"
      >
        Exit
      </Button>
    </div>
  )
}
