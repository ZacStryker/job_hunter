import { Outlet, Link, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useSessionQuery } from '@/hooks/useSessionQuery'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner'
import { queryClient } from '@/lib/query-client'
import { cn } from '@/lib/utils'

export function Layout() {
  const { data: session } = useSessionQuery()
  const { data: featureSettings } = useFeatureSettingsQuery()
  const navigate = useNavigate()
  const isImpersonating = !!session?.impersonating
  const isAdmin = session?.role === 'admin'
  const emailFeatures = !!featureSettings?.emailFeatures

  async function handleLogout() {
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } catch {
      // sign out locally regardless of network/server error
    }
    queryClient.clear()
    await navigate({ to: '/login' })
  }

  return (
    <div className={cn('min-h-screen bg-zinc-950 text-zinc-100', isImpersonating && 'pt-10')}>
      <ImpersonationBanner />
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4">
        {/* App name — left */}
        <span className="font-semibold text-zinc-100 shrink-0">HITLOBSTER</span>

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
          {emailFeatures && (
            <Link
              to="/messages"
              className="px-3 py-1.5 text-sm transition-colors"
              activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
              inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
            >
              Messages
            </Link>
          )}
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
            activeOptions={{ exact: false }}
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Config
          </Link>
          {isAdmin && (
            <Link
              to="/admin/users"
              className="px-3 py-1.5 text-sm transition-colors"
              activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
              inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
            >
              Admin
            </Link>
          )}
        </nav>

        {/* Logout — right */}
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
          className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className={isImpersonating ? 'h-[calc(100vh-96px)] overflow-auto' : 'h-[calc(100vh-56px)] overflow-auto'}>
        <Outlet />
      </main>
    </div>
  )
}
