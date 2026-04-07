import { useState, useEffect } from 'react'
import { Outlet, Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { SyncButton } from './SyncButton'
import { useSyncMutation } from '../../hooks/useSyncMutation'

export function Layout() {
  const syncMutation = useSyncMutation()
  const [alertDismissed, setAlertDismissed] = useState(false)

  useEffect(() => {
    if (syncMutation.isPending) setAlertDismissed(false)
  }, [syncMutation.isPending])

  useEffect(() => {
    if (syncMutation.isSuccess && !alertDismissed) {
      const t = setTimeout(() => setAlertDismissed(true), 4000)
      return () => clearTimeout(t)
    }
  }, [syncMutation.isSuccess, alertDismissed])

  const showAlert = !alertDismissed && !syncMutation.isPending && (syncMutation.isSuccess || syncMutation.isError)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4">
        {/* App name — left */}
        <span className="font-semibold text-zinc-100 shrink-0">Job Hunt</span>

        {/* View tabs — center */}
        <nav className="flex-1 flex justify-center gap-1">
          <Link
            to="/"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Pipeline
          </Link>
          <Link
            to="/tracker"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Tracker
          </Link>
          <Link
            to="/archived"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Archived
          </Link>
        </nav>

        {/* Sync button — right */}
        <SyncButton onSync={() => syncMutation.mutate()} isPending={syncMutation.isPending} />
      </header>

      {showAlert && (
        <div className="px-4 py-2">
          {syncMutation.isSuccess && (
            <Alert>
              <AlertTitle>Sync complete</AlertTitle>
              <AlertDescription>
                {syncMutation.data.added} records added, {syncMutation.data.updated} updated
              </AlertDescription>
            </Alert>
          )}
          {syncMutation.isError && (
            <Alert variant="destructive">
              <AlertTitle>Sync failed</AlertTitle>
              <AlertDescription>
                {syncMutation.error.message} — No data was modified.
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
