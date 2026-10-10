import { noopLogger } from '@fohte/service-kit/logger'
import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createApiKeyPermissionsLookup } from '#api-key-permissions'
import { createApp } from '#app'
import { createAuth } from '#auth'
import {
  type AuthMiddlewareEnvironment,
  createAuthMiddleware,
} from '#auth-middleware'
import { createDb, createSql } from '#db/index'
import { user } from '#db/schema/index'
import { requireDatabaseUrl } from '#env'
import { createScoreReadApi } from '#score-read-api'

const TEST_EMAILS = ['middleware@example.test', 'another-reader@example.test']
const PASSWORD = 'test-password-12345'
const ALLOWED_EMAIL = 'middleware@example.test'

const responseOutput = async (response: Response) => ({
  status: response.status,
  contentType: response.headers.get('content-type'),
  body: normalizeUserId(await response.json()),
})

const normalizeUserId = (body: unknown): unknown => {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !('userId' in body)
  ) {
    return body
  }

  return { ...body, userId: '<user-id>' }
}

describe('authentication middleware integration', () => {
  const sql = createSql(requireDatabaseUrl())
  const db = createDb(sql)

  const deleteTestUsers = () =>
    db.delete(user).where(inArray(user.email, TEST_EMAILS))

  beforeAll(deleteTestUsers)
  afterEach(deleteTestUsers)

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  const createTestAuth = (
    allowedEmails: string,
    options: { autoSignIn: boolean } = { autoSignIn: true },
  ) =>
    createAuth(
      {
        db,
        googleClientId: 'test-client-id',
        googleClientSecret: 'test-client-secret',
        allowedEmails,
        logger: noopLogger,
      },
      { emailAndPassword: { enabled: true, autoSignIn: options.autoSignIn } },
    )

  const createExistingUser = async (email: string) => {
    const auth = createTestAuth(email, { autoSignIn: false })

    await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: 'Test User' },
    })
  }

  const signInAndCreateApiKey = async (
    auth: ReturnType<typeof createTestAuth>,
  ) => {
    const signedIn = await auth.api.signInEmail({
      body: { email: ALLOWED_EMAIL, password: PASSWORD },
      returnHeaders: true,
    })
    const cookie = signedIn.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
    const keyResponse = await auth.handler(
      new Request('http://localhost/api/auth/api-key/create', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
        },
        body: JSON.stringify({ name: 'test-key' }),
      }),
    )
    const keyData: unknown = await keyResponse.json()
    const apiKey =
      typeof keyData === 'object' &&
      keyData !== null &&
      'key' in keyData &&
      typeof keyData.key === 'string' &&
      keyData.key.length > 0
        ? keyData.key
        : null

    if (apiKey === null)
      throw new Error('Better Auth did not create a test API key')

    return {
      apiKey,
      cookie,
    }
  }

  const createProtectedApp = (
    auth: ReturnType<typeof createTestAuth>,
    allowedEmails: string,
  ) => {
    const app = new Hono<AuthMiddlewareEnvironment>()
    app.use(
      '/api/*',
      createAuthMiddleware({
        allowedEmails,
        getApiKeyPermissions: createApiKeyPermissionsLookup(db),
        getSession: (headers) => auth.api.getSession({ headers }),
        logger: noopLogger,
      }),
    )
    app.get('/api/scores', (c) => c.json({ userId: c.var.userId }))
    app.post('/api/scores/upload', (c) => c.json({ userId: c.var.userId }))
    return app
  }

  it('allows an allowlisted cookie session to read scores', async () => {
    await createExistingUser(ALLOWED_EMAIL)
    const auth = createTestAuth(ALLOWED_EMAIL)
    const { cookie } = await signInAndCreateApiKey(auth)

    const response = await createProtectedApp(auth, ALLOWED_EMAIL).request(
      '/api/scores',
      { headers: { cookie } },
    )

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { userId: '<user-id>' },
    })
  })

  it('accepts an allowlisted API key with upload permission only on upload', async () => {
    await createExistingUser(ALLOWED_EMAIL)
    const auth = createTestAuth(ALLOWED_EMAIL)
    const { apiKey } = await signInAndCreateApiKey(auth)

    const response = await createProtectedApp(auth, ALLOWED_EMAIL).request(
      '/api/scores/upload',
      { method: 'POST', headers: { 'x-api-key': apiKey } },
    )

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { userId: '<user-id>' },
    })
  })

  it('rejects an API-key mock session on a score read route', async () => {
    await createExistingUser(ALLOWED_EMAIL)
    const auth = createTestAuth(ALLOWED_EMAIL)
    const { apiKey } = await signInAndCreateApiKey(auth)

    const response = await createProtectedApp(auth, ALLOWED_EMAIL).request(
      '/api/scores',
      { headers: { 'x-api-key': apiKey } },
    )

    expect(await responseOutput(response)).toEqual({
      status: 401,
      contentType: 'application/json',
      body: { error: 'Unauthorized' },
    })
  })

  it.each([
    ['cookie session', '/api/scores', 'cookie'],
    ['API key', '/api/scores/upload', 'apiKey'],
  ] as const)(
    'rejects an existing %s after allowlist removal',
    async (_credential, path, credentialKind) => {
      await createExistingUser(ALLOWED_EMAIL)
      const auth = createTestAuth(ALLOWED_EMAIL)
      const credentials = await signInAndCreateApiKey(auth)
      const app = createProtectedApp(auth, 'another-reader@example.test')
      const response = await app.request(path, {
        method: path.endsWith('/upload') ? 'POST' : 'GET',
        headers:
          credentialKind === 'cookie'
            ? { cookie: credentials.cookie }
            : { 'x-api-key': credentials.apiKey },
      })

      expect(await responseOutput(response)).toEqual({
        status: 401,
        contentType: 'application/json',
        body: { error: 'Unauthorized' },
      })
    },
  )

  it('mounts the real better-auth handler at the configured base path', async () => {
    const auth = createTestAuth(ALLOWED_EMAIL)
    const app = createApp({
      allowedEmails: ALLOWED_EMAIL,
      authHandler: auth.handler,
      checkDb: () => Promise.resolve(),
      getApiKeyPermissions: createApiKeyPermissionsLookup(db),
      getSession: (headers) => auth.api.getSession({ headers }),
      logger: noopLogger,
      scoreReadApi: createScoreReadApi(db, noopLogger),
    })

    const response = await app.request('/api/auth/ok')

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { ok: true },
    })
  })
})
