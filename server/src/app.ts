import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Logger } from '@fohte/service-kit/logger'
import { captureWithFingerprint } from '@fohte/service-kit/observability'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import {
  type AuthMiddlewareDeps,
  type AuthMiddlewareEnvironment,
  createAuthMiddleware,
} from '#auth-middleware'
import type { ScoreIngestService } from '#score-ingest-service'
import type { ScoreReadApi } from '#score-read-api'
import { createUploadApi } from '#upload-api'

export interface AppDeps extends AuthMiddlewareDeps {
  scoreReadApi: ScoreReadApi
  logger: Logger
  scoreIngestService: ScoreIngestService
  authHandler: (request: Request) => Promise<Response>
  // A function rather than a `Sql` client directly: `AppType` below is
  // consumed cross-package for Hono RPC typing, and importing `#db` here
  // would drag its module graph into consumers that don't share this
  // package's `#*` subpath import.
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
  const app = new Hono<AuthMiddlewareEnvironment>()

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

  const healthRoute = app.get('/api/health', (c) =>
    c.json({ status: 'ok' } as const),
  )

  // Hono は先に登録した handler を優先するため、認証 endpoint を middleware より先に置く。
  app.all('/api/auth', (c) => deps.authHandler(c.req.raw))
  app.all('/api/auth/*', (c) => deps.authHandler(c.req.raw))
  app.use(
    '/api/scores/upload',
    cors({
      origin: 'https://p.eagate.573.jp',
      allowHeaders: ['x-api-key', 'content-type'],
      allowMethods: ['POST'],
    }),
  )
  app.use('/api/*', createAuthMiddleware(deps))
  const routes = healthRoute.route('/api', deps.scoreReadApi)

  const typedRoutes = routes.route(
    '/api/scores',
    createUploadApi(deps.scoreIngestService, deps.logger),
  )

  // Not part of the typed RPC surface: a plain readiness probe for
  // orchestrators, not an API endpoint consumed by the web client.
  app.get('/healthz', async (c) => {
    // eslint-disable-next-line no-restricted-syntax -- deps.checkDb() is a throw-based readiness probe, not a Result-returning call
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

  return typedRoutes
}

export type AppType = ReturnType<typeof createApp>
