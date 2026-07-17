import { and, eq } from 'drizzle-orm'
import type { Difficulty, PlayStyle } from 'parser'
import { describe, expect, it } from 'vitest'

import { createCatalogService } from '@/catalog/catalog-service'
import {
  insertUser,
  musicDetailPage,
  normalizeChart,
  normalizeMusic,
  scoreListPage,
  scoreRow,
} from '@/catalog/test/fixtures'
import type { CatalogRegisterInput } from '@/catalog/types'
import { musicCharts, musics, musicSubmissions } from '@/db/schema'
import { setupDrizzleTx } from '@/db/test/db'

const APPROVAL_THRESHOLD = 2

describe('CatalogService.register', () => {
  const getDb = setupDrizzleTx()

  const register = async (input: CatalogRegisterInput): Promise<void> => {
    const service = createCatalogService(getDb(), APPROVAL_THRESHOLD)
    await getDb().transaction((tx) => service.register(tx, input))
  }

  const getMusic = async (musicId: string) => {
    const [row] = await getDb()
      .select()
      .from(musics)
      .where(eq(musics.id, musicId))
    if (row === undefined) throw new Error(`music not found: ${musicId}`)
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
    if (row === undefined) {
      throw new Error(`chart not found: ${musicId}/${playStyle}/${difficulty}`)
    }
    return row
  }

  const getMusicSubmissions = async (musicId: string) =>
    getDb()
      .select({
        userId: musicSubmissions.userId,
        titleNormalized: musicSubmissions.titleNormalized,
      })
      .from(musicSubmissions)
      .where(eq(musicSubmissions.musicId, musicId))
      .orderBy(musicSubmissions.userId)

  describe('trusted submissions', () => {
    it('creates a new music/chart as approved with the submitted metadata', async () => {
      await insertUser(getDb(), 'trusted1')

      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [musicDetailPage()],
      })

      expect(normalizeMusic(await getMusic('abc123'))).toEqual({
        id: 'abc123',
        title: 'Test Music',
        artist: 'Test Artist',
        status: 'approved',
        approvedAt: 'SET',
        createdAt: 'TIMESTAMP',
        updatedAt: 'TIMESTAMP',
      })
      expect(normalizeChart(await getChart('abc123', 'sp', 'basic'))).toEqual({
        musicId: 'abc123',
        playStyle: 'sp',
        difficulty: 'basic',
        level: 10,
        status: 'approved',
        approvedAt: 'SET',
      })
    })

    it('overwrites existing metadata (title/artist/level) on re-submission', async () => {
      await insertUser(getDb(), 'trusted1')
      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [scoreListPage([scoreRow({ musicTitle: 'Old Title' })])],
      })

      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [
          musicDetailPage({
            title: 'New Title',
            artist: 'New Artist',
            charts: [{ playStyle: 'sp', difficulty: 'basic', level: 15 }],
          }),
        ],
      })

      expect((await getMusic('abc123')).title).toBe('New Title')
      expect((await getMusic('abc123')).artist).toBe('New Artist')
      expect((await getChart('abc123', 'sp', 'basic')).level).toBe(15)
    })
  })

  describe('untrusted submissions', () => {
    it('creates a new music/chart as pending and records the submission', async () => {
      await insertUser(getDb(), 'user1')

      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow()])],
      })

      expect(normalizeMusic(await getMusic('abc123'))).toEqual({
        id: 'abc123',
        title: 'Test Music',
        artist: null,
        status: 'pending',
        approvedAt: null,
        createdAt: 'TIMESTAMP',
        updatedAt: 'TIMESTAMP',
      })
      expect(normalizeChart(await getChart('abc123', 'sp', 'basic'))).toEqual({
        musicId: 'abc123',
        playStyle: 'sp',
        difficulty: 'basic',
        level: null,
        status: 'pending',
        approvedAt: null,
      })
      expect(await getMusicSubmissions('abc123')).toEqual([
        { userId: 'user1', titleNormalized: 'Test Music' },
      ])
    })

    it('does not change the title of an existing pending music', async () => {
      await insertUser(getDb(), 'user1')
      await insertUser(getDb(), 'user2')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow({ musicTitle: 'First Title' })])],
      })

      await register({
        userId: 'user2',
        trusted: false,
        pages: [scoreListPage([scoreRow({ musicTitle: 'Different Title' })])],
      })

      expect((await getMusic('abc123')).title).toBe('First Title')
      expect((await getMusic('abc123')).status).toBe('pending')
    })

    it('fills a null artist column on a pending music', async () => {
      await insertUser(getDb(), 'user1')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow()])],
      })

      await register({
        userId: 'user1',
        trusted: false,
        pages: [musicDetailPage({ artist: 'Backfilled Artist' })],
      })

      expect((await getMusic('abc123')).artist).toBe('Backfilled Artist')
    })

    it('does not modify metadata on an approved music', async () => {
      await insertUser(getDb(), 'trusted1')
      await insertUser(getDb(), 'user1')
      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [
          musicDetailPage({
            title: 'Approved Title',
            artist: 'Approved Artist',
          }),
        ],
      })

      await register({
        userId: 'user1',
        trusted: false,
        pages: [
          musicDetailPage({
            title: 'Forged Title',
            artist: 'Forged Artist',
            charts: [{ playStyle: 'sp', difficulty: 'basic', level: 5 }],
          }),
        ],
      })

      expect((await getMusic('abc123')).title).toBe('Approved Title')
      expect((await getMusic('abc123')).artist).toBe('Approved Artist')
      expect((await getChart('abc123', 'sp', 'basic')).level).toBe(10)
    })
  })

  describe('approval transitions', () => {
    it('approves a pending music immediately when a trusted sender submits the same entry', async () => {
      await insertUser(getDb(), 'user1')
      await insertUser(getDb(), 'trusted1')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow()])],
      })

      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [scoreListPage([scoreRow()])],
      })

      expect((await getMusic('abc123')).status).toBe('approved')
      expect(await getMusicSubmissions('abc123')).toEqual([])
    })

    it('approves and finalizes the title once matching-title submitters reach the threshold', async () => {
      await insertUser(getDb(), 'user1')
      await insertUser(getDb(), 'user2')
      await register({
        userId: 'user1',
        trusted: false,
        pages: [scoreListPage([scoreRow({ musicTitle: ' MAX  300 ' })])],
      })

      await register({
        userId: 'user2',
        trusted: false,
        pages: [scoreListPage([scoreRow({ musicTitle: 'MAX 300' })])],
      })

      expect((await getMusic('abc123')).status).toBe('approved')
      expect((await getMusic('abc123')).title).toBe('MAX 300')
      expect(await getMusicSubmissions('abc123')).toEqual([])
    })

    it('does not approve when submitted titles disagree', async () => {
      await insertUser(getDb(), 'user1')
      await insertUser(getDb(), 'user2')
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

      expect((await getMusic('abc123')).status).toBe('pending')
    })

    it('re-evaluates pending charts once their music becomes approved', async () => {
      await insertUser(getDb(), 'user1')
      await insertUser(getDb(), 'user2')
      await insertUser(getDb(), 'trusted1')
      // Two untrusted submitters agree on the chart but disagree on the
      // music title, so the chart submission count reaches the threshold
      // while the parent music itself stays pending (title mismatch).
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
      expect((await getMusic('abc123')).status).toBe('pending')
      expect((await getChart('abc123', 'sp', 'basic')).status).toBe('pending')

      await register({
        userId: 'trusted1',
        trusted: true,
        pages: [scoreListPage([scoreRow({ musicTitle: 'Title C' })])],
      })

      expect((await getMusic('abc123')).status).toBe('approved')
      expect((await getChart('abc123', 'sp', 'basic')).status).toBe('approved')
    })
  })
})
