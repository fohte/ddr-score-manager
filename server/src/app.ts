import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Logger } from 'pino'

export interface AppDeps {
  logger: Logger
}

// Resolved from this file's own location (not CWD) so static assets are
// found regardless of which directory the server process is started from.
const STATIC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../public',
)

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

  app.onError((err, c) => {
    deps.logger.error(
      { err, method: c.req.method, path: c.req.path },
      'unhandled error',
    )
    return c.json({ error: 'Internal Server Error' }, 500)
  })

  const routes = app.get('/api/health', (c) =>
    c.json({ status: 'ok' } as const),
  )

  app.use('/*', serveStatic({ root: STATIC_ROOT }))
  app.all('/api/*', (c) => c.json({ error: 'Not Found' }, 404))
  app.get('*', serveStatic({ path: `${STATIC_ROOT}/index.html` }))

  return routes
}

export type AppType = ReturnType<typeof createApp>
