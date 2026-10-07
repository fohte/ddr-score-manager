import { createLogger } from '@fohte/service-kit/logger'
import { serve } from '@hono/node-server'
import * as Sentry from '@sentry/node'
import { eq } from 'drizzle-orm'

import { createApp } from '#app'
import { auth } from '#auth'
import { observability } from '#bootstrap'
import { createDb, createSql, pingDb } from '#db/index'
import { apikey } from '#db/schema/index'
import { loadEnv } from '#env'

export const main = (): void => {
  const env = loadEnv()
  const logger = createLogger({ level: env.LOG_LEVEL })
  const sql = createSql(env.DATABASE_URL)
  const db = createDb(sql)
  const app = createApp({
    allowedEmails: process.env['AUTH_ALLOWED_EMAILS'],
    authHandler: auth.handler,
    checkDb: () => pingDb(sql),
    getApiKeyPermissions: async (apiKeyId) => {
      const [apiKey] = await db
        .select({ permissions: apikey.permissions })
        .from(apikey)
        .where(eq(apikey.id, apiKeyId))
        .limit(1)
      return apiKey?.permissions ?? null
    },
    getSession: (headers) => auth.api.getSession({ headers }),
    logger,
  })

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
