import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from '../components/shared/Layout'
import { PipelineRoute } from '../routes/index'
import { TrackerRoute } from '../routes/tracker'
import { ArchivedRoute } from '../routes/archived'
import { MessagesRoute } from '../routes/messages'
import { HistoryRoute } from '../routes/history'
import { queryClient } from './query-client'
import { fetchJobs } from '../hooks/useJobsQuery'

const rootRoute = createRootRoute({
  component: Layout,
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

const routeTree = rootRoute.addChildren([indexRoute, trackerRoute, archivedRoute, messagesRoute, historyRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
