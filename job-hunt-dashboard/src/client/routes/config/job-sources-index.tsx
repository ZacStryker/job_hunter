import { Link } from '@tanstack/react-router'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useSearchConfigsQuery } from '@/hooks/useSearchConfigsQuery'

export function ConfigJobSourcesIndexRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const { data: searchConfigs = [] } = useSearchConfigsQuery()

  const authConfigured = status?.hasLinkedinAuth ?? false
  const searchesConfigured = searchConfigs.length > 0

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Job Sources</h1>
      <div className="grid grid-cols-2 gap-4">
        <Link to="/config/job-sources/auth-setup" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Auth Setup</span>
            {authConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>
        <Link to="/config/job-sources/searches" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Searches</span>
            {searchesConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>
      </div>
    </div>
  )
}
