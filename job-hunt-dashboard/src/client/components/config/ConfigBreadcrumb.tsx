import { useRouterState, Link } from '@tanstack/react-router'

const PATH_LABELS: Record<string, string> = {
  '/config': 'Config',
  '/config/profile': 'Profile',
  '/config/profile/resume': 'Candidate Info',
  '/config/profile/api-keys': 'API Keys',
  '/config/profile/inbox-mapping': 'Inbox Mapping',
  '/config/job-sources': 'Job Sources',
  '/config/job-sources/auth-setup': 'Auth Setup',
  '/config/job-sources/searches': 'Searches',
  '/config/job-sources/blacklist': 'Blacklist',
  '/config/prompts': 'Prompts',
  '/config/prompts/analysis': 'Analyze Jobs',
  '/config/prompts/cover-letter': 'Generate Cover Letter',
  '/config/prompts/resume': 'Generate Resume',
  '/config/logs': 'Logs',
}

export function ConfigBreadcrumb() {
  const pathname = useRouterState({ select: s => s.location.pathname })

  if (pathname === '/config') return null

  const segments = pathname.split('/').filter(Boolean)
  const prefixes = segments.map((_, i) => '/' + segments.slice(0, i + 1).join('/'))

  return (
    <div className="px-6 pt-3 pb-2 border-b border-zinc-800/60">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-zinc-500">
        {prefixes.map((prefix, i) => {
          const label = PATH_LABELS[prefix] ?? prefix
          const isLast = i === prefixes.length - 1
          return (
            <span key={prefix} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-700">/</span>}
              {isLast ? (
                <span aria-current="page" className="text-zinc-400">{label}</span>
              ) : (
                <Link to={prefix} className="hover:text-zinc-300 transition-colors">
                  {label}
                </Link>
              )}
            </span>
          )
        })}
      </nav>
    </div>
  )
}
