import type {
  Difficulty,
  ParsedMusicDetail,
  ParsedPage,
  ParsedScoreRow,
  PlayStyle,
} from '@fohte/ddr-score-manager-parser'
import { and, eq } from 'drizzle-orm'

import type { Db, Tx } from '@/db'
import { musicCharts, musics, scoreRecords, user } from '@/db/schema'

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

export const insertScoreRecord = async (
  db: Db | Tx,
  overrides: Partial<typeof scoreRecords.$inferInsert> & { userId: string },
): Promise<void> => {
  await db.insert(scoreRecords).values({
    musicId: 'abc123',
    playStyle: 'sp',
    difficulty: 'basic',
    score: 900_000,
    rank: 'AAA',
    ...overrides,
  })
}

// 実際にコミットするテスト用 (同時実行テストは 2 つの独立してコミットする
// 接続が必要なため、ロールバックするトランザクションフィクスチャを使えない):
// 実行のたびにユニークな英数字 ID を生成し、前回実行の残存行と衝突しないようにする。
export const uniqueAlnumId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

type MusicRow = typeof musics.$inferSelect
type ChartRow = typeof musicCharts.$inferSelect

export const getMusic = async (
  db: Db | Tx,
  musicId: string,
): Promise<MusicRow> => {
  const [row] = await db.select().from(musics).where(eq(musics.id, musicId))
  // eslint-disable-next-line no-restricted-syntax -- test helper outside vitest's *.test.ts/__tests__ convention
  if (row === undefined) throw new Error(`music not found: ${musicId}`)
  return row
}

export const getChart = async (
  db: Db | Tx,
  musicId: string,
  playStyle: PlayStyle,
  difficulty: Difficulty,
): Promise<ChartRow> => {
  const [row] = await db
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
    // eslint-disable-next-line no-restricted-syntax -- test helper outside vitest's *.test.ts/__tests__ convention
    throw new Error(`chart not found: ${musicId}/${playStyle}/${difficulty}`)
  }
  return row
}

// タイムスタンプは非決定的なので、リポジトリのテストコード規約に従い
// toEqual で単一のリテラルと比較できるよう、null か否かは保持しつつ
// 固定のプレースホルダーに正規化する。
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
