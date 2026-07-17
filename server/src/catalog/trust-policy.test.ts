import { describe, expect, it } from 'vitest'

import { createCatalogTrustPolicy } from '@/catalog/trust-policy'

describe('createCatalogTrustPolicy', () => {
  it('trusts an email listed in the CSV', () => {
    const policy = createCatalogTrustPolicy('a@example.com,b@example.com')
    expect(policy.isTrusted('a@example.com')).toBe(true)
  })

  it('does not trust an email absent from the CSV', () => {
    const policy = createCatalogTrustPolicy('a@example.com')
    expect(policy.isTrusted('c@example.com')).toBe(false)
  })

  it('ignores case', () => {
    const policy = createCatalogTrustPolicy('A@Example.com')
    expect(policy.isTrusted('a@example.com')).toBe(true)
  })

  it('ignores surrounding whitespace around CSV entries', () => {
    const policy = createCatalogTrustPolicy(' a@example.com , b@example.com ')
    expect(policy.isTrusted('b@example.com')).toBe(true)
  })

  it('trusts nobody when unset', () => {
    const policy = createCatalogTrustPolicy('')
    expect(policy.isTrusted('a@example.com')).toBe(false)
  })
})
