import { describe, expect, it } from 'vitest'

import { EnvError, loadEnv, requireDatabaseUrl } from '@/env'

const captureIssues = (run: () => unknown): readonly string[] => {
  try {
    run()
  } catch (err) {
    if (err instanceof EnvError) return err.issues
    throw err
  }
  throw new Error('expected loadEnv to throw')
}

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/ddr'

describe('loadEnv', () => {
  it('parses a complete environment', () => {
    expect(
      loadEnv({
        PORT: '4000',
        LOG_LEVEL: 'debug',
        DATABASE_URL,
      }),
    ).toEqual({
      PORT: 4000,
      LOG_LEVEL: 'debug',
      DATABASE_URL,
    })
  })

  it('defaults PORT and LOG_LEVEL when omitted', () => {
    expect(loadEnv({ DATABASE_URL })).toEqual({
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
    })
  })

  it('rejects a non-numeric PORT', () => {
    expect(captureIssues(() => loadEnv({ PORT: 'abc', DATABASE_URL }))).toEqual(
      ['PORT must be a valid TCP port (got: abc)'],
    )
  })

  it('rejects a PORT outside the valid TCP range', () => {
    expect(
      captureIssues(() => loadEnv({ PORT: '70000', DATABASE_URL })),
    ).toEqual(['PORT must be a valid TCP port (got: 70000)'])
  })

  it('rejects an unknown LOG_LEVEL', () => {
    expect(
      captureIssues(() => loadEnv({ LOG_LEVEL: 'verbose', DATABASE_URL })),
    ).toEqual([
      'LOG_LEVEL must be one of fatal, error, warn, info, debug, trace (got: verbose)',
    ])
  })

  it('rejects a missing DATABASE_URL', () => {
    expect(captureIssues(() => loadEnv({}))).toEqual([
      'missing required env: DATABASE_URL',
    ])
  })
})

describe('requireDatabaseUrl', () => {
  it('returns DATABASE_URL when set', () => {
    expect(requireDatabaseUrl({ DATABASE_URL })).toBe(DATABASE_URL)
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(captureIssues(() => requireDatabaseUrl({}))).toEqual([
      'missing required env: DATABASE_URL',
    ])
  })
})
