import { describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app'
import { createLogger } from '@/logger'

const app = createApp({ logger: createLogger('fatal') })

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
    const brokenApp = createApp({ logger })

    const res = await brokenApp.request('/api/health')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal Server Error' })
  })
})
