import { Outlet, Link, type LinkProps } from '@tanstack/react-router'
import { ConfigBreadcrumb } from '@/components/config/ConfigBreadcrumb'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'

const headerBaseClass =
  'block px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors rounded'
const headerActiveProps = { className: 'text-zinc-100 bg-zinc-800' }
const headerInactiveProps = { className: 'text-zinc-400 hover:text-zinc-200' }

const childLinkClass = 'block pl-7 py-1.5 text-xs rounded transition-colors'
const childActiveProps = { className: 'text-zinc-100 bg-zinc-800 font-medium' }
const childInactiveProps = { className: 'text-zinc-500 hover:text-zinc-300' }

type ToPath = LinkProps['to']
type ChildLink = { label: string; to: ToPath; requiresEmail?: boolean }
type Section = { label: string; to?: ToPath; links: ChildLink[] }

const SECTIONS: Section[] = [
  {
    label: 'Profile',
    to: '/config/profile',
    links: [{ label: 'Candidate Info', to: '/config/profile/resume' }],
  },
  {
    label: 'Sources',
    to: '/config/sources',
    links: [
      { label: 'Searches', to: '/config/sources/searches' },
      { label: 'Blacklist', to: '/config/sources/blacklist' },
    ],
  },
  {
    label: 'Connections',
    to: '/config/connections',
    links: [
      { label: 'LinkedIn', to: '/config/connections/linkedin' },
      { label: 'Inbox', to: '/config/connections/inbox', requiresEmail: true },
      { label: 'API Key', to: '/config/connections/api-key' },
    ],
  },
  {
    label: 'Prompts',
    to: '/config/prompts',
    links: [
      { label: 'Analyze Jobs', to: '/config/prompts/analysis' },
      { label: 'Generate Cover Letter', to: '/config/prompts/cover-letter' },
      { label: 'Generate Resume', to: '/config/prompts/resume' },
    ],
  },
  {
    label: 'System',
    to: '/config/system',
    links: [
      { label: 'Logs', to: '/config/system/logs' },
      { label: 'Privacy', to: '/privacy-policy' },
    ],
  },
]

export function ConfigLayout() {
  const { data: featureSettings } = useFeatureSettingsQuery()
  const emailFeatures = !!featureSettings?.emailFeatures
  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-zinc-800 p-4">
        {SECTIONS.map((section, index) => (
          <div key={section.label} className={index === 0 ? '' : 'mt-3'}>
            {section.to ? (
              <Link
                to={section.to}
                className={headerBaseClass}
                activeProps={headerActiveProps}
                inactiveProps={headerInactiveProps}
              >
                {section.label}
              </Link>
            ) : (
              <div className={`${headerBaseClass} text-zinc-400`}>{section.label}</div>
            )}
            {section.links.map((link) =>
              link.requiresEmail && !emailFeatures ? null : (
                <Link
                  key={link.to}
                  to={link.to}
                  activeOptions={{ exact: true }}
                  className={childLinkClass}
                  activeProps={childActiveProps}
                  inactiveProps={childInactiveProps}
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </nav>

      <main className="flex-1 overflow-auto">
        <ConfigBreadcrumb />
        <Outlet />
      </main>
    </div>
  )
}
