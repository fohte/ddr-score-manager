import { noopLogger } from '@fohte/service-kit/logger'
import { APIError } from 'better-auth/api'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import {
  type AuthMiddlewareEnvironment,
  createAuthMiddleware,
} from '#auth-middleware'

const ALLOWED_EMAIL = 'reader@example.test'
const SESSION = {
  session: { id: 'session-id' },
  user: { id: 'reader-id', email: ALLOWED_EMAIL },
}
const API_KEY_SESSION = {
  session: { id: 'api-key-id' },
  user: { id: 'reader-id', email: ALLOWED_EMAIL },
}

const responseOutput = async (response: Response) => ({
  status: response.status,
  contentType: response.headers.get('content-type'),
  body: await response.json(),
})

const responseWithSessionLookupCount = async (
  response: Response,
  sessionLookupCount: number,
) => ({
  response: await responseOutput(response),
  sessionLookupCount,
})

const createTestApp = (
  options: {
    allowedEmails?: string
    apiKeyPermissions?: string | null
    apiKeyPermissionsError?: Error
    sessionError?: Error
  } = {},
) => {
  const app = new Hono<AuthMiddlewareEnvironment>()
  const getSession = vi.fn((headers: Headers) => {
    if (options.sessionError !== undefined) {
      return Promise.reject(options.sessionError)
    }
    if (headers.get('x-api-key') === 'valid-api-key') {
      return Promise.resolve(API_KEY_SESSION)
    }
    if (headers.get('cookie') === 'session=valid') {
      return Promise.resolve(SESSION)
    }
    return Promise.resolve(null)
  })
  const getApiKeyPermissions = vi.fn(() => {
    if (options.apiKeyPermissionsError !== undefined) {
      return Promise.reject(options.apiKeyPermissionsError)
    }
    return Promise.resolve(
      options.apiKeyPermissions === undefined
        ? '{"upload":["create"]}'
        : options.apiKeyPermissions,
    )
  })

  app.use(
    '/api/*',
    createAuthMiddleware({
      allowedEmails: options.allowedEmails ?? ALLOWED_EMAIL,
      getApiKeyPermissions,
      getSession,
      logger: noopLogger,
    }),
  )
  app.get('/api/scores', (c) => c.json({ userId: c.var.userId }))
  app.post('/api/scores/upload', (c) => c.json({ userId: c.var.userId }))

  return { app, getApiKeyPermissions, getSession }
}

describe('createAuthMiddleware', () => {
  it('rejects requests without a session', async () => {
    const { app } = createTestApp()

    const response = await app.request('/api/scores')

    expect(await responseOutput(response)).toEqual({
      status: 401,
      contentType: 'application/json',
      body: { error: 'Unauthorized' },
    })
  })

  it('sets the session user ID for an allowlisted read request', async () => {
    const { app } = createTestApp()

    const response = await app.request('/api/scores', {
      headers: { cookie: 'session=valid' },
    })

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { userId: 'reader-id' },
    })
  })

  it('rejects an API-key mock session on a read request', async () => {
    const { app, getSession } = createTestApp()

    const response = await app.request('/api/scores', {
      headers: { 'x-api-key': 'valid-api-key' },
    })

    expect(
      await responseWithSessionLookupCount(
        response,
        getSession.mock.calls.length,
      ),
    ).toEqual({
      response: {
        status: 401,
        contentType: 'application/json',
        body: { error: 'Unauthorized' },
      },
      sessionLookupCount: 0,
    })
  })

  it('returns 429 when API-key authentication is rate limited', async () => {
    const { app } = createTestApp({
      sessionError: new APIError('TOO_MANY_REQUESTS', {
        message: 'rate limited',
      }),
    })

    const response = await app.request('/api/scores/upload', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-api-key' },
    })

    expect(await responseOutput(response)).toEqual({
      status: 429,
      contentType: 'application/json',
      body: { error: 'Too Many Requests' },
    })
  })

  it('returns 500 when session lookup fails unexpectedly', async () => {
    const { app } = createTestApp({
      sessionError: new Error('database unavailable'),
    })

    const response = await app.request('/api/scores')

    expect(await responseOutput(response)).toEqual({
      status: 500,
      contentType: 'application/json',
      body: { error: 'Internal Server Error' },
    })
  })

  it('accepts an allowlisted API key with upload permission on the upload route', async () => {
    const { app } = createTestApp()

    const response = await app.request('/api/scores/upload', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-api-key' },
    })

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { userId: 'reader-id' },
    })
  })

  it('rejects an upload key without upload permission', async () => {
    const { app } = createTestApp({ apiKeyPermissions: '{"upload":[]}' })

    const response = await app.request('/api/scores/upload', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-api-key' },
    })

    expect(await responseOutput(response)).toEqual({
      status: 401,
      contentType: 'application/json',
      body: { error: 'Unauthorized' },
    })
  })

  it('returns 500 when API-key permissions cannot be loaded', async () => {
    const { app } = createTestApp({
      apiKeyPermissionsError: new Error('database unavailable'),
    })

    const response = await app.request('/api/scores/upload', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-api-key' },
    })

    expect(await responseOutput(response)).toEqual({
      status: 500,
      contentType: 'application/json',
      body: { error: 'Internal Server Error' },
    })
  })

  it.each([
    ['session', '/api/scores', { cookie: 'session=valid' }],
    ['API key', '/api/scores/upload', { 'x-api-key': 'valid-api-key' }],
  ] as const)(
    'rejects an existing %s after its email leaves the allowlist',
    async (_credential, path, headers) => {
      const { app } = createTestApp({ allowedEmails: 'another@example.test' })

      const response = await app.request(path, {
        method: path.endsWith('/upload') ? 'POST' : 'GET',
        headers,
      })

      expect(await responseOutput(response)).toEqual({
        status: 401,
        contentType: 'application/json',
        body: { error: 'Unauthorized' },
      })
    },
  )

  it('rejects a cookie session on the upload route', async () => {
    const { app } = createTestApp()

    const response = await app.request('/api/scores/upload', {
      method: 'POST',
      headers: { cookie: 'session=valid' },
    })

    expect(await responseOutput(response)).toEqual({
      status: 401,
      contentType: 'application/json',
      body: { error: 'Unauthorized' },
    })
  })
})
