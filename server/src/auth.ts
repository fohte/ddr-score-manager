import { apiKey } from '@better-auth/api-key'
import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Logger } from 'pino'

import { createAllowlistPolicy } from '@/allowlist'
import { createSql, PLACEHOLDER_DATABASE_URL } from '@/db'
import * as schema from '@/db/schema'
import { createLogger } from '@/logger'

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 days
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 // 1 day (sliding refresh)

// The only permission scope this app grants: API keys authenticate uploads
// only, never read routes. Enforcing that split, and re-checking the
// allowlist on every request (sliding-refreshed sessions and issued API
// keys never go through the create hooks below), is AuthMiddleware's job —
// not yet implemented as of this module.
const API_KEY_PERMISSIONS = { upload: ['create'] }

export interface AuthDeps {
  db: PostgresJsDatabase
  googleClientId: string
  googleClientSecret: string
  allowedEmails: string | undefined
  logger: Logger
}

export const buildAuthOptions = (deps: AuthDeps): BetterAuthOptions => {
  const allowlist = createAllowlistPolicy(deps.allowedEmails)

  const rejectUnlessAllowed = (email: string): void => {
    if (!allowlist.isAllowed(email)) {
      deps.logger.warn({ email }, 'rejected sign-in: email not allowlisted')
      throw new APIError('FORBIDDEN', { message: 'email is not allowlisted' })
    }
  }

  return {
    database: drizzleAdapter(deps.db, { provider: 'pg', schema }),
    socialProviders: {
      google: {
        clientId: deps.googleClientId,
        clientSecret: deps.googleClientSecret,
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    databaseHooks: {
      user: {
        create: {
          before: (created) => {
            rejectUnlessAllowed(created.email)
            return Promise.resolve()
          },
        },
      },
      session: {
        create: {
          before: async (created) => {
            const [owner] = await deps.db
              .select({ email: schema.user.email })
              .from(schema.user)
              .where(eq(schema.user.id, created.userId))
              .limit(1)
            // owner is guaranteed by session.user_id's FK, but deny rather
            // than silently allow if that invariant is ever violated — this
            // module's own failure mode is deny-all, not fail-open.
            if (owner === undefined) {
              throw new APIError('FORBIDDEN', {
                message: 'session owner not found',
              })
            }
            rejectUnlessAllowed(owner.email)
          },
        },
      },
    },
    plugins: [
      apiKey({
        enableSessionForAPIKeys: true,
        permissions: {
          defaultPermissions: () => API_KEY_PERMISSIONS,
        },
      }),
    ],
  }
}

const databaseUrl = process.env['DATABASE_URL'] ?? PLACEHOLDER_DATABASE_URL

export const auth: Auth = betterAuth(
  buildAuthOptions({
    db: drizzle(createSql(databaseUrl)),
    googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
    googleClientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    allowedEmails: process.env['AUTH_ALLOWED_EMAILS'],
    logger: createLogger('info'),
  }),
)
