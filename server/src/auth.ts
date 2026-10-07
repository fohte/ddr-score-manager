import { createLogger } from '@fohte/service-kit/logger'
import { type Auth, betterAuth } from 'better-auth'
import { drizzle } from 'drizzle-orm/postgres-js'

import { buildAuthOptions } from '#auth-options'
import { createSql, PLACEHOLDER_DATABASE_URL } from '#db/index'

const databaseUrl = process.env['DATABASE_URL'] ?? PLACEHOLDER_DATABASE_URL

export const auth: Auth = betterAuth(
  buildAuthOptions({
    db: drizzle(createSql(databaseUrl)),
    googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
    googleClientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    allowedEmails: process.env['AUTH_ALLOWED_EMAILS'],
    logger: createLogger({ level: 'info' }),
  }),
)
