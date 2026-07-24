import type { Difficulty, PlayStyle } from '@fohte/ddr-score-manager-parser'
import { and, eq, sql } from 'drizzle-orm'
import { err, ok, type Result, ResultAsync } from 'neverthrow'

import { type CatalogError, CatalogPersistenceError } from '@/catalog/errors'
import { coalesceApprovedAt } from '@/catalog/sql-helpers'
import { tryCatalog } from '@/catalog/try-catalog'
import type { Tx } from '@/db'
import { chartSubmissions, musicCharts } from '@/db/schema'

export const approveChartIfThresholdReached = (
  tx: Tx,
  musicId: string,
  playStyle: PlayStyle,
  difficulty: Difficulty,
  approvalThreshold: number,
): ResultAsync<void, CatalogError> =>
  tryCatalog(async (): Promise<Result<void, CatalogError>> => {
    const [result] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(chartSubmissions)
      .where(
        and(
          eq(chartSubmissions.musicId, musicId),
          eq(chartSubmissions.playStyle, playStyle),
          eq(chartSubmissions.difficulty, difficulty),
        ),
      )
    if (result === undefined) {
      return err(new CatalogPersistenceError('count query returned no row'))
    }

    if (result.count < approvalThreshold) return ok(undefined)

    await tx
      .update(musicCharts)
      .set({
        status: 'approved',
        approvedAt: coalesceApprovedAt(musicCharts.approvedAt),
      })
      .where(
        and(
          eq(musicCharts.musicId, musicId),
          eq(musicCharts.playStyle, playStyle),
          eq(musicCharts.difficulty, difficulty),
          eq(musicCharts.status, 'pending'),
        ),
      )
    await tx
      .delete(chartSubmissions)
      .where(
        and(
          eq(chartSubmissions.musicId, musicId),
          eq(chartSubmissions.playStyle, playStyle),
          eq(chartSubmissions.difficulty, difficulty),
        ),
      )
    return ok(undefined)
  }, 'failed to approve chart if threshold reached')

// 楽曲が承認されるまで、配下の pending 譜面は「楽曲が approved であること」
// という前提条件を満たせず判定を保留されていた。ここで前提条件を満たしたので
// 各譜面の閾値判定を再実行する。手動承認 (approve.ts) からも同じ理由で再利用する。
export const reevaluatePendingCharts = (
  tx: Tx,
  musicId: string,
  approvalThreshold: number,
): ResultAsync<void, CatalogError> =>
  tryCatalog(async (): Promise<Result<void, CatalogError>> => {
    const pending = await tx
      .select({
        playStyle: musicCharts.playStyle,
        difficulty: musicCharts.difficulty,
      })
      .from(musicCharts)
      .where(
        and(
          eq(musicCharts.musicId, musicId),
          eq(musicCharts.status, 'pending'),
        ),
      )

    for (const chart of pending) {
      const result = await approveChartIfThresholdReached(
        tx,
        musicId,
        chart.playStyle,
        chart.difficulty,
        approvalThreshold,
      )
      if (result.isErr()) return err(result.error)
    }
    return ok(undefined)
  }, 'failed to reevaluate pending charts')
