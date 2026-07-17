import { and, eq } from 'drizzle-orm'
import type { Difficulty, PlayStyle } from 'parser'
import { describe, expect, it } from 'vitest'

import { createCatalogService } from '@/catalog/catalog-service'
import { insertUser, scoreListPage, scoreRow } from '@/catalog/test/fixtures'
import type { CatalogRegisterInput } from '@/catalog/types'
import { musicCharts, musics, musicSubmissions } from '@/db/schema'
import { setupDrizzleTx } from '@/db/test/db'

const APPROVAL_THRESHOLD = 2

describe('CatalogService.approve / listPending', () => {
  const getDb = setupDrizzleTx()

  const service = () => createCatalogService(getDb(), APPROVAL_THRESHOLD)

  const register = async (input: CatalogRegisterInput): Promise<void> => {
    await getDb().transaction((tx) => service().register(tx, input))
  }

  const getMusic = async (musicId: string) => {
    const [row] = await getDb()
      .select()
      .from(musics)
      .where(eq(musics.id, musicId))
    return row
  }

  const getChart = async (
    musicId: string,
    playStyle: PlayStyle,
    difficulty: Difficulty,
  ) => {
    const [row] = await getDb()
      .select()
      .from(musicCharts)
      .where(
        and(
          eq(musicCharts.musicId, musicId),
          eq(musicCharts.playStyle, playStyle),
          eq(musicCharts.difficulty, difficulty),
        ),
      )
    return row
  }

  describe('approve', () => {
    it('approves a pending music by id and deletes its submissions', async () => {
      await insertUser(getDb(), 'user1')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(await service().approve({ musicIds: ['abc123'] })).toEqual({
        approvedMusics: 1,
        approvedCharts: 0,
      })
      expect((await getMusic('abc123'))?.status).toBe('approved')
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

      expect(await service().approve({ musicIds: ['abc123'] })).toEqual({
        approvedMusics: 0,
        approvedCharts: 0,
      })
    })

    it('ignores a nonexistent music id', async () => {
      expect(await service().approve({ musicIds: ['missing'] })).toEqual({
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
      // Simulate a chart that's still pending under an already-approved
      // music (e.g. a later untrusted submission added a new chart).
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
        await service().approve({
          charts: [{ musicId: 'abc123', playStyle: 'sp', difficulty: 'basic' }],
        }),
      ).toEqual({ approvedMusics: 0, approvedCharts: 1 })
      expect((await getChart('abc123', 'sp', 'basic'))?.status).toBe('approved')
    })

    it('ignores a chart whose parent music is still pending', async () => {
      await insertUser(getDb(), 'user1')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(
        await service().approve({
          charts: [{ musicId: 'abc123', playStyle: 'sp', difficulty: 'basic' }],
        }),
      ).toEqual({ approvedMusics: 0, approvedCharts: 0 })
      expect((await getChart('abc123', 'sp', 'basic'))?.status).toBe('pending')
    })

    it('ignores an already-approved chart', async () => {
      await insertUser(getDb(), 'trusted1')
      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(
        await service().approve({
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
      // Titles disagree so the music (and thus its chart) stays pending
      // across all three submissions.
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

      const pending = await service().listPending()

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
      expect(await service().listPending()).toEqual({
        musics: [],
        charts: [],
      })
    })
  })
})
