import { Outlet, Link } from '@tanstack/react-router'

export function ConfigLayout() {
  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-zinc-800 p-4 space-y-1">
        <Link
          to="/config/profile"
          activeOptions={{ exact: false }}
          className="block px-3 py-2 rounded text-sm transition-colors"
          activeProps={{ className: 'text-zinc-100 font-medium bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >
          Profile
        </Link>
        <Link
          to="/config/job-sources"
          activeOptions={{ exact: false }}
          className="block px-3 py-2 rounded text-sm transition-colors"
          activeProps={{ className: 'text-zinc-100 font-medium bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >
          Job Sources
        </Link>
        <Link
          to="/config/prompts"
          activeOptions={{ exact: false }}
          className="block px-3 py-2 rounded text-sm transition-colors"
          activeProps={{ className: 'text-zinc-100 font-medium bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >
          Prompts
        </Link>
        <Link
          to="/config/logs"
          activeOptions={{ exact: false }}
          className="block px-3 py-2 rounded text-sm transition-colors"
          activeProps={{ className: 'text-zinc-100 font-medium bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >
          Logs
        </Link>
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
