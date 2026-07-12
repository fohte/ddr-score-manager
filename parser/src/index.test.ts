import { describe, expect, it } from 'vitest'

import type { ParsedPage, Result } from '@/index'

// Widens the literal type of the argument so narrowing checks below aren't
// trivially resolved at compile time (which `no-unnecessary-condition` flags).
const identity = <T>(value: T): T => value

describe('Result', () => {
  it('narrows to value on ok', () => {
    const result = identity<Result<number, string>>({ ok: true, value: 42 })
    expect(result.ok ? result.value : null).toBe(42)
  })

  it('narrows to error on failure', () => {
    const result = identity<Result<number, string>>({
      ok: false,
      error: 'invalid',
    })
    expect(!result.ok ? result.error : null).toBe('invalid')
  })
})

describe('ParsedPage', () => {
  it('narrows to rows on scoreList', () => {
    const page = identity<ParsedPage>({ pageType: 'scoreList', rows: [] })
    expect(page.pageType === 'scoreList' ? page.rows : null).toEqual([])
  })

  it('narrows to detail on musicDetail', () => {
    const page = identity<ParsedPage>({
      pageType: 'musicDetail',
      detail: { musicId: '1', title: 'Title', artist: 'Artist', charts: [] },
    })
    expect(page.pageType === 'musicDetail' ? page.detail.musicId : null).toBe(
      '1',
    )
  })
})
