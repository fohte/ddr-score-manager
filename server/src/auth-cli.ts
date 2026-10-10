import { createLogger } from '@fohte/service-kit/logger'

import { createAuth } from '#auth'
import { createDb, createSql } from '#db/index'
import { PLACEHOLDER_DATABASE_URL } from '#db/placeholder'

const databaseUrl = process.env['DATABASE_URL'] ?? PLACEHOLDER_DATABASE_URL

export const auth = createAuth({
  db: createDb(createSql(databaseUrl)),
  googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  googleClientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
  allowedEmails: process.env['AUTH_ALLOWED_EMAILS'],
  logger: createLogger({ level: 'info' }),
})
