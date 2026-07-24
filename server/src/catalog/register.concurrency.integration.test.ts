import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createCatalogService } from '@/catalog/catalog-service'
import {
  getMusic,
  insertUser,
  normalizeMusic,
  scoreListPage,
  scoreRow,
  uniqueAlnumId,
} from '@/catalog/test/fixtures'
import { runInTransaction } from '@/catalog/transaction'
import { musicCharts, musics, musicSubmissions, user } from '@/db/schema'
import { createTestDb } from '@/db/test/db'

const APPROVAL_THRESHOLD = 2

describe('CatalogService.register concurrency', () => {
  // 他の catalog-service テストファイルと異なり、このテストは実際に
  // コミットする独立した接続を使う (setupTx の単一予約接続では、同じ行ロックを
  // 奪い合う 2 つのトランザクションを再現できないため)。
  // ID は実行のたびにランダム化し、前回実行の残存行と衝突しないようにする。
  it('does not miss threshold approval when two untrusted submissions race for the same music', async () => {
    const musicId = uniqueAlnumId('conc')
    const userA = uniqueAlnumId('usera')
    const userB = uniqueAlnumId('userb')
    const a = createTestDb()
    const b = createTestDb()

    try {
      await insertUser(a.db, userA)
      await insertUser(a.db, userB)

      const serviceA = createCatalogService(a.db, APPROVAL_THRESHOLD)
      const serviceB = createCatalogService(b.db, APPROVAL_THRESHOLD)

      const [resultA, resultB] = await Promise.all([
        runInTransaction(a.db, (tx) =>
          serviceA.register(tx, {
            userId: userA,
            trusted: false,
            pages: [
              scoreListPage([
                scoreRow({ musicId, musicTitle: 'Concurrent Music' }),
              ]),
            ],
          }),
        ),
        runInTransaction(b.db, (tx) =>
          serviceB.register(tx, {
            userId: userB,
            trusted: false,
            pages: [
              scoreListPage([
                scoreRow({ musicId, musicTitle: 'Concurrent Music' }),
              ]),
            ],
          }),
        ),
      ])
      resultA._unsafeUnwrap()
      resultB._unsafeUnwrap()

      expect(normalizeMusic(await getMusic(a.db, musicId))).toEqual({
        id: musicId,
        title: 'Concurrent Music',
        artist: null,
        status: 'approved',
        approvedAt: 'SET',
        createdAt: 'TIMESTAMP',
        updatedAt: 'TIMESTAMP',
      })
      expect(
        await a.db
          .select()
          .from(musicSubmissions)
          .where(eq(musicSubmissions.musicId, musicId)),
      ).toEqual([])
    } finally {
      // 実コミットするテストなので、後続実行やローカル DB への蓄積を避けるため
      // 作成した行を明示的に削除する (FK 制約により子テーブルから先に削除する)。
      await a.db
        .delete(musicSubmissions)
        .where(eq(musicSubmissions.musicId, musicId))
      await a.db.delete(musicCharts).where(eq(musicCharts.musicId, musicId))
      await a.db.delete(musics).where(eq(musics.id, musicId))
      await a.db.delete(user).where(eq(user.id, userA))
      await a.db.delete(user).where(eq(user.id, userB))
      await a.close()
      await b.close()
    }
  })
})
