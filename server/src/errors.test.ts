import { describe, expect, it } from 'vitest'

import { BoundaryError } from '#errors'

class TaskStorePersistenceError extends BoundaryError {}

const getErrorDetails = (error: Error) => [
  error.name,
  error.message,
  error.cause,
]

describe('BoundaryError', () => {
  it('preserves the subclass name, message, and original cause', () => {
    const original = new Error('connection refused')
    const wrapped = new TaskStorePersistenceError('failed to save', original)
    expect(getErrorDetails(wrapped)).toEqual([
      'TaskStorePersistenceError',
      'failed to save',
      original,
    ])
  })
})
