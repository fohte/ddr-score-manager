import type { Logger } from '@fohte/service-kit/logger'
import { isAPIError } from 'better-auth/api'
import type { Context, MiddlewareHandler } from 'hono'
import { Result, ResultAsync } from 'neverthrow'

import { createAllowlistPolicy } from '#allowlist'

export interface AuthMiddlewareEnvironment {
  Variables: {
    userId: string
  }
}

interface AuthSession {
  session: { id: string }
  user: { id: string; email: string }
}

export interface AuthMiddlewareDeps {
  allowedEmails: string | undefined
  getApiKeyPermissions: (apiKeyId: string) => Promise<string | null>
  getSession: (headers: Headers) => Promise<AuthSession | null>
  logger: Logger
}

const parseJson = Result.fromThrowable(
  (value: string): unknown => JSON.parse(value),
  (error: unknown) => error,
)

const hasUploadPermission = (rawPermissions: string | null): boolean => {
  if (rawPermissions === null) return false

  const parsed = parseJson(rawPermissions)
  if (parsed.isErr()) return false

  const permissions = parsed.value
  if (
    typeof permissions !== 'object' ||
    permissions === null ||
    Array.isArray(permissions)
  ) {
    return false
  }

  const uploadPermissions: unknown = Reflect.get(permissions, 'upload')
  return (
    Array.isArray(uploadPermissions) && uploadPermissions.includes('create')
  )
}

const unauthorized = (c: Context<AuthMiddlewareEnvironment>) =>
  c.json({ error: 'Unauthorized' }, 401)

export const createAuthMiddleware = (
  deps: AuthMiddlewareDeps,
): MiddlewareHandler<AuthMiddlewareEnvironment> => {
  const allowlist = createAllowlistPolicy(deps.allowedEmails)

  return async (c, next) => {
    const isUploadRequest =
      c.req.method === 'POST' && c.req.path === '/api/scores/upload'
    const hasApiKey = c.req.header('x-api-key') !== undefined

    if ((isUploadRequest && !hasApiKey) || (hasApiKey && !isUploadRequest)) {
      return unauthorized(c)
    }

    const sessionResult = await ResultAsync.fromPromise(
      deps.getSession(c.req.raw.headers),
      (error: unknown) => error,
    )

    if (sessionResult.isErr()) {
      if (isAPIError(sessionResult.error)) {
        if (sessionResult.error.statusCode === 429) {
          return c.json({ error: 'Too Many Requests' }, 429)
        }
        if (sessionResult.error.statusCode < 500) return unauthorized(c)
      }

      deps.logger.error(
        { err: sessionResult.error },
        'failed to resolve authentication session',
      )
      return c.json({ error: 'Internal Server Error' }, 500)
    }

    const session = sessionResult.value
    if (session === null || !allowlist.isAllowed(session.user.email)) {
      return unauthorized(c)
    }

    if (isUploadRequest) {
      // API key の mock session はキー ID を session.id に入れるため、権限をその ID で引く。
      const permissionsResult = await ResultAsync.fromPromise(
        deps.getApiKeyPermissions(session.session.id),
        (error: unknown) => error,
      )
      if (permissionsResult.isErr()) {
        deps.logger.error(
          { err: permissionsResult.error },
          'failed to load API key permissions',
        )
        return c.json({ error: 'Internal Server Error' }, 500)
      }

      if (!hasUploadPermission(permissionsResult.value)) {
        return unauthorized(c)
      }
    }

    c.set('userId', session.user.id)
    return next()
  }
}
