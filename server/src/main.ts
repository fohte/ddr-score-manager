import { serve } from '@hono/node-server'

import { createApp } from '@/app'
import { createSql, pingDb } from '@/db'
import { loadEnv } from '@/env'
import { createLogger } from '@/logger'

export const main = (): void => {
  const env = loadEnv()
  const logger = createLogger(env.LOG_LEVEL)
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
    process.exit(1)
  })
}
