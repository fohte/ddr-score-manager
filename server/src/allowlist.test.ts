import { describe, expect, it } from 'vitest'

import { createAllowlistPolicy } from '@/allowlist'

describe('createAllowlistPolicy', () => {
  it.each([
    ['an exact match', 'a@example.com,b@example.com', 'a@example.com', true],
    ['a non-member email', 'a@example.com', 'c@example.com', false],
    ['a differently-cased entry', 'A@EXAMPLE.COM', 'a@example.com', true],
    ['a differently-cased query', 'a@example.com', 'A@EXAMPLE.COM', true],
    [
      'whitespace around comma-separated entries',
      ' a@example.com , b@example.com ',
      'b@example.com',
      true,
    ],
  ])('%s', (_desc, raw, email, expected) => {
    expect(createAllowlistPolicy(raw).isAllowed(email)).toBe(expected)
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
