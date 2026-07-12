import { serve } from '@hono/node-server'

import { createApp } from '@/app'
import { loadEnv } from '@/env'
import { createLogger } from '@/logger'

export const main = (): void => {
  const env = loadEnv()
  const logger = createLogger(env.LOG_LEVEL)
  const app = createApp({ logger })

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port }, 'server listening')
  })
}
