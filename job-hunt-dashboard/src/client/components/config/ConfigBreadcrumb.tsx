import { useRouterState, Link } from '@tanstack/react-router'

const PATH_LABELS: Record<string, string> = {
  '/config': 'Config',
  '/config/profile': 'Profile',
  '/config/profile/resume': 'Candidate Info',
  '/config/connections': 'Connections',
  '/config/connections/linkedin': 'LinkedIn',
  '/config/connections/inbox': 'Inbox',
  '/config/connections/api-key': 'API Key',
  '/config/sources': 'Sources',
  '/config/sources/searches': 'Searches',
  '/config/sources/blacklist': 'Blacklist',
  '/config/prompts': 'Prompts',
  '/config/prompts/analysis': 'Analyze Jobs',
  '/config/prompts/cover-letter': 'Generate Cover Letter',
  '/config/prompts/resume': 'Generate Resume',
  '/config/system': 'System',
  '/config/system/logs': 'Logs',
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
