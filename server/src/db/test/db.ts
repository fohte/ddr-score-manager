import { TransactionRollbackError } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, afterEach, beforeEach } from 'vitest'

import { createDb, createSql, type Db, type Tx } from '@/db'
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

// Can't reuse setupTx()'s reserved connection here: Drizzle's postgres-js
// driver reads client.options.parsers/serializers while constructing a Db,
// and postgres.js only populates `options` on a connection pool's main
// client, not on the lightweight object reserve() returns — wrapping a
// reserved connection crashes. So this opens its own db.transaction() (on
// the shared pool's main client) and holds it open for the whole test via a
// rollback signal, giving the same per-test BEGIN/ROLLBACK isolation.
export const setupDrizzleTx = (): (() => Tx) => {
  let currentTx: Tx | null = null
  let signalDone: (() => void) | null = null
  let txSettled: Promise<void> | null = null

  beforeEach(async () => {
    let resolveTx: (tx: Tx) => void
    const txReady = new Promise<Tx>((resolve) => {
      resolveTx = resolve
    })
    const done = new Promise<void>((resolve) => {
      signalDone = resolve
    })

    txSettled = createDb(getPool())
      .transaction(async (tx) => {
        resolveTx(tx)
        await done
        tx.rollback()
      })
      .catch((err: unknown) => {
        if (!(err instanceof TransactionRollbackError)) throw err
      })

    currentTx = await txReady
  })

  afterEach(async () => {
    signalDone?.()
    await txSettled
    currentTx = null
  })

  return () => {
    if (currentTx === null) {
      throw new Error(
        'tx accessed outside a test (call setupDrizzleTx in describe)',
      )
    }
    return currentTx
  }
}

// A real, independently-committing connection for tests that exercise
// Postgres row-locking across concurrent transactions (setupTx's single
// reserved connection can't model two transactions racing each other).
// Callers own the returned close() and must call it in afterAll/afterEach.
export const createTestDb = (): { db: Db; close: () => Promise<void> } => {
  const sql = createSql(requireDatabaseUrl())
  return { db: createDb(sql), close: () => sql.end({ timeout: 5 }) }
}
