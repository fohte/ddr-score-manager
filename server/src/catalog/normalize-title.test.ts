import { describe, expect, it } from 'vitest'

import { normalizeTitle } from '@/catalog/normalize-title'

describe('normalizeTitle', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeTitle('  MAX 300  ')).toBe('MAX 300')
  })

  it('collapses consecutive whitespace into a single space', () => {
    expect(normalizeTitle('MAX   300')).toBe('MAX 300')
  })

  it('applies NFKC normalization to fold compatibility characters', () => {
    // Fullwidth alphanumerics/space (U+FF21-FF5A, U+3000) normalize to
    // their halfwidth ASCII equivalents under NFKC.
    expect(normalizeTitle('ＭＡＸ　３００')).toBe('MAX 300')
  })

  it('leaves an already-normalized title unchanged', () => {
    expect(normalizeTitle('MAX 300')).toBe('MAX 300')
  })
})
