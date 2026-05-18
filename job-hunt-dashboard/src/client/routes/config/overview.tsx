import { Link } from '@tanstack/react-router'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useProfileQuery } from '@/hooks/useProfileQuery'
import { useSearchConfigsQuery } from '@/hooks/useSearchConfigsQuery'
import { usePromptsQuery } from '@/hooks/usePromptsQuery'

export function ConfigOverviewRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const { data: profile } = useProfileQuery()
  const { data: searchConfigs = [] } = useSearchConfigsQuery()
  const { data: prompts = [] } = usePromptsQuery()

  const profileConfigured = !!(status?.hasAnthropicKey && profile?.name && status?.hasImap)
  const jobSourcesConfigured = !!(status?.hasLinkedinAuth && searchConfigs.length > 0)
  const promptsEdited = prompts.some(p => p.isCustom)

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Config</h1>
      <div className="grid grid-cols-2 gap-6">
        <Link to="/config/profile" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Profile</span>
            {profileConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>

        <Link to="/config/job-sources" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Job Sources</span>
            {jobSourcesConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>

        <Link to="/config/prompts" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Prompts</span>
            {promptsEdited
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Edited</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
            }
          </div>
        </Link>

        <Link to="/config/logs" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Logs</span>
            <span className="text-xs text-zinc-500">View logs →</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
