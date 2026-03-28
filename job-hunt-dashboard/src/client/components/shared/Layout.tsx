import { Outlet, Link } from '@tanstack/react-router'
import { Button } from '../ui/button'

export function Layout() {
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
        </nav>

        {/* Sync button placeholder — right (wired in Story 2.3) */}
        <Button variant="outline" size="sm" disabled className="shrink-0">
          Sync
        </Button>
      </header>

      <main className="h-[calc(100vh-56px)] overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
