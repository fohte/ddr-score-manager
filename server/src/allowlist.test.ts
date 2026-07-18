import { describe, expect, it } from 'vitest'

import { createAllowlistPolicy } from '@/allowlist'

describe('createAllowlistPolicy', () => {
  it.each([
    ['an exact match', 'a@example.com,b@example.com', 'a@example.com'],
    ['a differently-cased entry', 'A@EXAMPLE.COM', 'a@example.com'],
    ['a differently-cased query', 'a@example.com', 'A@EXAMPLE.COM'],
    [
      'whitespace around comma-separated entries',
      ' a@example.com , b@example.com ',
      'b@example.com',
    ],
  ])('allows %s', (_desc, raw, email) => {
    expect(createAllowlistPolicy(raw).isAllowed(email)).toBe(true)
  })

  it('rejects an email not in the list', () => {
    expect(
      createAllowlistPolicy('a@example.com').isAllowed('c@example.com'),
    ).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
  ])('rejects every email when the allowlist is %s', (_desc, raw) => {
    expect(createAllowlistPolicy(raw).isAllowed('anyone@example.com')).toBe(
      false,
    )
  })
})
