import { and, eq, sql } from 'drizzle-orm'
import { err, ok, type Result, ResultAsync } from 'neverthrow'

import { reevaluatePendingCharts } from '#catalog/chart-approval'
import { type CatalogError, CatalogPersistenceError } from '#catalog/errors'
import { runInTransaction } from '#catalog/transaction'
import { tryCatalog } from '#catalog/try-catalog'
import type {
  CatalogApproveRequest,
  CatalogApproveResponse,
  PendingCatalogResponse,
} from '#catalog/types'
import type { Db } from '#db/index'
import {
  chartSubmissions,
  musicCharts,
  musics,
  musicSubmissions,
} from '#db/schema/index'

export const approveCatalogEntries = (
  db: Db,
  input: CatalogApproveRequest,
  approvalThreshold: number,
): ResultAsync<CatalogApproveResponse, CatalogError> =>
  runInTransaction(db, (tx) =>
    tryCatalog(
      async (): Promise<Result<CatalogApproveResponse, CatalogError>> => {
        let approvedMusics = 0
        for (const musicId of input.musicIds ?? []) {
          const [approved] = await tx
            .update(musics)
            .set({ status: 'approved', approvedAt: new Date() })
            .where(and(eq(musics.id, musicId), eq(musics.status, 'pending')))
            .returning({ id: musics.id })
          if (approved === undefined) continue // 存在しない・既に approved は無視 (冪等)

          approvedMusics++
          await tx
            .delete(musicSubmissions)
            .where(eq(musicSubmissions.musicId, musicId))
          const result = await reevaluatePendingCharts(
            tx,
            musicId,
            approvalThreshold,
          )
          if (result.isErr()) return err(result.error)
        }

        let approvedCharts = 0
        for (const chart of input.charts ?? []) {
          // 譜面の承認は楽曲が既に approved であることを前提とする。
          const [music] = await tx
            .select({ status: musics.status })
            .from(musics)
            .where(eq(musics.id, chart.musicId))
          if (music === undefined || music.status !== 'approved') continue

          const [approved] = await tx
            .update(musicCharts)
            .set({ status: 'approved', approvedAt: new Date() })
            .where(
              and(
                eq(musicCharts.musicId, chart.musicId),
                eq(musicCharts.playStyle, chart.playStyle),
                eq(musicCharts.difficulty, chart.difficulty),
                eq(musicCharts.status, 'pending'),
              ),
            )
            .returning({ musicId: musicCharts.musicId })
          if (approved === undefined) continue // 存在しない・既に approved は無視 (冪等)

          approvedCharts++
          await tx
            .delete(chartSubmissions)
            .where(
              and(
                eq(chartSubmissions.musicId, chart.musicId),
                eq(chartSubmissions.playStyle, chart.playStyle),
                eq(chartSubmissions.difficulty, chart.difficulty),
              ),
            )
        }

        return ok({ approvedMusics, approvedCharts })
      },
      'failed to approve catalog entries',
    ),
  )

export const listPendingCatalogEntries = (
  db: Db,
): ResultAsync<PendingCatalogResponse, CatalogError> =>
  ResultAsync.fromPromise(
    (async (): Promise<PendingCatalogResponse> => {
      const pendingMusics = await db
        .select({
          id: musics.id,
          title: musics.title,
          createdAt: musics.createdAt,
          submitterCount: sql<number>`count(${musicSubmissions.userId})::int`,
        })
        .from(musics)
        .leftJoin(musicSubmissions, eq(musicSubmissions.musicId, musics.id))
        .where(eq(musics.status, 'pending'))
        .groupBy(musics.id, musics.title, musics.createdAt)

      const pendingCharts = await db
        .select({
          musicId: musicCharts.musicId,
          playStyle: musicCharts.playStyle,
          difficulty: musicCharts.difficulty,
          submitterCount: sql<number>`count(${chartSubmissions.userId})::int`,
        })
        .from(musicCharts)
        .leftJoin(
          chartSubmissions,
          and(
            eq(chartSubmissions.musicId, musicCharts.musicId),
            eq(chartSubmissions.playStyle, musicCharts.playStyle),
            eq(chartSubmissions.difficulty, musicCharts.difficulty),
          ),
        )
        .where(eq(musicCharts.status, 'pending'))
        .groupBy(
          musicCharts.musicId,
          musicCharts.playStyle,
          musicCharts.difficulty,
        )

      return {
        musics: pendingMusics.map((m) => ({
          id: m.id,
          title: m.title,
          submitterCount: m.submitterCount,
          createdAt: m.createdAt.toISOString(),
        })),
        charts: pendingCharts.map((c) => ({
          musicId: c.musicId,
          playStyle: c.playStyle,
          difficulty: c.difficulty,
          submitterCount: c.submitterCount,
        })),
      }
    })(),
    (caughtErr) =>
      new CatalogPersistenceError(
        'failed to list pending catalog entries',
        caughtErr,
      ),
  )
