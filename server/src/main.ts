import { createLogger } from '@fohte/service-kit/logger'
import { serve } from '@hono/node-server'
import * as Sentry from '@sentry/node'

import { createApp } from '#app'
import { observability } from '#bootstrap'
import { createSql, pingDb } from '#db/index'
import { loadEnv } from '#env'

export const main = (): void => {
  const env = loadEnv()
  const logger = createLogger({ level: env.LOG_LEVEL })
  const sql = createSql(env.DATABASE_URL)
  const app = createApp({ logger, checkDb: () => pingDb(sql) })

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port }, 'server listening')
  })

  // listen() failures (e.g. EADDRINUSE) surface asynchronously after main()
  // has already returned, so the synchronous try/catch around main() in
  // index.ts can't catch them — they'd otherwise crash as an unhandled
  // exception instead of going through the same error-logging exit path.
  server.on('error', (err) => {
    logger.fatal({ err }, 'failed to start server')
    Sentry.captureException(err)
    // observability may be undefined (not configured), so resolve through
    // Promise.resolve() rather than optional-chaining .finally() off it —
    // otherwise an undefined observability would skip process.exit(1) entirely.
    void Promise.resolve(observability?.shutdown()).finally(() =>
      process.exit(1),
    )
  })
}
