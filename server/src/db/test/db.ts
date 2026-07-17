import postgres from 'postgres'
import { afterAll, afterEach, beforeEach } from 'vitest'

import { requireDatabaseUrl } from '@/env'

// One shared pool for the whole worker, created lazily so importing this
// module doesn't open a connection for test files that never call setupTx().
let pool: postgres.Sql | null = null

const getPool = (): postgres.Sql => {
  if (pool === null) {
    pool = postgres(requireDatabaseUrl(), { max: 8, onnotice: () => {} })
  }
  return pool
}

afterAll(async () => {
  if (pool !== null) {
    await pool.end({ timeout: 5 })
    pool = null
  }
})

// The returned getter throws if called outside a test — `reserved` is only
// set between this fixture's beforeEach and afterEach.
export const setupTx = (): (() => postgres.Sql) => {
  let reserved: postgres.ReservedSql | null = null

  beforeEach(async () => {
    reserved = await getPool().reserve()
    await reserved.unsafe('BEGIN')
  })

  afterEach(async () => {
    const r = reserved
    reserved = null
    if (r !== null) {
      try {
        await r.unsafe('ROLLBACK')
      } finally {
        r.release()
      }
    }
  })

  return () => {
    if (reserved === null) {
      throw new Error('tx accessed outside a test (call setupTx in describe)')
    }
    return reserved
  }
}
