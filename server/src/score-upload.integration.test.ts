import { noopLogger } from '@fohte/service-kit/logger'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createApp } from '#app'
import { createCatalogService } from '#catalog/catalog-service'
import {
  getChart,
  getMusic,
  insertUser,
  musicDetailPage,
  normalizeChart,
  normalizeMusic,
  scoreListPage,
  scoreRow,
  uniqueAlnumId,
} from '#catalog/test/fixtures'
import { createCatalogTrustPolicy } from '#catalog/trust-policy'
import { scoreRecords } from '#db/schema/index'
import { setupDrizzleTx } from '#db/test/db'
import { createScoreIngestService } from '#score-ingest-service'
import { createScoreReadApi } from '#score-read-api'

const uploadIntegrationOutput = <TResponses, TRecords, TCatalog>(
  responses: TResponses,
  records: TRecords,
  catalog: TCatalog,
) => ({ responses, records, catalog })

describe('score upload API integration', () => {
  const getDb = setupDrizzleTx()

  it('saves a score through the API and registers its catalog entry using the trusted identity', async () => {
    const db = getDb()
    const userId = uniqueAlnumId('uploaduser')
    const musicId = uniqueAlnumId('uploadmusic')
    const userEmail = 'trusted@example.test'
    await insertUser(db, userId)

    const app = createApp({
      allowedEmails: userEmail,
      authHandler: () => Promise.resolve(Response.json({ status: 'auth' })),
      checkDb: () => Promise.resolve(),
      getApiKeyPermissions: () => Promise.resolve('{"upload":["create"]}'),
      getSession: () =>
        Promise.resolve({
          session: { id: 'upload-api-key' },
          user: { id: userId, email: userEmail },
        }),
      logger: noopLogger,
      scoreIngestService: createScoreIngestService(
        db,
        createCatalogService(db, 2),
        createCatalogTrustPolicy(userEmail),
      ),
      scoreReadApi: createScoreReadApi(db, noopLogger),
    })
    const body = JSON.stringify({
      pages: [
        scoreListPage([scoreRow({ musicId, musicTitle: 'Score Title' })]),
        musicDetailPage({
          musicId,
          title: 'Catalog Title',
          artist: 'Catalog Artist',
          charts: [{ playStyle: 'sp', difficulty: 'basic', level: 14 }],
        }),
      ],
    })
    const request = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'example-api-key',
      },
      body,
    }
    const firstResponse = await app.request('/api/scores/upload', request)
    const secondResponse = await app.request('/api/scores/upload', request)
    const records = await db
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

    expect(
      uploadIntegrationOutput(
        [
          {
            status: firstResponse.status,
            body: await firstResponse.json(),
          },
          {
            status: secondResponse.status,
            body: await secondResponse.json(),
          },
        ],
        records,
        {
          music: normalizeMusic(await getMusic(db, musicId)),
          chart: normalizeChart(await getChart(db, musicId, 'sp', 'basic')),
        },
      ),
    ).toEqual({
      responses: [
        { status: 200, body: { saved: 1, duplicates: 0 } },
        { status: 200, body: { saved: 0, duplicates: 1 } },
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
      catalog: {
        music: {
          id: musicId,
          title: 'Catalog Title',
          artist: 'Catalog Artist',
          status: 'approved',
          approvedAt: 'SET',
          createdAt: 'TIMESTAMP',
          updatedAt: 'TIMESTAMP',
        },
        chart: {
          musicId,
          playStyle: 'sp',
          difficulty: 'basic',
          level: 14,
          status: 'approved',
          approvedAt: 'SET',
        },
      },
    })
  })
})
