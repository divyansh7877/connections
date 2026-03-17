import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexProvider } from 'convex/react'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const convexUrl = (import.meta as ImportMeta & { env: { VITE_CONVEX_URL?: string } }).env.VITE_CONVEX_URL
  if (!convexUrl) {
    console.error('Missing VITE_CONVEX_URL environment variable.')
  }

  const convexQueryClient = new ConvexQueryClient(convexUrl || 'https://placeholder.convex.cloud')

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        gcTime: 5000,
      },
    },
  })
  convexQueryClient.connect(queryClient)

  return routerWithQueryClient(
    createRouter({
      routeTree,
      defaultPreload: 'intent',
      context: { queryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
      defaultErrorComponent: ({ error }) => (
        <main className="page-shell">
          <section className="panel panel-main">
            <p className="error-banner">{error.message}</p>
          </section>
        </main>
      ),
      defaultNotFoundComponent: () => (
        <main className="page-shell">
          <section className="panel panel-main">
            <p className="error-banner">Route not found.</p>
          </section>
        </main>
      ),
      Wrap: ({ children }) => (
        <ConvexProvider client={convexQueryClient.convexClient}>{children}</ConvexProvider>
      ),
    }),
    queryClient,
  )
}
