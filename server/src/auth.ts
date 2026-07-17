import { apiKey } from '@better-auth/api-key'
import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import { createAllowlistPolicy } from '@/allowlist'
import { createSql, PLACEHOLDER_DATABASE_URL } from '@/db'
import * as schema from '@/db/schema'

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 days
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 // 1 day (sliding refresh)

// The only permission scope this app grants: API keys authenticate uploads
// only, never read routes (enforced by AuthMiddleware, not here).
const API_KEY_PERMISSIONS = { upload: ['create'] }

export interface AuthDeps {
  db: PostgresJsDatabase
  googleClientId: string
  googleClientSecret: string
  allowedEmails: string | undefined
}

export const buildAuthOptions = (deps: AuthDeps): BetterAuthOptions => {
  const allowlist = createAllowlistPolicy(deps.allowedEmails)

  const rejectUnlessAllowed = (email: string): void => {
    if (!allowlist.isAllowed(email)) {
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
            if (owner !== undefined) rejectUnlessAllowed(owner.email)
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
  }),
)
