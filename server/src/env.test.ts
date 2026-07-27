import { describe, expect, it } from 'vitest'

import { EnvError, loadEnv, requireDatabaseUrl } from '#env'

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
        CATALOG_TRUSTED_EMAILS: 'a@example.com,b@example.com',
        CATALOG_APPROVAL_THRESHOLD: '3',
      }),
    ).toEqual({
      PORT: 4000,
      LOG_LEVEL: 'debug',
      DATABASE_URL,
      CATALOG_TRUSTED_EMAILS: 'a@example.com,b@example.com',
      CATALOG_APPROVAL_THRESHOLD: 3,
    })
  })

  it('defaults PORT, LOG_LEVEL, CATALOG_TRUSTED_EMAILS and CATALOG_APPROVAL_THRESHOLD when omitted', () => {
    expect(loadEnv({ DATABASE_URL })).toEqual({
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      CATALOG_TRUSTED_EMAILS: '',
      CATALOG_APPROVAL_THRESHOLD: 2,
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

  it('rejects a non-integer CATALOG_APPROVAL_THRESHOLD', () => {
    expect(
      captureIssues(() =>
        loadEnv({ CATALOG_APPROVAL_THRESHOLD: 'abc', DATABASE_URL }),
      ),
    ).toEqual(['CATALOG_APPROVAL_THRESHOLD must be an integer >= 2 (got: abc)'])
  })

  it('rejects a CATALOG_APPROVAL_THRESHOLD below 2', () => {
    expect(
      captureIssues(() =>
        loadEnv({ CATALOG_APPROVAL_THRESHOLD: '1', DATABASE_URL }),
      ),
    ).toEqual(['CATALOG_APPROVAL_THRESHOLD must be an integer >= 2 (got: 1)'])
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
