import type { Difficulty, PlayStyle } from '@fohte/ddr-score-manager-parser'
import { and, eq, sql } from 'drizzle-orm'
import { err, ok, type Result, ResultAsync } from 'neverthrow'

import {
  aggregateMusicUpdates,
  type MusicUpdate,
} from '#catalog/aggregate-music-updates'
import {
  approveChartIfThresholdReached,
  reevaluatePendingCharts,
} from '#catalog/chart-approval'
import { type CatalogError, CatalogPersistenceError } from '#catalog/errors'
import { normalizeTitle } from '#catalog/normalize-title'
import {
  coalesceApprovedAt,
  fillIfPendingAndNull,
  keepIfUndefined,
} from '#catalog/sql-helpers'
import { tryCatalog } from '#catalog/try-catalog'
import type { CatalogRegisterInput } from '#catalog/types'
import type { Tx } from '#db/index'
import {
  chartSubmissions,
  musicCharts,
  musics,
  musicSubmissions,
} from '#db/schema/index'

interface MusicRow {
  id: string
  title: string
  status: string
}

// INSERT ... ON CONFLICT 自体が、本モジュールの承認閾値集計が依拠する行ロックを
// 取得する。そのため同一トランザクション内でこの楽曲の送信記録・status を
// 読み取る後続処理は、常に一貫した直列化されたビューを観測できる。
const upsertMusic = (
  tx: Tx,
  params: {
    musicId: string
    title: string
    artist: string | undefined
    trusted: boolean
  },
): ResultAsync<MusicRow, CatalogError> =>
  tryCatalog(async (): Promise<Result<MusicRow, CatalogError>> => {
    const { musicId, title, artist, trusted } = params

    if (trusted) {
      const [row] = await tx
        .insert(musics)
        .values({
          id: musicId,
          title,
          artist: artist ?? null,
          status: 'approved',
          approvedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: musics.id,
          set: {
            title,
            artist: keepIfUndefined(artist, musics.artist),
            status: 'approved',
            approvedAt: coalesceApprovedAt(musics.approvedAt),
          },
        })
        .returning({
          id: musics.id,
          title: musics.title,
          status: musics.status,
        })
      if (row === undefined) {
        return err(new CatalogPersistenceError('musics upsert returned no row'))
      }
      return ok(row)
    }

    // 非信頼ユーザーは pending エントリの null 列 (artist 等) の補完のみ行える。
    // title の変更は下記の承認遷移経路でのみ発生し、approved エントリは一切変更しない。
    const [row] = await tx
      .insert(musics)
      .values({
        id: musicId,
        title,
        artist: artist ?? null,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: musics.id,
        set: {
          artist: fillIfPendingAndNull(
            musics.status,
            musics.artist,
            artist ?? null,
          ),
        },
      })
      .returning({
        id: musics.id,
        title: musics.title,
        status: musics.status,
      })
    if (row === undefined) {
      return err(new CatalogPersistenceError('musics upsert returned no row'))
    }
    return ok(row)
  }, 'failed to upsert music')

const registerChart = (
  tx: Tx,
  params: {
    musicId: string
    playStyle: PlayStyle
    difficulty: Difficulty
    level: number | undefined
    userId: string
    trusted: boolean
    musicApproved: boolean
  },
  approvalThreshold: number,
): ResultAsync<void, CatalogError> =>
  tryCatalog(async (): Promise<Result<void, CatalogError>> => {
    const {
      musicId,
      playStyle,
      difficulty,
      level,
      userId,
      trusted,
      musicApproved,
    } = params
    const chartMatch = and(
      eq(musicCharts.musicId, musicId),
      eq(musicCharts.playStyle, playStyle),
      eq(musicCharts.difficulty, difficulty),
    )

    if (trusted) {
      await tx
        .insert(musicCharts)
        .values({
          musicId,
          playStyle,
          difficulty,
          level: level ?? null,
          status: 'approved',
          approvedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            musicCharts.musicId,
            musicCharts.playStyle,
            musicCharts.difficulty,
          ],
          set: {
            level: keepIfUndefined(level, musicCharts.level),
            status: 'approved',
            approvedAt: coalesceApprovedAt(musicCharts.approvedAt),
          },
        })
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
    }

    await tx
      .insert(musicCharts)
      .values({
        musicId,
        playStyle,
        difficulty,
        level: level ?? null,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: [
          musicCharts.musicId,
          musicCharts.playStyle,
          musicCharts.difficulty,
        ],
        set: {
          level: fillIfPendingAndNull(
            musicCharts.status,
            musicCharts.level,
            level ?? null,
          ),
        },
      })
    // upsert 前の楽曲 status をそのまま信頼せず、upsert 後 (行ロック取得後) に
    // 再取得する: 非信頼送信の直前に、同時実行中の信頼済み送信でこの譜面の楽曲が
    // 承認されている可能性があるため。
    const [chart] = await tx
      .select({ status: musicCharts.status })
      .from(musicCharts)
      .where(chartMatch)
    if (chart === undefined) {
      return err(
        new CatalogPersistenceError('music_charts upsert returned no row'),
      )
    }

    // 送信記録は pending エントリの追跡専用: 既に approved な譜面に
    // 送信記録を蓄積してはならない。
    if (chart.status !== 'pending') return ok(undefined)

    await tx
      .insert(chartSubmissions)
      .values({ musicId, playStyle, difficulty, userId })
      .onConflictDoNothing()

    if (musicApproved) {
      const result = await approveChartIfThresholdReached(
        tx,
        musicId,
        playStyle,
        difficulty,
        approvalThreshold,
      )
      if (result.isErr()) return err(result.error)
    }
    return ok(undefined)
  }, 'failed to register chart')

