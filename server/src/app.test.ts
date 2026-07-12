import { describe, expect, it } from 'vitest'

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
})
