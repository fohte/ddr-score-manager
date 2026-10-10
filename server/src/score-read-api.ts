import type { Difficulty, PlayStyle } from '@fohte/ddr-score-manager-parser'
import type { Logger } from '@fohte/service-kit/logger'
import { and, asc, desc, eq, ilike, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { okAsync, ResultAsync } from 'neverthrow'

import type { AuthMiddlewareEnvironment } from '#auth-middleware'
import { isMusicVisibleToUser } from '#catalog/visibility'
import type { Db } from '#db/index'
import { musicCharts, musics, scoreRecords } from '#db/schema/index'

interface ScoreListItem {
  musicId: string
  title: string
  playStyle: PlayStyle
  difficulty: Difficulty
  level: number | null
  score: number
  rank: string
  clearType: string | null
  flareRank: string | null
  recordedAt: string
}

interface MusicScoresResponse {
  music: { id: string; title: string; artist: string | null }
  charts: {
    playStyle: PlayStyle
    difficulty: Difficulty
    level: number | null
    history: {
      score: number
      rank: string
      clearType: string | null
      flareRank: string | null
      recordedAt: string
    }[]
  }[]
}

const playStyles = ['sp', 'dp'] as const satisfies readonly PlayStyle[]
const difficulties = [
  'beginner',
  'basic',
  'difficult',
  'expert',
  'challenge',
] as const satisfies readonly Difficulty[]

const isPlayStyle = (value: string): value is PlayStyle =>
  playStyles.some((playStyle) => playStyle === value)

const isDifficulty = (value: string): value is Difficulty =>
  difficulties.some((difficulty) => difficulty === value)

const escapeLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&')

const fromQuery = <T>(promise: Promise<T>): ResultAsync<T, unknown> =>
  ResultAsync.fromPromise(promise, (error: unknown) => error)

const listScores = (
  db: Db,
  userId: string,
  filters: {
    title: string | undefined
    playStyle: PlayStyle | undefined
    difficulty: Difficulty | undefined
  },
): ResultAsync<{ items: ScoreListItem[] }, unknown> =>
  fromQuery(
    (async () => {
      const conditions: SQL[] = [eq(scoreRecords.userId, userId)]
      if (filters.title !== undefined && filters.title !== '') {
        conditions.push(
          ilike(musics.title, `%${escapeLikePattern(filters.title)}%`),
        )
      }
      if (filters.playStyle !== undefined) {
        conditions.push(eq(scoreRecords.playStyle, filters.playStyle))
      }
      if (filters.difficulty !== undefined) {
        conditions.push(eq(scoreRecords.difficulty, filters.difficulty))
      }

      const rows = await db
        .selectDistinctOn(
          [
            scoreRecords.musicId,
            scoreRecords.playStyle,
            scoreRecords.difficulty,
          ],
          {
            musicId: scoreRecords.musicId,
            title: musics.title,
            playStyle: musicCharts.playStyle,
            difficulty: musicCharts.difficulty,
            level: musicCharts.level,
            score: scoreRecords.score,
            rank: scoreRecords.rank,
            clearType: scoreRecords.clearType,
            flareRank: scoreRecords.flareRank,
            recordedAt: scoreRecords.recordedAt,
          },
        )
        .from(scoreRecords)
        .innerJoin(musics, eq(scoreRecords.musicId, musics.id))
        .innerJoin(
          musicCharts,
          and(
            eq(scoreRecords.musicId, musicCharts.musicId),
            eq(scoreRecords.playStyle, musicCharts.playStyle),
            eq(scoreRecords.difficulty, musicCharts.difficulty),
          ),
        )
        .where(and(...conditions))
        .orderBy(
          scoreRecords.musicId,
          scoreRecords.playStyle,
          scoreRecords.difficulty,
          desc(scoreRecords.id),
        )

      return {
        items: rows.map((row) => ({
          ...row,
          recordedAt: row.recordedAt.toISOString(),
        })),
      }
    })(),
  )

const getMusicScores = (
  db: Db,
  musicId: string,
  userId: string,
): ResultAsync<MusicScoresResponse | null, unknown> =>
  isMusicVisibleToUser(db, musicId, userId).andThen((isVisible) => {
    if (!isVisible) return okAsync<MusicScoresResponse | null, unknown>(null)

    return fromQuery(
      (async () => {
        const [music] = await db
          .select({ id: musics.id, title: musics.title, artist: musics.artist })
          .from(musics)
          .where(eq(musics.id, musicId))
        if (music === undefined) return null

        const rows = await db
          .select({
            playStyle: musicCharts.playStyle,
            difficulty: musicCharts.difficulty,
            level: musicCharts.level,
            score: scoreRecords.score,
            rank: scoreRecords.rank,
            clearType: scoreRecords.clearType,
            flareRank: scoreRecords.flareRank,
            recordedAt: scoreRecords.recordedAt,
            id: scoreRecords.id,
          })
          .from(scoreRecords)
          .innerJoin(
            musicCharts,
            and(
              eq(scoreRecords.musicId, musicCharts.musicId),
              eq(scoreRecords.playStyle, musicCharts.playStyle),
              eq(scoreRecords.difficulty, musicCharts.difficulty),
            ),
          )
          .where(
            and(
              eq(scoreRecords.userId, userId),
              eq(scoreRecords.musicId, musicId),
            ),
          )
          .orderBy(
            scoreRecords.playStyle,
            scoreRecords.difficulty,
            asc(scoreRecords.recordedAt),
            asc(scoreRecords.id),
          )

        const charts = new Map<string, MusicScoresResponse['charts'][number]>()
        for (const row of rows) {
          const key = `${row.playStyle}/${row.difficulty}`
          let chart = charts.get(key)
          if (chart === undefined) {
            const newChart: MusicScoresResponse['charts'][number] = {
              playStyle: row.playStyle,
              difficulty: row.difficulty,
              level: row.level,
              history: [],
            }
            charts.set(key, newChart)
            chart = newChart
          }
          chart.history.push({
            score: row.score,
            rank: row.rank,
            clearType: row.clearType,
            flareRank: row.flareRank,
            recordedAt: row.recordedAt.toISOString(),
          })
        }

        return { music, charts: [...charts.values()] }
      })(),
    )
  })

export const createScoreReadApi = (db: Db, logger: Logger) => {
  const api = new Hono<AuthMiddlewareEnvironment>()

  return api
    .get('/scores', async (c) => {
      const title = c.req.query('title')
      const rawPlayStyle = c.req.query('playStyle')
      const rawDifficulty = c.req.query('difficulty')
      if (
        (rawPlayStyle !== undefined && !isPlayStyle(rawPlayStyle)) ||
        (rawDifficulty !== undefined && !isDifficulty(rawDifficulty))
      ) {
        return c.json({ items: [] })
      }

      const result = await listScores(db, c.var.userId, {
        title,
        playStyle: rawPlayStyle,
        difficulty: rawDifficulty,
      })
      if (result.isErr()) {
        logger.error({ err: result.error }, 'failed to list scores')
        return c.json({ error: 'Internal Server Error' }, 500)
      }

      return c.json(result.value)
    })
    .get('/musics/:musicId', async (c) => {
      const result = await getMusicScores(
        db,
        c.req.param('musicId'),
        c.var.userId,
      )
      if (result.isErr()) {
        logger.error({ err: result.error }, 'failed to get music scores')
        return c.json({ error: 'Internal Server Error' }, 500)
      }
      if (result.value === null) return c.json({ error: 'Not Found' }, 404)

      return c.json(result.value)
    })
}

export type ScoreReadApi = ReturnType<typeof createScoreReadApi>
