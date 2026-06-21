import { Outlet, Link } from '@tanstack/react-router'
import { ConfigBreadcrumb } from '@/components/config/ConfigBreadcrumb'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'

const childLinkClass = 'block pl-7 py-1.5 text-xs rounded transition-colors'
const childActiveProps = { className: 'text-zinc-100 bg-zinc-800 font-medium' }
const childInactiveProps = { className: 'text-zinc-500 hover:text-zinc-300' }

export function ConfigLayout() {
  const { data: featureSettings } = useFeatureSettingsQuery()
  const emailFeatures = !!featureSettings?.emailFeatures
  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-zinc-800 p-4">
        {/* Profile */}
        <Link
          to="/config/profile"
          activeOptions={{ exact: true }}
          className="block px-3 py-1.5 mt-1 text-xs font-semibold uppercase tracking-wide transition-colors rounded"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >
          Profile
        </Link>
        <Link to="/config/profile/resume" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >Candidate Info</Link>
        <Link to="/config/profile/api-keys" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >API Keys</Link>
        {emailFeatures && (
          <Link to="/config/profile/inbox-mapping" activeOptions={{ exact: true }}
            className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
          >Inbox Mapping</Link>
        )}
        <Link to="/privacy-policy" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >Privacy Policy</Link>

        {/* Job Sources */}
        <Link to="/config/job-sources" activeOptions={{ exact: true }}
          className="block px-3 py-1.5 mt-3 text-xs font-semibold uppercase tracking-wide transition-colors rounded"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >Job Sources</Link>
        <Link to="/config/job-sources/auth-setup" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >Auth Setup</Link>
        <Link to="/config/job-sources/searches" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >Searches</Link>

        {/* Prompts */}
        <Link to="/config/prompts" activeOptions={{ exact: true }}
          className="block px-3 py-1.5 mt-3 text-xs font-semibold uppercase tracking-wide transition-colors rounded"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >Prompts</Link>
        <Link to="/config/prompts/analysis" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >Analyze Jobs</Link>
        <Link to="/config/prompts/cover-letter" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >Generate Cover Letter</Link>
        <Link to="/config/prompts/resume" activeOptions={{ exact: true }}
          className={childLinkClass} activeProps={childActiveProps} inactiveProps={childInactiveProps}
        >Generate Resume</Link>

        {/* Logs */}
        <Link to="/config/logs" activeOptions={{ exact: true }}
          className="block px-3 py-1.5 mt-2 text-xs font-semibold uppercase tracking-wide transition-colors rounded"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >Logs</Link>
      </nav>

      <main className="flex-1 overflow-auto">
        <ConfigBreadcrumb />
        <Outlet />
      </main>
    </div>
  )
}
