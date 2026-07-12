import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Logger } from 'pino'

export interface AppDeps {
  logger: Logger
}

const STATIC_ROOT = './public'

export const createApp = (deps: AppDeps) => {
  const app = new Hono()

  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    deps.logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        responseTimeMs: Date.now() - start,
      },
      'request',
    )
  })

  const routes = app.get('/api/health', (c) =>
    c.json({ status: 'ok' } as const),
  )

  app.use('/*', serveStatic({ root: STATIC_ROOT }))
  app.get('*', serveStatic({ path: `${STATIC_ROOT}/index.html` }))

  return routes
}

export type AppType = ReturnType<typeof createApp>
