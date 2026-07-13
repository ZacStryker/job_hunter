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
import { DocumentsRoute } from '../routes/documents'
import { fetchSearchConfigs } from '../hooks/useSearchConfigsQuery'
import { fetchSourceSettings } from '../hooks/useSourceSettingsQuery'
import { fetchFeatureSettings } from '../hooks/useFeatureSettingsQuery'
import { fetchSession } from '../hooks/useSessionQuery'
import { fetchOnboardingStatus } from '../hooks/useOnboardingStatusQuery'
import { LoginRoute } from '../routes/login'
import { RegisterRoute } from '../routes/register'
import { TourRoute } from '../routes/tour'
import { PrivacyRoute } from '../routes/privacy'
import { RegisterPendingRoute } from '../routes/register-pending'
import { OnboardingRoute } from '../routes/onboarding'
import { AdminUsersRoute } from '../routes/admin-users'
import { fetchAdminUsers } from '../hooks/useAdminUsersQuery'
import { fetchInviteKeys } from '../hooks/useInviteKeysQuery'
import { ConfigLayout } from '../routes/config/layout'
import { ConfigOverviewRoute } from '../routes/config/overview'
import { ConfigProfileIndexRoute } from '../routes/config/profile-index'
import { ConfigSourcesIndexRoute } from '../routes/config/sources-index'
import { ConfigPromptsIndexRoute } from '../routes/config/prompts-index'
import { SystemLogsRoute } from '../routes/config/system-logs'
import { ConfigSystemIndexRoute } from '../routes/config/system-index'
import { fetchWebhookRuns } from '../hooks/useWebhookRunsQuery'
import { ProfileResumeRoute } from '../routes/config/profile-resume'
import { ConfigConnectionsIndexRoute } from '../routes/config/connections-index'
import { ConnectionsApiKeyRoute } from '../routes/config/connections-api-key'
import { ConnectionsInboxRoute } from '../routes/config/connections-inbox'
import { fetchInboxMappings } from '../hooks/useInboxMappingsQuery'
import { fetchGmailMappings } from '../hooks/useGmailMappingsQuery'
import { ConnectionsLinkedinRoute } from '../routes/config/connections-linkedin'
import { SourcesSearchesRoute } from '../routes/config/sources-searches'
import { SourcesBlacklistRoute } from '../routes/config/sources-blacklist'
import { fetchBlacklist } from '../hooks/useBlacklistQuery'
import { PromptsAnalysisRoute } from '../routes/config/prompts-analysis'
import { PromptsCoverLetterRoute } from '../routes/config/prompts-cover-letter'
import { PromptsResumeRoute } from '../routes/config/prompts-resume'
import type { OnboardingStatusResponse, SessionResponse, FeatureSettings } from '@shared/schemas'

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
    await queryClient
      .ensureQueryData({ queryKey: ['feature-settings'], queryFn: fetchFeatureSettings, staleTime: 5 * 60 * 1000 })
      .catch(() => {})
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

const tourRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tour',
  component: TourRoute,
})

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy-policy',
  component: PrivacyRoute,
})

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingRoute,
  beforeLoad: async () => {
    await queryClient
      .ensureQueryData({ queryKey: ['feature-settings'], queryFn: fetchFeatureSettings, staleTime: 5 * 60 * 1000 })
      .catch(() => {})
    let res: Response
    try {
      res = await fetch('/api/onboarding/status')
    } catch {
      throw redirect({ to: '/login' })
    }
    if (res.status === 401) throw redirect({ to: '/login' })
    if (!res.ok) throw new Error(`Unexpected onboarding status response: ${res.status}`)
    const status = await res.json() as OnboardingStatusResponse
    const returningFromGmail = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gmail')
    if (status.onboardingComplete && !returningFromGmail) throw redirect({ to: '/' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/dashboard',
  component: DashboardRoute,
})

// `?job=&tab=` is how the document editor reopens the drawer it was launched from — Back must land
// the user back on the Documents tab of that job, not on a bare list with the drawer closed.
// The keys must be OPTIONAL in the return type, not present-but-undefined: TanStack derives link
// requirements from this shape, and `{ job: number | undefined }` would make `search` mandatory on
// every existing <Link to="/matches"> in the app.
const validateJobDrawerSearch = (search: Record<string, unknown>): { job?: number; tab?: string } => {
  const out: { job?: number; tab?: string } = {}
  if (typeof search.job === 'number') out.job = search.job
  else if (typeof search.job === 'string' && /^\d+$/.test(search.job)) out.job = Number(search.job)
  if (typeof search.tab === 'string') out.tab = search.tab
  return out
}

const documentsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/documents/$jobId/$docType',
  component: DocumentsRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
  ]),
})

