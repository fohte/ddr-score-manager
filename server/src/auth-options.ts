import { apiKey } from '@better-auth/api-key'
import { type Logger } from '@fohte/service-kit/logger'
import type { BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import { createAllowlistPolicy } from '#allowlist'
import * as schema from '#db/schema/index'

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 days
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 // 1 day (sliding refresh)

// セッション更新後や API キー発行後も、middleware が allowlist を毎回確認する。
const API_KEY_PERMISSIONS = { upload: ['create'] }

interface AuthDeps {
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
      // eslint-disable-next-line no-restricted-syntax -- interops with better-auth's throw-to-reject databaseHooks contract
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
            // user_id の外部キーが所有者を保証するため、欠落はデータ不整合として拒否する。
            if (owner === undefined) {
              // eslint-disable-next-line no-restricted-syntax -- interops with better-auth's throw-to-reject databaseHooks contract
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
