import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from '../components/shared/Layout'
import { DashboardRoute } from '../routes/dashboard'
import { PipelineRoute } from '../routes/index'
import { TrackerRoute } from '../routes/tracker'
import { ArchivedRoute } from '../routes/archived'
import { MessagesRoute } from '../routes/messages'
import { HistoryRoute } from '../routes/history'
import { queryClient } from './query-client'
import { fetchJobs } from '../hooks/useJobsQuery'
import { ProfileRoute } from '../routes/profile'
import { fetchProfile } from '../hooks/useProfileQuery'
import { PromptsRoute } from '../routes/prompts'
import { fetchPrompts } from '../hooks/usePromptsQuery'
import { MatchesRoute } from '../routes/matches'

const rootRoute = createRootRoute({
  component: Layout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardRoute,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PipelineRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const trackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/applications',
  component: TrackerRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const archivedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/archive',
  component: ArchivedRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages',
  component: MessagesRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/logs',
  component: HistoryRoute,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfileRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
})

const promptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prompts',
  component: PromptsRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
})

const matchesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/matches',
  component: MatchesRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const routeTree = rootRoute.addChildren([dashboardRoute, indexRoute, trackerRoute, archivedRoute, messagesRoute, historyRoute, profileRoute, promptsRoute, matchesRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
