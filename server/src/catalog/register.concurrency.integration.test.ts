import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createCatalogService } from '@/catalog/catalog-service'
import {
  insertUser,
  scoreListPage,
  scoreRow,
  uniqueAlnumId,
} from '@/catalog/test/fixtures'
import { musics, musicSubmissions } from '@/db/schema'
import { createTestDb } from '@/db/test/db'

const APPROVAL_THRESHOLD = 2

describe('CatalogService.register concurrency', () => {
  // Unlike the other catalog-service test files, this exercises real,
  // independently-committing connections (setupTx's single reserved
  // connection can't model two transactions racing for the same row lock).
  // IDs are randomized per run so reruns never collide with rows a previous
  // run left behind.
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

      await Promise.all([
        a.db.transaction((tx) =>
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
        b.db.transaction((tx) =>
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

      const [music] = await a.db
        .select()
        .from(musics)
        .where(eq(musics.id, musicId))
      expect(music?.status).toBe('approved')
      expect(
        await a.db
          .select()
          .from(musicSubmissions)
          .where(eq(musicSubmissions.musicId, musicId)),
      ).toEqual([])
    } finally {
      await a.close()
      await b.close()
    }
  })
})
