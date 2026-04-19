import { useState, useEffect } from 'react'
import { Outlet, Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Loader2 } from 'lucide-react'
import { useWebhookMutation } from '../../hooks/useWebhookMutation'

type ActiveAlert =
  | { kind: 'webhook-success'; label: string }
  | { kind: 'error'; label: string; message: string }
  | null

export function Layout() {
  const discoveryMutation = useWebhookMutation('/api/webhooks/discovery')
  const analysisMutation = useWebhookMutation('/api/webhooks/analysis')

  const [activeAlert, setActiveAlert] = useState<ActiveAlert>(null)

  useEffect(() => {
    if (discoveryMutation.isSuccess) {
      setActiveAlert({ kind: 'webhook-success', label: 'Discovery' })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [discoveryMutation.isSuccess])

  useEffect(() => {
    if (discoveryMutation.isError) {
      setActiveAlert({ kind: 'error', label: 'Discovery', message: discoveryMutation.error.message })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [discoveryMutation.isError])

  useEffect(() => {
    if (analysisMutation.isSuccess) {
      setActiveAlert({ kind: 'webhook-success', label: 'Analysis' })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [analysisMutation.isSuccess])

  useEffect(() => {
    if (analysisMutation.isError) {
      setActiveAlert({ kind: 'error', label: 'Analysis', message: analysisMutation.error.message })
      const t = setTimeout(() => setActiveAlert(null), 4000)
      return () => clearTimeout(t)
    }
  }, [analysisMutation.isError])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4">
        {/* App name — left */}
        <span className="font-semibold text-zinc-100 shrink-0">Job Hunt</span>

        {/* View tabs — center */}
        <nav className="flex-1 flex justify-center gap-1">
          <Link
            to="/dashboard"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Dashboard
          </Link>
          <Link
            to="/"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Jobs
          </Link>
          <Link
            to="/matches"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Matches
          </Link>
          <Link
            to="/applications"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Applications
          </Link>
          <Link
            to="/messages"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Messages
          </Link>
          <Link
            to="/archive"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Archive
          </Link>
          <Link
            to="/config"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Config
          </Link>
        </nav>

        {/* Action buttons — right */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={discoveryMutation.isPending || analysisMutation.isPending}
            onClick={() => discoveryMutation.mutate()}
          >
            {discoveryMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Discovery…
              </>
            ) : (
              'Discovery'
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={analysisMutation.isPending || discoveryMutation.isPending}
            onClick={() => analysisMutation.mutate()}
          >
            {analysisMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analysis…
              </>
            ) : (
              'Analysis'
            )}
          </Button>
        </div>
      </header>

      {activeAlert && (
        <div className="px-4 py-2">
          {activeAlert.kind === 'webhook-success' && (
            <Alert>
              <AlertTitle>{activeAlert.label} triggered</AlertTitle>
              <AlertDescription>Workflow started successfully.</AlertDescription>
            </Alert>
          )}
          {activeAlert.kind === 'error' && (
            <Alert variant="destructive">
              <AlertTitle>{activeAlert.label} failed</AlertTitle>
              <AlertDescription>
                {activeAlert.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <main className="h-[calc(100vh-56px)] overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
