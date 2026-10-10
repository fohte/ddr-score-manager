import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

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

const scoreHistoryOutput = <TRecords, TMusic, TChart>(
  summaries: unknown[],
  records: TRecords,
  music: TMusic,
  chart: TChart,
) => ({ summaries, records, music, chart })

const catalogTrustOutput = <TPending, TApproved>(
  summaries: unknown[],
  pending: TPending,
  approved: TApproved,
) => ({ summaries, pending, approved })

describe('ScoreIngestService', () => {
  const getDb = setupDrizzleTx()

  it('stores only changes from the latest score and reports duplicate rows', async () => {
    const db = getDb()
    const userId = uniqueAlnumId('ingestuser')
    const musicId = uniqueAlnumId('ingestmusic')
    await insertUser(db, userId)

    const service = createScoreIngestService(
      db,
      createCatalogService(db, 2),
      createCatalogTrustPolicy('trusted@example.test'),
    )
    const ingest = (score: number) =>
      service.ingest({
        userId,
        userEmail: 'member@example.test',
        pages: [scoreListPage([scoreRow({ musicId, score })])],
      })

    const first = await ingest(900_000)
    const repeated = await ingest(900_000)
    const changed = await ingest(920_000)
    const returnedToEarlierValue = await ingest(900_000)
    const records = await db
      .select({
        score: scoreRecords.score,
        rank: scoreRecords.rank,
        clearType: scoreRecords.clearType,
        flareRank: scoreRecords.flareRank,
      })
      .from(scoreRecords)
      .where(eq(scoreRecords.userId, userId))
      .orderBy(scoreRecords.id)

    expect(
      scoreHistoryOutput(
        [
          first._unsafeUnwrap(),
          repeated._unsafeUnwrap(),
          changed._unsafeUnwrap(),
          returnedToEarlierValue._unsafeUnwrap(),
        ],
        records,
        normalizeMusic(await getMusic(db, musicId)),
        normalizeChart(await getChart(db, musicId, 'sp', 'basic')),
      ),
    ).toEqual({
      summaries: [
        { saved: 1, duplicates: 0 },
        { saved: 0, duplicates: 1 },
        { saved: 1, duplicates: 0 },
        { saved: 1, duplicates: 0 },
      ],
      records: [
        {
          score: 900_000,
          rank: 'AAA',
          clearType: null,
          flareRank: null,
        },
        {
          score: 920_000,
          rank: 'AAA',
          clearType: null,
          flareRank: null,
        },
        {
          score: 900_000,
          rank: 'AAA',
          clearType: null,
          flareRank: null,
        },
      ],
      music: {
        id: musicId,
        title: 'Test Music',
        artist: null,
        status: 'pending',
        approvedAt: null,
        createdAt: 'TIMESTAMP',
        updatedAt: 'TIMESTAMP',
      },
      chart: {
        musicId,
        playStyle: 'sp',
        difficulty: 'basic',
        level: null,
        status: 'pending',
        approvedAt: null,
      },
    })
  })

  it('derives catalog trust from the authenticated email and updates approved metadata', async () => {
    const db = getDb()
    const untrustedUserId = uniqueAlnumId('untrusted')
    const trustedUserId = uniqueAlnumId('trusted')
    const musicId = uniqueAlnumId('trustmusic')
    await insertUser(db, untrustedUserId)
    await insertUser(db, trustedUserId)

    const service = createScoreIngestService(
      db,
      createCatalogService(db, 2),
      createCatalogTrustPolicy('trusted@example.test'),
    )
    const pendingResult = await service.ingest({
      userId: untrustedUserId,
      userEmail: 'member@example.test',
      pages: [
        musicDetailPage({
          musicId,
          title: 'Initial Track',
          artist: 'Initial Artist',
        }),
      ],
    })
    const pending = {
      music: normalizeMusic(await getMusic(db, musicId)),
      chart: normalizeChart(await getChart(db, musicId, 'sp', 'basic')),
    }
    const approvedResult = await service.ingest({
      userId: trustedUserId,
      userEmail: 'TRUSTED@example.test',
      pages: [
        musicDetailPage({
          musicId,
          title: 'Approved Track',
          artist: 'Approved Artist',
          charts: [{ playStyle: 'sp', difficulty: 'basic', level: 14 }],
        }),
      ],
    })

    expect(
      catalogTrustOutput(
        [pendingResult._unsafeUnwrap(), approvedResult._unsafeUnwrap()],
        pending,
        {
          music: normalizeMusic(await getMusic(db, musicId)),
          chart: normalizeChart(await getChart(db, musicId, 'sp', 'basic')),
        },
      ),
    ).toEqual({
      summaries: [
        { saved: 0, duplicates: 0 },
        { saved: 0, duplicates: 0 },
      ],
      pending: {
        music: {
          id: musicId,
          title: 'Initial Track',
          artist: 'Initial Artist',
          status: 'pending',
          approvedAt: null,
          createdAt: 'TIMESTAMP',
          updatedAt: 'TIMESTAMP',
        },
        chart: {
          musicId,
          playStyle: 'sp',
          difficulty: 'basic',
          level: 10,
          status: 'pending',
          approvedAt: null,
        },
      },
      approved: {
        music: {
          id: musicId,
          title: 'Approved Track',
          artist: 'Approved Artist',
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
