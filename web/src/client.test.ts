import { describe, expect, it } from 'vitest'

import { createApiClient } from '@/client'

describe('createApiClient', () => {
  it('builds a typed URL for the health endpoint', () => {
    const client = createApiClient('http://localhost:3000')
    expect(client.api.health.$url().pathname).toBe('/api/health')
  })
})
