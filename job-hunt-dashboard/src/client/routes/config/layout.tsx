import { Outlet, Link, type LinkProps } from '@tanstack/react-router'
import type { SetupTask, SetupTaskId } from '@shared/schemas'
import { ConfigBreadcrumb } from '@/components/config/ConfigBreadcrumb'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'
import { useSetupStatus } from '@/hooks/useSetupStatus'

const headerBaseClass =
  'block px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors rounded'
const headerActiveProps = { className: 'text-zinc-100 bg-zinc-800' }
const headerInactiveProps = { className: 'text-zinc-400 hover:text-zinc-200' }

const childLinkClass = 'block pl-7 py-1.5 text-xs rounded transition-colors'
const childActiveProps = { className: 'text-zinc-100 bg-zinc-800 font-medium' }
const childInactiveProps = { className: 'text-zinc-500 hover:text-zinc-300' }

type ToPath = LinkProps['to']
type ChildLink = { label: string; to: ToPath; requiresEmail?: boolean }
export type Section = { label: string; to?: ToPath; links: ChildLink[] }

export function taskNeedsAttention(t: SetupTask): boolean {
  if (t.dismissed) return false
  return t.state === 'broken' || (t.tier === 'required' && t.state !== 'complete')
}

const NAV_TASK_IDS: Partial<Record<string, SetupTaskId[]>> = {
  '/config/profile/resume': ['profile'],
  '/config/connections/linkedin': ['linkedin'],
  '/config/connections/inbox': ['inboxConnect', 'inboxMapping'],
  '/config/connections/api-key': ['apiKey'],
}

export function childNeedsAttention(to: ToPath, tasks: SetupTask[]): boolean {
  const ids = NAV_TASK_IDS[String(to)]
  if (!ids) return false
  return ids.some((id) => {
    const task = tasks.find((t) => t.id === id)
    return !!task && taskNeedsAttention(task)
  })
}

export function sectionNeedsAttention(section: Section, tasks: SetupTask[], emailFeatures: boolean): boolean {
  return section.links.some((link) => {
    if (link.requiresEmail && !emailFeatures) return false
    return childNeedsAttention(link.to, tasks)
  })
}

const attentionDotClass = 'ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500'

export const SECTIONS: Section[] = [
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
  const { tasks } = useSetupStatus()
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
                <span className="flex items-center">
                  {section.label}
                  {sectionNeedsAttention(section, tasks, emailFeatures) && (
                    <span className={attentionDotClass} aria-hidden />
                  )}
                </span>
              </Link>
            ) : (
              <div className={`${headerBaseClass} text-zinc-400`}>
                <span className="flex items-center">
                  {section.label}
                  {sectionNeedsAttention(section, tasks, emailFeatures) && (
                    <span className={attentionDotClass} aria-hidden />
                  )}
                </span>
              </div>
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
                  <span className="flex items-center">
                    {link.label}
                    {childNeedsAttention(link.to, tasks) && (
                      <span className={attentionDotClass} aria-hidden />
                    )}
                  </span>
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
