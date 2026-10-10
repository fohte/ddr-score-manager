import type {
  ParsedPage,
  ParsedScoreRow,
} from '@fohte/ddr-score-manager-parser'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { err, ok, type Result, ResultAsync } from 'neverthrow'

import { type CatalogError, CatalogPersistenceError } from '#catalog/errors'
import { runInTransaction } from '#catalog/transaction'
import type { CatalogTrustPolicy } from '#catalog/trust-policy'
import type { CatalogService } from '#catalog/types'
import type { Db, Tx } from '#db/index'
import { scoreRecords } from '#db/schema/index'

interface ScoreIngestInput {
  userId: string
  userEmail: string
  pages: ParsedPage[]
}

export interface ScoreIngestSummary {
  saved: number
  duplicates: number
}

export interface ScoreIngestService {
  ingest(input: ScoreIngestInput): ResultAsync<ScoreIngestSummary, CatalogError>
}

type ScoreValues = Pick<
  ParsedScoreRow,
  'score' | 'rank' | 'clearType' | 'flareRank'
>

type ChartKeyInput = {
  musicId: string
  playStyle: string
  difficulty: string
}

const chartKey = (chart: ChartKeyInput): string =>
  JSON.stringify([chart.musicId, chart.playStyle, chart.difficulty])

const sameScore = (left: ScoreValues, right: ScoreValues): boolean =>
  left.score === right.score &&
  left.rank === right.rank &&
  left.clearType === right.clearType &&
  left.flareRank === right.flareRank

const ingestInTransaction = async (
  tx: Tx,
  input: ScoreIngestInput,
  catalogService: CatalogService,
  trustPolicy: CatalogTrustPolicy,
): Promise<Result<ScoreIngestSummary, CatalogError>> => {
  // 同一ユーザーの比較と追記を直列化し、並行再送の重複保存を防ぐ。
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
  )

  const catalogResult = await catalogService.register(tx, {
    userId: input.userId,
    trusted: trustPolicy.isTrusted(input.userEmail),
    pages: input.pages,
  })
  if (catalogResult.isErr()) return err(catalogResult.error)

  const rows = input.pages.flatMap((page) =>
    page.pageType === 'scoreList' ? page.rows : [],
  )
  const musicIds = [...new Set(rows.map((row) => row.musicId))]
  const latestScores =
    musicIds.length === 0
      ? []
      : await tx
          .selectDistinctOn(
            [
              scoreRecords.musicId,
              scoreRecords.playStyle,
              scoreRecords.difficulty,
            ],
            {
              musicId: scoreRecords.musicId,
              playStyle: scoreRecords.playStyle,
              difficulty: scoreRecords.difficulty,
              score: scoreRecords.score,
              rank: scoreRecords.rank,
              clearType: scoreRecords.clearType,
              flareRank: scoreRecords.flareRank,
            },
          )
          .from(scoreRecords)
          .where(
            and(
              eq(scoreRecords.userId, input.userId),
              inArray(scoreRecords.musicId, musicIds),
            ),
          )
          .orderBy(
            scoreRecords.musicId,
            scoreRecords.playStyle,
            scoreRecords.difficulty,
            desc(scoreRecords.id),
          )

  const latestByChart = new Map<string, ScoreValues>()
  for (const score of latestScores) {
    latestByChart.set(chartKey(score), score)
  }

  const newRecords: (typeof scoreRecords.$inferInsert)[] = []
  let duplicates = 0
  for (const row of rows) {
    const key = chartKey(row)
    const latest = latestByChart.get(key)
    if (latest !== undefined && sameScore(latest, row)) {
      duplicates += 1
      continue
    }

    newRecords.push({
      userId: input.userId,
      musicId: row.musicId,
      playStyle: row.playStyle,
      difficulty: row.difficulty,
      score: row.score,
      rank: row.rank,
      clearType: row.clearType,
      flareRank: row.flareRank,
    })
    latestByChart.set(key, row)
  }

  if (newRecords.length > 0) {
    await tx.insert(scoreRecords).values(newRecords)
  }

  return ok({ saved: newRecords.length, duplicates })
}

export const createScoreIngestService = (
  db: Db,
  catalogService: CatalogService,
  trustPolicy: CatalogTrustPolicy,
): ScoreIngestService => ({
  ingest: (input) =>
    runInTransaction(db, (tx) =>
      ResultAsync.fromPromise(
        ingestInTransaction(tx, input, catalogService, trustPolicy),
        (cause: unknown) =>
          new CatalogPersistenceError('failed to ingest scores', cause),
      ).andThen((result) => result),
    ),
})
