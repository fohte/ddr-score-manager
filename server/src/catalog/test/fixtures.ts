import type { ParsedMusicDetail, ParsedPage, ParsedScoreRow } from 'parser'

import type { Db, Tx } from '@/db'
import { musicCharts, musics, user } from '@/db/schema'

export const scoreRow = (
  overrides: Partial<ParsedScoreRow> = {},
): ParsedScoreRow => ({
  musicId: 'abc123',
  musicTitle: 'Test Music',
  playStyle: 'sp',
  difficulty: 'basic',
  score: 900_000,
  rank: 'AAA',
  clearType: null,
  flareRank: null,
  ...overrides,
})

export const scoreListPage = (rows: ParsedScoreRow[]): ParsedPage => ({
  pageType: 'scoreList',
  rows,
})

export const musicDetail = (
  overrides: Partial<ParsedMusicDetail> = {},
): ParsedMusicDetail => ({
  musicId: 'abc123',
  title: 'Test Music',
  artist: 'Test Artist',
  charts: [{ playStyle: 'sp', difficulty: 'basic', level: 10 }],
  ...overrides,
})

export const musicDetailPage = (
  overrides: Partial<ParsedMusicDetail> = {},
): ParsedPage => ({
  pageType: 'musicDetail',
  detail: musicDetail(overrides),
})

export const insertUser = async (db: Db | Tx, id: string): Promise<void> => {
  await db
    .insert(user)
    .values({ id, name: 'Test User', email: `${id}@example.com` })
}

// For tests that commit for real (concurrency tests can't use the
// rollback-per-test tx fixture, since they need two independently
// committing connections): a per-run unique, alnum-only id so reruns don't
// collide with rows a previous run left behind.
export const uniqueAlnumId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

type MusicRow = typeof musics.$inferSelect
type ChartRow = typeof musicCharts.$inferSelect

// Timestamps are non-deterministic, so tests compare against a single
// literal via toEqual (per the repo's test-code rules) by normalizing them
// to a fixed placeholder first, while still asserting null-vs-set.
export const normalizeMusic = (
  music: MusicRow,
): Omit<MusicRow, 'approvedAt' | 'createdAt' | 'updatedAt'> & {
  approvedAt: 'SET' | null
  createdAt: 'TIMESTAMP'
  updatedAt: 'TIMESTAMP'
} => ({
  ...music,
  approvedAt: music.approvedAt !== null ? 'SET' : null,
  createdAt: 'TIMESTAMP',
  updatedAt: 'TIMESTAMP',
})

export const normalizeChart = (
  chart: ChartRow,
): Omit<ChartRow, 'approvedAt'> & { approvedAt: 'SET' | null } => ({
  ...chart,
  approvedAt: chart.approvedAt !== null ? 'SET' : null,
})
