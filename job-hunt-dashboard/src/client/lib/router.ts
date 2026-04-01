import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from '../components/shared/Layout'
import { PipelineRoute } from '../routes/index'
import { TrackerRoute } from '../routes/tracker'
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
  path: '/tracker',
  component: TrackerRoute,
})

const routeTree = rootRoute.addChildren([indexRoute, trackerRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