const registerMusic = (
  tx: Tx,
  update: MusicUpdate,
  userId: string,
  trusted: boolean,
  approvalThreshold: number,
): ResultAsync<void, CatalogError> =>
  tryCatalog(async (): Promise<Result<void, CatalogError>> => {
    const { musicId, title, artist, charts } = update
    const upsertResult = await upsertMusic(tx, {
      musicId,
      title,
      artist,
      trusted,
    })
    if (upsertResult.isErr()) return err(upsertResult.error)
    let music = upsertResult.value

    if (trusted) {
      await tx
        .delete(musicSubmissions)
        .where(eq(musicSubmissions.musicId, musicId))
    } else if (music.status === 'pending') {
      const titleNormalized = normalizeTitle(title)
      await tx
        .insert(musicSubmissions)
        .values({ musicId, userId, titleNormalized })
        .onConflictDoUpdate({
          target: [musicSubmissions.musicId, musicSubmissions.userId],
          set: { titleNormalized },
        })

      const [top] = await tx
        .select({
          titleNormalized: musicSubmissions.titleNormalized,
          count: sql<number>`count(*)::int`,
        })
        .from(musicSubmissions)
        .where(eq(musicSubmissions.musicId, musicId))
        .groupBy(musicSubmissions.titleNormalized)
        .orderBy(sql`count(*) desc`)
        .limit(1)

      if (top !== undefined && top.count >= approvalThreshold) {
        await tx
          .update(musics)
          .set({
            title: top.titleNormalized,
            status: 'approved',
            approvedAt: new Date(),
          })
          .where(eq(musics.id, musicId))
        await tx
          .delete(musicSubmissions)
          .where(eq(musicSubmissions.musicId, musicId))
        music = { ...music, title: top.titleNormalized, status: 'approved' }
      }
    }

    const musicApproved = music.status === 'approved'

    const sortedCharts = [...charts.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )
    for (const [, chart] of sortedCharts) {
      const result = await registerChart(
        tx,
        {
          musicId,
          playStyle: chart.playStyle,
          difficulty: chart.difficulty,
          level: chart.level,
          userId,
          trusted,
          musicApproved,
        },
        approvalThreshold,
      )
      if (result.isErr()) return err(result.error)
    }

    // 冪等な処理: pending 譜面が無い楽曲 (大半のケース) に対して呼んでも
    // 空結果のクエリ 1 回で済むため、「この呼び出しで承認遷移が起きたか」を
    // 個別に追跡するより、常に呼ぶ方が安価。
    if (musicApproved) {
      const result = await reevaluatePendingCharts(
        tx,
        musicId,
        approvalThreshold,
      )
      if (result.isErr()) return err(result.error)
    }
    return ok(undefined)
  }, 'failed to register music')

export const registerCatalogEntries = (
  tx: Tx,
  input: CatalogRegisterInput,
  approvalThreshold: number,
): ResultAsync<void, CatalogError> =>
  tryCatalog(async (): Promise<Result<void, CatalogError>> => {
    const updates = aggregateMusicUpdates(input.pages)

    const sortedUpdates = [...updates.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )
    for (const [, update] of sortedUpdates) {
      const result = await registerMusic(
        tx,
        update,
        input.userId,
        input.trusted,
        approvalThreshold,
      )
      if (result.isErr()) return err(result.error)
    }
    return ok(undefined)
  }, 'failed to register catalog entries')
