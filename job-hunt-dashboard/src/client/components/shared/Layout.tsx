import { Outlet, Link } from '@tanstack/react-router'
import { useSessionQuery } from '@/hooks/useSessionQuery'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner'
import { ActivityIndicator } from '@/components/shared/ActivityIndicator'
import { NotificationsDropdown } from '@/components/shared/NotificationsDropdown'
import { UserMenu } from '@/components/shared/UserMenu'
import { cn } from '@/lib/utils'

export function Layout() {
  const { data: session } = useSessionQuery()
  const { data: featureSettings } = useFeatureSettingsQuery()
  const isImpersonating = !!session?.impersonating
  const isAdmin = session?.role === 'admin'
  const emailFeatures = !!featureSettings?.emailFeatures

  return (
    <div className={cn('min-h-screen bg-zinc-950 text-zinc-100', isImpersonating && 'pt-10')}>
      <ImpersonationBanner />
      <header className="relative z-[60] h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4">
        {/* Logo + app name — left */}
        <div className="flex items-center gap-2 shrink-0">
          <img src="/hl-logo.png" alt="" className="h-7 w-7 shrink-0" />
          <span className="font-semibold text-zinc-100">HITLOBSTER</span>
        </div>

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

        {/* Right-side controls — activity, notifications, account */}
        <div className="flex items-center gap-1 shrink-0">
          <ActivityIndicator />
          <NotificationsDropdown />
          <UserMenu />
        </div>
      </header>

      <main className={isImpersonating ? 'h-[calc(100vh-96px)] overflow-auto' : 'h-[calc(100vh-56px)] overflow-auto'}>
        <Outlet />
      </main>
    </div>
  )
}
