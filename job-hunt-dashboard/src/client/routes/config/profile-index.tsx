import { Link } from '@tanstack/react-router'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useProfileQuery } from '@/hooks/useProfileQuery'

export function ConfigProfileIndexRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const { data: profile } = useProfileQuery()

  const resumeConfigured = !!profile?.name
  const apiKeysConfigured = !!status?.hasAnthropicKey
  const inboxConfigured = !!status?.hasImap

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Profile</h1>
      <div className="grid grid-cols-2 gap-6">
        <Link to="/config/profile/resume" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Resume</span>
            {resumeConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>

        <Link to="/config/profile/api-keys" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">API Keys</span>
            {apiKeysConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>

        <Link to="/config/profile/inbox-mapping" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Inbox Mapping</span>
            {inboxConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>
      </div>
    </div>
  )
}
