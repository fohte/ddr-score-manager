import { describe, expect, inject, it, vi } from 'vitest'

import { createApp } from '@/app'
import { createSql, pingDb, PLACEHOLDER_DATABASE_URL } from '@/db'
import { createLogger } from '@/logger'

// Never queried by the tests below, so postgres.js's lazy connection never
// actually dials this placeholder.
const sql = createSql(PLACEHOLDER_DATABASE_URL)

const app = createApp({
  logger: createLogger('fatal'),
  checkDb: () => pingDb(sql),
})

describe('createApp', () => {
  it('responds to the health check', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it.each([
    ['the SPA entry point', '/'],
    ['the SPA entry point for unknown paths', '/some/unknown/path'],
  ])('serves %s', async (_description, path) => {
    const res = await app.request(path)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })

  it('returns a JSON 404 for unknown API routes instead of the SPA fallback', async () => {
    const res = await app.request('/api/unknown')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not Found' })
  })

  it('resolves static assets independent of the process CWD', async () => {
    const originalCwd = process.cwd()
    process.chdir('/')
    try {
      const res = await app.request('/')
      expect(res.status).toBe(200)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('logs unhandled errors and returns a 500 JSON response', async () => {
    const logger = createLogger('fatal')
    vi.spyOn(logger, 'info').mockImplementation(() => {
      throw new Error('boom')
    })
    const brokenApp = createApp({ logger, checkDb: () => pingDb(sql) })

    const res = await brokenApp.request('/api/health')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal Server Error' })
  })

  describe('/healthz', () => {
    it('returns 200 when the database is reachable', async () => {
      const reachableSql = createSql(inject('databaseUrl'))
      const healthyApp = createApp({
        logger: createLogger('fatal'),
        checkDb: () => pingDb(reachableSql),
      })
      try {
        const res = await healthyApp.request('/healthz')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ status: 'ok' })
      } finally {
        await reachableSql.end({ timeout: 5 })
      }
    })

    it('returns 503 when the database is unreachable', async () => {
      const unreachableSql = createSql('postgresql://user:pass@127.0.0.1:1/db')
      const unhealthyApp = createApp({
        logger: createLogger('fatal'),
        checkDb: () => pingDb(unreachableSql),
      })
      try {
        const res = await unhealthyApp.request('/healthz')
        expect(res.status).toBe(503)
        expect(await res.json()).toEqual({ status: 'error' })
      } finally {
        await unreachableSql.end({ timeout: 5 })
      }
    })
  })
})
