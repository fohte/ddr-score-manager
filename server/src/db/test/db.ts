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
      // eslint-disable-next-line no-restricted-syntax -- test helper outside vitest's *.test.ts/__tests__ convention; propagates the rejection while guaranteeing release()
      try {
        await r.unsafe('ROLLBACK')
      } finally {
        r.release()
      }
    }
  })

  return () => {
    if (reserved === null) {
      // eslint-disable-next-line no-restricted-syntax -- test helper outside vitest's *.test.ts/__tests__ convention
      throw new Error('tx accessed outside a test (call setupTx in describe)')
    }
    return reserved
  }
}

// ここでは setupTx() の予約接続を再利用できない: Drizzle の postgres-js
// ドライバは Db 構築時に client.options.parsers/serializers を読むが、
// postgres.js が options を持つのは接続プールのメインクライアントのみで、
// reserve() が返す軽量オブジェクトには無い (ラップするとクラッシュする)。
// そのため、共有プールのメインクライアント上で自前の db.transaction() を
// 開始し、rollback シグナルでテスト全体にわたって開いたままにすることで、
// setupTx() と同じテストごとの BEGIN/ROLLBACK 分離を実現する。
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
        // eslint-disable-next-line no-restricted-syntax -- test helper outside vitest's *.test.ts/__tests__ convention
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
      // eslint-disable-next-line no-restricted-syntax -- test helper outside vitest's *.test.ts/__tests__ convention
      throw new Error(
        'tx accessed outside a test (call setupDrizzleTx in describe)',
      )
    }
    return currentTx
  }
}

// 複数トランザクションが Postgres の行ロックを競合するケースを検証する
// テスト用の、実際にコミットする独立接続 (setupTx の単一予約接続では
// 2 つのトランザクションの競合を再現できない)。
// 戻り値の close() は呼び出し側が責務を持ち、afterAll/afterEach で呼ぶこと。
export const createTestDb = (): { db: Db; close: () => Promise<void> } => {
  const sql = createSql(requireDatabaseUrl())
  return { db: createDb(sql), close: () => sql.end({ timeout: 5 }) }
}
