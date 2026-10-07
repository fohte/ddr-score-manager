import { createLogger, noopLogger } from '@fohte/service-kit/logger'
import { describe, expect, it, vi } from 'vitest'

import { type AppDeps, createApp } from '#app'
import { createSql, pingDb, PLACEHOLDER_DATABASE_URL } from '#db/index'
import { requireDatabaseUrl } from '#env'

// Never queried by the tests below, so postgres.js's lazy connection never
// actually dials this placeholder.
const sql = createSql(PLACEHOLDER_DATABASE_URL)

const testSession = {
  session: { id: 'test-session-id' },
  user: { id: 'test-user-id', email: 'reader@example.test' },
}

const createTestApp = (overrides: Partial<AppDeps> = {}) =>
  createApp({
    allowedEmails: 'reader@example.test',
    authHandler: () => Promise.resolve(Response.json({ status: 'auth' })),
    checkDb: () => pingDb(sql),
    getApiKeyPermissions: () => Promise.resolve('{"upload":["create"]}'),
    getSession: () => Promise.resolve(testSession),
    logger: noopLogger,
    ...overrides,
  })

const app = createTestApp()

const jsonResponseOutput = async (response: Response) => ({
  status: response.status,
  contentType: response.headers.get('content-type'),
  body: await response.json(),
})

const documentResponseOutput = (response: Response) => ({
  status: response.status,
  contentType: response.headers.get('content-type'),
})

describe('createApp', () => {
  it('responds to the health check', async () => {
    const healthApp = createTestApp({
      getSession: () => Promise.resolve(null),
    })
    const response = await healthApp.request('/api/health')
    expect(await jsonResponseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { status: 'ok' },
    })
  })

  it.each([
    ['the SPA entry point', '/'],
    ['the SPA entry point for unknown paths', '/some/unknown/path'],
  ])('serves %s', async (_description, path) => {
    const response = await app.request(path)
    expect(documentResponseOutput(response)).toEqual({
      status: 200,
      contentType: 'text/html; charset=utf-8',
    })
  })

  it('returns a JSON 404 for unknown API routes instead of the SPA fallback', async () => {
    const response = await app.request('/api/unknown')
    expect(await jsonResponseOutput(response)).toEqual({
      status: 404,
      contentType: 'application/json',
      body: { error: 'Not Found' },
    })
  })

  it('resolves static assets independent of the process CWD', async () => {
    const originalCwd = process.cwd()
    process.chdir('/')
    try {
      const response = await app.request('/')
      expect(documentResponseOutput(response)).toEqual({
        status: 200,
        contentType: 'text/html; charset=utf-8',
      })
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('logs unhandled errors and returns a 500 JSON response', async () => {
    const logger = createLogger({ level: 'fatal' })
    vi.spyOn(logger, 'info').mockImplementation(() => {
      throw new Error('boom')
    })
    const brokenApp = createTestApp({ logger })

    const response = await brokenApp.request('/api/health')
    expect(await jsonResponseOutput(response)).toEqual({
      status: 500,
      contentType: 'application/json',
      body: { error: 'Internal Server Error' },
    })
  })

  describe('/healthz', () => {
    it('returns 200 when the database is reachable', async () => {
      const reachableSql = createSql(requireDatabaseUrl())
      const healthyApp = createTestApp({
        checkDb: () => pingDb(reachableSql),
      })
      try {
        const response = await healthyApp.request('/healthz')
        expect(await jsonResponseOutput(response)).toEqual({
          status: 200,
          contentType: 'application/json',
          body: { status: 'ok' },
        })
      } finally {
        await reachableSql.end({ timeout: 5 })
      }
    })

    it('returns 503 when the database is unreachable', async () => {
      const unreachableSql = createSql('postgresql://user:pass@127.0.0.1:1/db')
      const unhealthyApp = createTestApp({
        checkDb: () => pingDb(unreachableSql),
      })
      try {
        const response = await unhealthyApp.request('/healthz')
        expect(await jsonResponseOutput(response)).toEqual({
          status: 503,
          contentType: 'application/json',
          body: { status: 'error' },
        })
      } finally {
        await unreachableSql.end({ timeout: 5 })
      }
    })
  })

  it('forwards authentication requests to better-auth before the API middleware', async () => {
    const authApp = createTestApp({
      authHandler: (request) =>
        Promise.resolve(
          Response.json({
            method: request.method,
            path: new URL(request.url).pathname,
          }),
        ),
      getSession: () => Promise.resolve(null),
    })

    const response = await authApp.request('/api/auth/get-session', {
      method: 'POST',
    })

    expect(await jsonResponseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { method: 'POST', path: '/api/auth/get-session' },
    })
  })

  it('protects API routes before they reach their handlers', async () => {
    const protectedApp = createTestApp({
      getSession: () => Promise.resolve(null),
    })

    const response = await protectedApp.request('/api/scores')

    expect(await jsonResponseOutput(response)).toEqual({
      status: 401,
      contentType: 'application/json',
      body: { error: 'Unauthorized' },
    })
  })
})
