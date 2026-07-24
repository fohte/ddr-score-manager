import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { captureWithFingerprint } from '@fohte/service-kit/observability'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Logger } from 'pino'

export interface AppDeps {
  logger: Logger
  // A function rather than a `Sql` client directly: `AppType` below is
  // consumed cross-package for Hono RPC typing, and importing `@/db` here
  // would drag its module graph into consumers that don't share this
  // package's `@/*` path alias.
  checkDb: () => Promise<void>
}

// Resolved from this file's own location (not CWD) so static assets are
// found regardless of which directory the server process is started from.
const STATIC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../public',
)

const UNHANDLED_ERROR_FINGERPRINT = 'app.hono.unhandled-error'

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
    captureWithFingerprint(err, UNHANDLED_ERROR_FINGERPRINT, {
      extras: { method: c.req.method, path: c.req.path },
    })
    return c.json({ error: 'Internal Server Error' }, 500)
  })

  const routes = app.get('/api/health', (c) =>
    c.json({ status: 'ok' } as const),
  )

  // Not part of the typed RPC surface: a plain readiness probe for
  // orchestrators, not an API endpoint consumed by the web client.
  app.get('/healthz', async (c) => {
    try {
      await deps.checkDb()
      return c.json({ status: 'ok' } as const)
    } catch (err) {
      deps.logger.error({ err }, 'database ping failed')
      return c.json({ status: 'error' } as const, 503)
    }
  })

  app.use('/*', serveStatic({ root: STATIC_ROOT }))
  app.all('/api/*', (c) => c.json({ error: 'Not Found' }, 404))
  app.get('*', serveStatic({ path: `${STATIC_ROOT}/index.html` }))

  return routes
}

export type AppType = ReturnType<typeof createApp>