const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: PipelineRoute,
  validateSearch: validateJobDrawerSearch,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
  ]),
})

const trackerRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/applications',
  component: TrackerRoute,
  validateSearch: validateJobDrawerSearch,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
  ]),
})

const archivedRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/archive',
  component: ArchivedRoute,
  validateSearch: validateJobDrawerSearch,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
    queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
  ]),
})

const messagesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/messages',
  component: MessagesRoute,
  beforeLoad: () => {
    const flags = queryClient.getQueryData<FeatureSettings>(['feature-settings'])
    if (!flags?.emailFeatures) throw redirect({ to: '/' })
  },
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const matchesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/matches',
  component: MatchesRoute,
  validateSearch: validateJobDrawerSearch,
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

const configConnectionsRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/connections',
  component: ConfigConnectionsIndexRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
})

const configConnectionsLinkedinRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/connections/linkedin',
  component: ConnectionsLinkedinRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
})

const configConnectionsInboxRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/connections/inbox',
  component: ConnectionsInboxRoute,
  beforeLoad: () => {
    const flags = queryClient.getQueryData<FeatureSettings>(['feature-settings'])
    if (!flags?.emailFeatures) throw redirect({ to: '/' })
  },
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
    queryClient.ensureQueryData({ queryKey: ['inbox-mappings'], queryFn: fetchInboxMappings }),
    queryClient.ensureQueryData({ queryKey: ['gmail-mappings'], queryFn: fetchGmailMappings }),
  ]),
})

const configConnectionsApiKeyRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/connections/api-key',
  component: ConnectionsApiKeyRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
})

const configProfileApiKeysRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/api-keys',
  beforeLoad: () => { throw redirect({ to: '/config/connections/api-key' }) },
})

const configProfileInboxMappingRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/inbox-mapping',
  beforeLoad: () => { throw redirect({ to: '/config/connections/inbox' }) },
})

const configSourcesRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/sources',
  component: ConfigSourcesIndexRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
})

const configSourcesSearchesRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/sources/searches',
  component: SourcesSearchesRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
    queryClient.ensureQueryData({ queryKey: ['source-settings'], queryFn: fetchSourceSettings }),
  ]),
})

const configSourcesBlacklistRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/sources/blacklist',
  component: SourcesBlacklistRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
})

const configJobSourcesRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources',
  beforeLoad: () => { throw redirect({ to: '/config/sources' }) },
})

const configJobSourcesSearchesRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/searches',
  beforeLoad: () => { throw redirect({ to: '/config/sources/searches' }) },
})

const configJobSourcesBlacklistRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/blacklist',
  beforeLoad: () => { throw redirect({ to: '/config/sources/blacklist' }) },
})

const configJobSourcesAuthSetupRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/auth-setup',
  beforeLoad: () => { throw redirect({ to: '/config/connections/linkedin' }) },
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

const configSystemRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/system',
  component: ConfigSystemIndexRoute,
})

const configSystemLogsRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/system/logs',
  component: SystemLogsRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['webhook-runs'], queryFn: fetchWebhookRuns }),
})

const configLogsRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/logs',
  beforeLoad: () => { throw redirect({ to: '/config/system/logs' }) },
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
  tourRoute,
  privacyRoute,
  protectedRoute.addChildren([
    dashboardRoute,
    indexRoute,
    trackerRoute,
    archivedRoute,
    messagesRoute,
    matchesRoute,
    documentsRoute,
    adminUsersRoute,
    configLayoutRoute.addChildren([
      configOverviewRoute,
      configProfileRoute,
      configProfileResumeRoute,
      configConnectionsRoute,
      configConnectionsLinkedinRoute,
      configConnectionsInboxRoute,
      configConnectionsApiKeyRoute,
      configProfileApiKeysRedirectRoute,
      configProfileInboxMappingRedirectRoute,
      configJobSourcesAuthSetupRedirectRoute,
      configSourcesRoute,
      configSourcesSearchesRoute,
      configSourcesBlacklistRoute,
      configJobSourcesRedirectRoute,
      configJobSourcesSearchesRedirectRoute,
      configJobSourcesBlacklistRedirectRoute,
      configPromptsRoute,
      configPromptsAnalysisRoute,
      configPromptsCoverLetterRoute,
      configPromptsResumeRoute,
      configSystemRoute,
      configSystemLogsRoute,
      configLogsRedirectRoute,
    ]),
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
