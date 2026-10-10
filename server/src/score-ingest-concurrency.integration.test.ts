import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createCatalogService } from '#catalog/catalog-service'
import {
  insertUser,
  scoreListPage,
  scoreRow,
  uniqueAlnumId,
} from '#catalog/test/fixtures'
import { createCatalogTrustPolicy } from '#catalog/trust-policy'
import {
  chartSubmissions,
  musicCharts,
  musics,
  musicSubmissions,
  scoreRecords,
  user,
} from '#db/schema/index'
import { createTestDb } from '#db/test/db'
import { createScoreIngestService } from '#score-ingest-service'

const concurrentIngestOutput = <T>(summaries: unknown[], records: T) => ({
  summaries,
  records,
})

describe('ScoreIngestService concurrency', () => {
  it('serializes simultaneous identical uploads for the same user', async () => {
    const musicId = uniqueAlnumId('concmusic')
    const userId = uniqueAlnumId('concuser')
    const a = createTestDb()
    const b = createTestDb()

    try {
      await insertUser(a.db, userId)

      const serviceA = createScoreIngestService(
        a.db,
        createCatalogService(a.db, 2),
        createCatalogTrustPolicy(''),
      )
      const serviceB = createScoreIngestService(
        b.db,
        createCatalogService(b.db, 2),
        createCatalogTrustPolicy(''),
      )
      const input = {
        userId,
        userEmail: 'member@example.test',
        pages: [scoreListPage([scoreRow({ musicId })])],
      }

      const [resultA, resultB] = await Promise.all([
        serviceA.ingest(input),
        serviceB.ingest(input),
      ])
      const summaries = [resultA._unsafeUnwrap(), resultB._unsafeUnwrap()].sort(
        (left, right) => left.saved - right.saved,
      )
      const records = await a.db
        .select({
          musicId: scoreRecords.musicId,
          playStyle: scoreRecords.playStyle,
          difficulty: scoreRecords.difficulty,
          score: scoreRecords.score,
          rank: scoreRecords.rank,
          clearType: scoreRecords.clearType,
          flareRank: scoreRecords.flareRank,
        })
        .from(scoreRecords)
        .where(eq(scoreRecords.userId, userId))

      expect(concurrentIngestOutput(summaries, records)).toEqual({
        summaries: [
          { saved: 0, duplicates: 1 },
          { saved: 1, duplicates: 0 },
        ],
        records: [
          {
            musicId,
            playStyle: 'sp',
            difficulty: 'basic',
            score: 900_000,
            rank: 'AAA',
            clearType: null,
            flareRank: null,
          },
        ],
      })
    } finally {
      await a.db.delete(scoreRecords).where(eq(scoreRecords.userId, userId))
      await a.db
        .delete(chartSubmissions)
        .where(eq(chartSubmissions.musicId, musicId))
      await a.db
        .delete(musicSubmissions)
        .where(eq(musicSubmissions.musicId, musicId))
      await a.db.delete(musicCharts).where(eq(musicCharts.musicId, musicId))
      await a.db.delete(musics).where(eq(musics.id, musicId))
      await a.db.delete(user).where(eq(user.id, userId))
      await Promise.all([a.close(), b.close()])
    }
  })
})
