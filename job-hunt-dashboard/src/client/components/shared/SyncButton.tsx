import { Button } from '../ui/button'
import { Loader2 } from 'lucide-react'

interface SyncButtonProps {
  onSync: () => void
  isPending: boolean
}

export function SyncButton({ onSync, isPending }: SyncButtonProps) {
  return (
    <Button variant="outline" size="sm" onClick={isPending ? undefined : onSync} disabled={isPending}>
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Syncing…
        </>
      ) : (
        'Sync'
      )}
    </Button>
  )
}
