import { describe, expect, it } from 'vitest'

import { EnvError, loadEnv } from '@/env'

const captureIssues = (run: () => unknown): readonly string[] => {
  try {
    run()
  } catch (err) {
    if (err instanceof EnvError) return err.issues
    throw err
  }
  throw new Error('expected loadEnv to throw')
}

describe('loadEnv', () => {
  it('parses a complete environment', () => {
    expect(loadEnv({ PORT: '4000', LOG_LEVEL: 'debug' })).toEqual({
      PORT: 4000,
      LOG_LEVEL: 'debug',
    })
  })

  it('defaults PORT and LOG_LEVEL when omitted', () => {
    expect(loadEnv({})).toEqual({ PORT: 3000, LOG_LEVEL: 'info' })
  })

  it('rejects a non-numeric PORT', () => {
    expect(captureIssues(() => loadEnv({ PORT: 'abc' }))).toEqual([
      'PORT must be a valid TCP port (got: abc)',
    ])
  })

  it('rejects a PORT outside the valid TCP range', () => {
    expect(captureIssues(() => loadEnv({ PORT: '70000' }))).toEqual([
      'PORT must be a valid TCP port (got: 70000)',
    ])
  })

  it('rejects an unknown LOG_LEVEL', () => {
    expect(captureIssues(() => loadEnv({ LOG_LEVEL: 'verbose' }))).toEqual([
      'LOG_LEVEL must be one of fatal, error, warn, info, debug, trace (got: verbose)',
    ])
  })
})
