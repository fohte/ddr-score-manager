import type { Difficulty, PlayStyle } from '@fohte/ddr-score-manager-parser'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createCatalogService } from '#catalog/catalog-service'
import {
  getChart as getChartRow,
  getMusic as getMusicRow,
  insertUser,
  normalizeChart,
  normalizeMusic,
  scoreListPage,
  scoreRow,
} from '#catalog/test/fixtures'
import { runInTransaction } from '#catalog/transaction'
import type {
  CatalogApproveRequest,
  CatalogApproveResponse,
  CatalogRegisterInput,
  PendingCatalogResponse,
} from '#catalog/types'
import { musicCharts, musicSubmissions } from '#db/schema/index'
import { setupDrizzleTx } from '#db/test/db'

const APPROVAL_THRESHOLD = 2

describe('CatalogService.approve / listPending', () => {
  const getDb = setupDrizzleTx()

  const service = () => createCatalogService(getDb(), APPROVAL_THRESHOLD)

  const register = async (input: CatalogRegisterInput): Promise<void> => {
    const result = await runInTransaction(getDb(), (tx) =>
      service().register(tx, input),
    )
    result._unsafeUnwrap()
  }

  const approve = async (
    input: CatalogApproveRequest,
  ): Promise<CatalogApproveResponse> =>
    (await service().approve(input))._unsafeUnwrap()

  const listPending = async (): Promise<PendingCatalogResponse> =>
    (await service().listPending())._unsafeUnwrap()

  const getMusic = (musicId: string) => getMusicRow(getDb(), musicId)

  const getChart = (
    musicId: string,
    playStyle: PlayStyle,
    difficulty: Difficulty,
  ) => getChartRow(getDb(), musicId, playStyle, difficulty)

  describe('approve', () => {
    it('approves a pending music by id and deletes its submissions', async () => {
      await insertUser(getDb(), 'user1')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(await approve({ musicIds: ['abc123'] })).toEqual({
        approvedMusics: 1,
        approvedCharts: 0,
      })
      expect(normalizeMusic(await getMusic('abc123'))).toEqual({
        id: 'abc123',
        title: 'Test Music',
        artist: null,
        status: 'approved',
        approvedAt: 'SET',
        createdAt: 'TIMESTAMP',
        updatedAt: 'TIMESTAMP',
      })
      expect(
        await getDb()
          .select()
          .from(musicSubmissions)
          .where(eq(musicSubmissions.musicId, 'abc123')),
      ).toEqual([])
    })

    it('is idempotent for an already-approved music', async () => {
      await insertUser(getDb(), 'trusted1')
      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(await approve({ musicIds: ['abc123'] })).toEqual({
        approvedMusics: 0,
        approvedCharts: 0,
      })
    })

    it('ignores a nonexistent music id', async () => {
      expect(await approve({ musicIds: ['missing'] })).toEqual({
        approvedMusics: 0,
        approvedCharts: 0,
      })
    })

    it('approves a chart only when its parent music is already approved', async () => {
      await insertUser(getDb(), 'trusted1')
      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [scoreListPage([scoreRow()])],
      })
      // 既に approved な楽曲の配下で、譜面がまだ pending のままのケースを
      // シミュレートする (例: 後から非信頼ユーザーが新しい譜面を追加した場合)。
      await getDb()
        .update(musicCharts)
        .set({ status: 'pending', approvedAt: null })
        .where(
          and(
            eq(musicCharts.musicId, 'abc123'),
            eq(musicCharts.playStyle, 'sp'),
            eq(musicCharts.difficulty, 'basic'),
          ),
        )

      expect(
        await approve({
          charts: [{ musicId: 'abc123', playStyle: 'sp', difficulty: 'basic' }],
        }),
      ).toEqual({ approvedMusics: 0, approvedCharts: 1 })
      expect(normalizeChart(await getChart('abc123', 'sp', 'basic'))).toEqual({
        musicId: 'abc123',
        playStyle: 'sp',
        difficulty: 'basic',
        level: null,
        status: 'approved',
        approvedAt: 'SET',
      })
    })

    it('ignores a chart whose parent music is still pending', async () => {
      await insertUser(getDb(), 'user1')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(
        await approve({
          charts: [{ musicId: 'abc123', playStyle: 'sp', difficulty: 'basic' }],
        }),
      ).toEqual({ approvedMusics: 0, approvedCharts: 0 })
      expect(normalizeChart(await getChart('abc123', 'sp', 'basic'))).toEqual({
        musicId: 'abc123',
        playStyle: 'sp',
        difficulty: 'basic',
        level: null,
        status: 'pending',
        approvedAt: null,
      })
    })

    it('ignores an already-approved chart', async () => {
      await insertUser(getDb(), 'trusted1')
      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(
        await approve({
          charts: [{ musicId: 'abc123', playStyle: 'sp', difficulty: 'basic' }],
        }),
      ).toEqual({ approvedMusics: 0, approvedCharts: 0 })
    })
  })

  describe('listPending', () => {
    it('lists pending musics and charts with submitter counts', async () => {
      await insertUser(getDb(), 'user1')
      await insertUser(getDb(), 'user2')
      await insertUser(getDb(), 'user3')
      // タイトルが食い違うため、3 人分の送信を通じて楽曲 (およびその譜面) は
      // pending のままになる。
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow({ musicTitle: 'Title A' })])],
      })
      await register({
        userId: 'user2',
        trusted: false,
        pages: [scoreListPage([scoreRow({ musicTitle: 'Title B' })])],
      })
      await register({
        userId: 'user3',
        trusted: false,
        pages: [scoreListPage([scoreRow({ musicTitle: 'Title C' })])],
      })

      const pending = await listPending()

      expect(
        pending.musics.map((m) => ({ ...m, createdAt: 'TIMESTAMP' })),
      ).toEqual([
        {
          id: 'abc123',
          title: 'Title A',
          submitterCount: 3,
          createdAt: 'TIMESTAMP',
        },
      ])
      expect(pending.charts).toEqual([
        {
          musicId: 'abc123',
          playStyle: 'sp',
          difficulty: 'basic',
          submitterCount: 3,
        },
      ])
    })

    it('returns empty lists when nothing is pending', async () => {
      expect(await listPending()).toEqual({
        musics: [],
        charts: [],
      })
    })
  })
})
