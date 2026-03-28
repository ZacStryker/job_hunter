import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from '../components/shared/Layout'
import { PipelineRoute } from '../routes/index'
import { TrackerRoute } from '../routes/tracker'

const rootRoute = createRootRoute({
  component: Layout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PipelineRoute,
})

const trackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tracker',
  component: TrackerRoute,
})

const routeTree = rootRoute.addChildren([indexRoute, trackerRoute])

export const router = createRouter({ routeTree })

// Required for TypeScript inference throughout the app
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
