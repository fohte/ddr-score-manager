import { noopLogger } from '@fohte/service-kit/logger'
import { describe, expect, it } from 'vitest'

import { createApp } from '#app'
import { createCatalogService } from '#catalog/catalog-service'
import {
  insertScoreRecord,
  insertUser,
  musicDetailPage,
  scoreListPage,
  scoreRow,
} from '#catalog/test/fixtures'
import { runInTransaction } from '#catalog/transaction'
import type { CatalogRegisterInput } from '#catalog/types'
import type { Db } from '#db/index'
import { setupDrizzleTx } from '#db/test/db'
import { createScoreReadApi } from '#score-read-api'

const APPROVAL_THRESHOLD = 2

describe('ScoreReadApi', () => {
  const getDb = setupDrizzleTx()

  const createTestApp = (userId: string, db: Db) =>
    createApp({
      allowedEmails: `${userId}@example.test`,
      authHandler: () => Promise.resolve(Response.json({ status: 'auth' })),
      checkDb: () => Promise.resolve(),
      getApiKeyPermissions: () => Promise.resolve(null),
      getSession: () =>
        Promise.resolve({
          session: { id: 'reader-session' },
          user: { id: userId, email: `${userId}@example.test` },
        }),
      logger: noopLogger,
      scoreReadApi: createScoreReadApi(db, noopLogger),
    })

  const register = async (input: CatalogRegisterInput): Promise<void> => {
    const db = getDb()
    const service = createCatalogService(db, APPROVAL_THRESHOLD)
    const result = await runInTransaction(db, (tx) =>
      service.register(tx, input),
    )
    result._unsafeUnwrap()
  }

  const responseOutput = async (response: Response) => ({
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: await response.json(),
  })

  it('returns only the session user latest scores matching the filters', async () => {
    const db = getDb()
    await insertUser(db, 'reader')
    await insertUser(db, 'other')
    await register({
      userId: 'reader',
      trusted: true,
      pages: [
        scoreListPage([
          scoreRow({
            musicId: 'track001',
            musicTitle: 'Imaginary Track',
            playStyle: 'sp',
            difficulty: 'basic',
          }),
          scoreRow({
            musicId: 'track001',
            musicTitle: 'Imaginary Track',
            playStyle: 'dp',
            difficulty: 'expert',
          }),
        ]),
        musicDetailPage({
          musicId: 'track001',
          title: 'Imaginary Track',
          artist: 'Imaginary Artist',
          charts: [
            { playStyle: 'sp', difficulty: 'basic', level: 10 },
            { playStyle: 'dp', difficulty: 'expert', level: 12 },
          ],
        }),
      ],
    })

    await insertScoreRecord(db, {
      userId: 'reader',
      musicId: 'track001',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 900_000,
      rank: 'AA',
      recordedAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    await insertScoreRecord(db, {
      userId: 'reader',
      musicId: 'track001',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 950_000,
      rank: 'AAA',
      clearType: 'PFC',
      flareRank: 'EX',
      recordedAt: new Date('2025-02-01T00:00:00.000Z'),
    })
    await insertScoreRecord(db, {
      userId: 'reader',
      musicId: 'track001',
      playStyle: 'dp',
      difficulty: 'expert',
      score: 800_000,
      rank: 'A',
      recordedAt: new Date('2025-02-01T00:00:00.000Z'),
    })
    await insertScoreRecord(db, {
      userId: 'other',
      musicId: 'track001',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 999_999,
      rank: 'AAA',
      recordedAt: new Date('2025-03-01T00:00:00.000Z'),
    })

    const app = createTestApp('reader', db)
    const response = await app.request(
      '/api/scores?title=imaginary&playStyle=sp&difficulty=basic',
    )

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: {
        items: [
          {
            musicId: 'track001',
            title: 'Imaginary Track',
            playStyle: 'sp',
            difficulty: 'basic',
            level: 10,
            score: 950_000,
            rank: 'AAA',
            clearType: 'PFC',
            flareRank: 'EX',
            recordedAt: '2025-02-01T00:00:00.000Z',
          },
        ],
      },
    })
  })

  it('matches LIKE metacharacters literally in the title filter', async () => {
    const db = getDb()
    await insertUser(db, 'reader')
    await register({
      userId: 'reader',
      trusted: true,
      pages: [
        scoreListPage([
          scoreRow({
            musicId: 'literal01',
            musicTitle: '50% Song',
            playStyle: 'sp',
            difficulty: 'basic',
          }),
          scoreRow({
            musicId: 'near0001',
            musicTitle: '50x Song',
            playStyle: 'sp',
            difficulty: 'basic',
          }),
        ]),
        musicDetailPage({
          musicId: 'literal01',
          title: '50% Song',
          artist: 'Imaginary Artist',
          charts: [{ playStyle: 'sp', difficulty: 'basic', level: 10 }],
        }),
        musicDetailPage({
          musicId: 'near0001',
          title: '50x Song',
          artist: 'Imaginary Artist',
          charts: [{ playStyle: 'sp', difficulty: 'basic', level: 10 }],
        }),
      ],
    })
    await insertScoreRecord(db, {
      userId: 'reader',
      musicId: 'literal01',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 900_000,
      rank: 'AA',
      recordedAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    await insertScoreRecord(db, {
      userId: 'reader',
      musicId: 'near0001',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 850_000,
      rank: 'A',
      recordedAt: new Date('2025-01-01T00:00:00.000Z'),
    })

    const app = createTestApp('reader', db)
    const response = await app.request('/api/scores?title=%25')

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: {
        items: [
          {
            musicId: 'literal01',
            title: '50% Song',
            playStyle: 'sp',
            difficulty: 'basic',
            level: 10,
            score: 900_000,
            rank: 'AA',
            clearType: null,
            flareRank: null,
            recordedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    })
  })

  it('returns the session user score history for a visible pending music', async () => {
    const db = getDb()
    await insertUser(db, 'submitter')
    await insertUser(db, 'other')
    await register({
      userId: 'submitter',
      trusted: false,
      pages: [
        scoreListPage([
          scoreRow({
            musicId: 'pending01',
            musicTitle: 'Pending Track',
            playStyle: 'sp',
            difficulty: 'basic',
          }),
        ]),
        musicDetailPage({
          musicId: 'pending01',
          title: 'Pending Track',
          artist: 'Imaginary Artist',
          charts: [{ playStyle: 'sp', difficulty: 'basic', level: 10 }],
        }),
      ],
    })
    await insertScoreRecord(db, {
      userId: 'submitter',
      musicId: 'pending01',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 850_000,
      rank: 'AA',
      recordedAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    await insertScoreRecord(db, {
      userId: 'submitter',
      musicId: 'pending01',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 880_000,
      rank: 'AAA',
      recordedAt: new Date('2025-02-01T00:00:00.000Z'),
    })
    await insertScoreRecord(db, {
      userId: 'other',
      musicId: 'pending01',
      playStyle: 'sp',
      difficulty: 'basic',
      score: 999_999,
      rank: 'AAA',
      recordedAt: new Date('2025-03-01T00:00:00.000Z'),
    })

    const app = createTestApp('submitter', db)
    const response = await app.request('/api/musics/pending01')

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: {
        music: {
          id: 'pending01',
          title: 'Pending Track',
          artist: 'Imaginary Artist',
        },
        charts: [
          {
            playStyle: 'sp',
            difficulty: 'basic',
            level: 10,
            history: [
              {
                score: 850_000,
                rank: 'AA',
                clearType: null,
                flareRank: null,
                recordedAt: '2025-01-01T00:00:00.000Z',
              },
              {
                score: 880_000,
                rank: 'AAA',
                clearType: null,
                flareRank: null,
                recordedAt: '2025-02-01T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    })
  })

  it('hides a pending music from a user with no related score or submission', async () => {
    const db = getDb()
    await insertUser(db, 'submitter')
    await insertUser(db, 'stranger')
    await register({
      userId: 'submitter',
      trusted: false,
      pages: [
        scoreListPage([
          scoreRow({
            musicId: 'pending02',
            musicTitle: 'Another Pending Track',
          }),
        ]),
      ],
    })

    const app = createTestApp('stranger', db)
    const response = await app.request('/api/musics/pending02')

    expect(await responseOutput(response)).toEqual({
      status: 404,
      contentType: 'application/json',
      body: { error: 'Not Found' },
    })
  })

  it('returns an empty item list when a filter has no matches', async () => {
    const db = getDb()
    await insertUser(db, 'reader')

    const app = createTestApp('reader', db)
    const response = await app.request('/api/scores?title=no-such-track')

    expect(await responseOutput(response)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { items: [] },
    })
  })
})
