import { createRootRoute, createRoute, createRouter, redirect, Outlet } from '@tanstack/react-router'
import { Layout } from '../components/shared/Layout'
import { DashboardRoute } from '../routes/dashboard'
import { PipelineRoute } from '../routes/index'
import { TrackerRoute } from '../routes/tracker'
import { ArchivedRoute } from '../routes/archived'
import { MessagesRoute } from '../routes/messages'
import { queryClient } from './query-client'
import { fetchJobs } from '../hooks/useJobsQuery'
import { fetchProfile } from '../hooks/useProfileQuery'
import { fetchPrompts } from '../hooks/usePromptsQuery'
import { MatchesRoute } from '../routes/matches'
import { fetchSearchConfigs } from '../hooks/useSearchConfigsQuery'
import { fetchSourceSettings } from '../hooks/useSourceSettingsQuery'
import { fetchSession } from '../hooks/useSessionQuery'
import { fetchOnboardingStatus } from '../hooks/useOnboardingStatusQuery'
import { LoginRoute } from '../routes/login'
import { RegisterRoute } from '../routes/register'
import { RegisterPendingRoute } from '../routes/register-pending'
import { OnboardingRoute } from '../routes/onboarding'
import { AdminUsersRoute } from '../routes/admin-users'
import { fetchAdminUsers } from '../hooks/useAdminUsersQuery'
import { fetchInviteKeys } from '../hooks/useInviteKeysQuery'
import { ConfigLayout } from '../routes/config/layout'
import { ConfigOverviewRoute } from '../routes/config/overview'
import { ConfigProfileIndexRoute } from '../routes/config/profile-index'
import { ConfigJobSourcesIndexRoute } from '../routes/config/job-sources-index'
import { ConfigPromptsIndexRoute } from '../routes/config/prompts-index'
import { ConfigLogsRoute } from '../routes/config/logs'
import { fetchWebhookRuns } from '../hooks/useWebhookRunsQuery'
import { ProfileResumeRoute } from '../routes/config/profile-resume'
import { ProfileApiKeysRoute } from '../routes/config/profile-api-keys'
import { ProfileInboxMappingRoute } from '../routes/config/profile-inbox-mapping'
import { fetchInboxMappings } from '../hooks/useInboxMappingsQuery'
import { JobSourcesAuthSetupRoute } from '../routes/config/job-sources-auth-setup'
import { JobSourcesSearchesRoute } from '../routes/config/job-sources-searches'
import { ConfigJobSourcesBlacklistRoute } from '../routes/config/job-sources-blacklist'
import { fetchBlacklist } from '../hooks/useBlacklistQuery'
import { PromptsAnalysisRoute } from '../routes/config/prompts-analysis'
import { PromptsCoverLetterRoute } from '../routes/config/prompts-cover-letter'
import { PromptsResumeRoute } from '../routes/config/prompts-resume'
import type { OnboardingStatusResponse, SessionResponse } from '@shared/schemas'

const rootRoute = createRootRoute({
  component: Outlet,
})

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_protected',
  component: Layout,
  beforeLoad: async () => {
    try {
      await queryClient.ensureQueryData({ queryKey: ['session'], queryFn: fetchSession, staleTime: 5 * 60 * 1000 })
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') throw redirect({ to: '/login' })
      throw err
    }
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRoute,
  beforeLoad: async () => {
    let res: Response
    try {
      res = await fetch('/auth/session')
    } catch {
      return
    }
    if (res.ok) throw redirect({ to: '/' })
    if (res.status !== 401) throw new Error(`Unexpected session response: ${res.status}`)
  },
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterRoute,
  beforeLoad: async () => {
    let res: Response
    try {
      res = await fetch('/auth/session')
    } catch {
      return
    }
    if (res.ok) throw redirect({ to: '/' })
    if (res.status !== 401) throw new Error(`Unexpected session response: ${res.status}`)
  },
})

const registerPendingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register/pending',
  component: RegisterPendingRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === 'string' ? search.email : '',
  }),
})

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingRoute,
  beforeLoad: async () => {
    let res: Response
    try {
      res = await fetch('/api/onboarding/status')
    } catch {
      throw redirect({ to: '/login' })
    }
    if (res.status === 401) throw redirect({ to: '/login' })
    if (!res.ok) throw new Error(`Unexpected onboarding status response: ${res.status}`)
    const status = await res.json() as OnboardingStatusResponse
    if (status.onboardingComplete) throw redirect({ to: '/' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/dashboard',
  component: DashboardRoute,
})

const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: PipelineRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
  ]),
})

const trackerRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/applications',
  component: TrackerRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
  ]),
})

const archivedRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/archive',
  component: ArchivedRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
  ]),
})

const messagesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/messages',
  component: MessagesRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const matchesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/matches',
  component: MatchesRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
  ]),
})

const configLayoutRoute = createRoute({
  getParentRoute: () => protectedRoute,
  id: '_config',
  component: ConfigLayout,
})

const configOverviewRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config',
  component: ConfigOverviewRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
    queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
    queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
  ]),
})

const configProfileRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile',
  component: ConfigProfileIndexRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
  ]),
})

const configProfileResumeRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/resume',
  component: ProfileResumeRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
})

const configProfileApiKeysRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/api-keys',
  component: ProfileApiKeysRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
})

const configProfileInboxMappingRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/inbox-mapping',
  component: ProfileInboxMappingRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
    queryClient.ensureQueryData({ queryKey: ['inbox-mappings'], queryFn: fetchInboxMappings }),
  ]),
})

const configJobSourcesRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources',
  component: ConfigJobSourcesIndexRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
    queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
  ]),
})

const configJobSourcesAuthSetupRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/auth-setup',
  component: JobSourcesAuthSetupRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
})

const configJobSourcesSearchesRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/searches',
  component: JobSourcesSearchesRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
    queryClient.ensureQueryData({ queryKey: ['source-settings'], queryFn: fetchSourceSettings }),
  ]),
})

const configJobSourcesBlacklistRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/blacklist',
  component: ConfigJobSourcesBlacklistRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
})

const configPromptsRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/prompts',
  component: ConfigPromptsIndexRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
})

const configPromptsAnalysisRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/prompts/analysis',
  component: PromptsAnalysisRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
})

const configPromptsCoverLetterRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/prompts/cover-letter',
  component: PromptsCoverLetterRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
})

const configPromptsResumeRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/prompts/resume',
  component: PromptsResumeRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
})

const configLogsRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/logs',
  component: ConfigLogsRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['webhook-runs'], queryFn: fetchWebhookRuns }),
})

const adminUsersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/admin/users',
  component: AdminUsersRoute,
  beforeLoad: () => {
    const session = queryClient.getQueryData<SessionResponse>(['session'])
    if (!session || session.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['admin-users'], queryFn: fetchAdminUsers }),
    queryClient.ensureQueryData({ queryKey: ['admin-invite-keys'], queryFn: fetchInviteKeys }).catch(() => []),
    queryClient.ensureQueryData({ queryKey: ['source-settings'], queryFn: fetchSourceSettings }),
  ]),
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  registerPendingRoute,
  onboardingRoute,
  protectedRoute.addChildren([
    dashboardRoute,
    indexRoute,
    trackerRoute,
    archivedRoute,
    messagesRoute,
    matchesRoute,
    adminUsersRoute,
    configLayoutRoute.addChildren([
      configOverviewRoute,
      configProfileRoute,
      configProfileResumeRoute,
      configProfileApiKeysRoute,
      configProfileInboxMappingRoute,
      configJobSourcesRoute,
      configJobSourcesAuthSetupRoute,
      configJobSourcesSearchesRoute,
      configJobSourcesBlacklistRoute,
      configPromptsRoute,
      configPromptsAnalysisRoute,
      configPromptsCoverLetterRoute,
      configPromptsResumeRoute,
      configLogsRoute,
    ]),
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
