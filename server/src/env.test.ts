import { describe, expect, it } from 'vitest'

import { EnvValidationError, loadEnv, requireDatabaseUrl } from '#env'

const captureIssues = (run: () => unknown): readonly string[] => {
  try {
    run()
  } catch (err) {
    if (err instanceof EnvValidationError) return err.issues
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

  // service-kit's optional parsers treat an empty string the same as an
  // unset variable, falling back to the default instead of rejecting it.
  it('treats an empty string as unset for optional fields and falls back to the default', () => {
    expect(
      loadEnv({
        PORT: '',
        LOG_LEVEL: '',
        DATABASE_URL,
        CATALOG_APPROVAL_THRESHOLD: '',
      }),
    ).toEqual({
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      CATALOG_TRUSTED_EMAILS: '',
      CATALOG_APPROVAL_THRESHOLD: 2,
    })
  })

  it('rejects a non-numeric PORT', () => {
    expect(captureIssues(() => loadEnv({ PORT: 'abc', DATABASE_URL }))).toEqual(
      ['environment variable PORT must be an integer (got: abc)'],
    )
  })

  it('rejects a PORT outside the valid TCP range', () => {
    expect(
      captureIssues(() => loadEnv({ PORT: '70000', DATABASE_URL })),
    ).toEqual(['environment variable PORT must be <= 65535 (got: 70000)'])
  })

  it('rejects an unknown LOG_LEVEL', () => {
    expect(
      captureIssues(() => loadEnv({ LOG_LEVEL: 'verbose', DATABASE_URL })),
    ).toEqual([
      'environment variable LOG_LEVEL must be one of fatal, error, warn, info, debug, trace (got: verbose)',
    ])
  })

  it('rejects a missing DATABASE_URL', () => {
    expect(captureIssues(() => loadEnv({}))).toEqual([
      'missing required environment variable: DATABASE_URL',
    ])
  })

  it('rejects a non-integer CATALOG_APPROVAL_THRESHOLD', () => {
    expect(
      captureIssues(() =>
        loadEnv({ CATALOG_APPROVAL_THRESHOLD: 'abc', DATABASE_URL }),
      ),
    ).toEqual([
      'environment variable CATALOG_APPROVAL_THRESHOLD must be an integer (got: abc)',
    ])
  })

  it('rejects a CATALOG_APPROVAL_THRESHOLD below 2', () => {
    expect(
      captureIssues(() =>
        loadEnv({ CATALOG_APPROVAL_THRESHOLD: '1', DATABASE_URL }),
      ),
    ).toEqual([
      'environment variable CATALOG_APPROVAL_THRESHOLD must be >= 2 (got: 1)',
    ])
  })
})

describe('requireDatabaseUrl', () => {
  it('returns DATABASE_URL when set', () => {
    expect(requireDatabaseUrl({ DATABASE_URL })).toBe(DATABASE_URL)
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(captureIssues(() => requireDatabaseUrl({}))).toEqual([
      'missing required environment variable: DATABASE_URL',
    ])
  })
})
