import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Difficulty, ParsedPage, PlayStyle } from 'parser'

import { normalizeTitle } from '@/catalog/normalize-title'
import type { CatalogRegisterInput } from '@/catalog/types'
import type { Tx } from '@/db'
import {
  chartSubmissions,
  musicCharts,
  musics,
  musicSubmissions,
} from '@/db/schema'

// trusted なメタデータ上書きで、新しい値が未指定 (undefined) の場合に既存値を保持する。
const keepIfUndefined = <T>(
  newValue: T | undefined,
  column: AnyPgColumn,
): T | SQL => newValue ?? sql`${column}`

// 初回承認時刻のみを確定し、以降の再承認では上書きしない。
const coalesceApprovedAt = (column: AnyPgColumn): SQL =>
  sql`coalesce(${column}, now())`

// 非信頼ユーザーによる null 列補完: pending かつ現在値が null のときのみ埋める。
const fillIfPendingAndNull = (
  statusColumn: AnyPgColumn,
  targetColumn: AnyPgColumn,
  newValue: unknown,
): SQL =>
  sql`CASE WHEN ${statusColumn} = 'pending' AND ${targetColumn} IS NULL THEN ${newValue} ELSE ${targetColumn} END`

interface ChartUpdate {
  playStyle: PlayStyle
  difficulty: Difficulty
  level: number | undefined
}

interface MusicUpdate {
  musicId: string
  title: string
  artist: string | undefined
  charts: Map<string, ChartUpdate>
}

const chartKey = (playStyle: PlayStyle, difficulty: Difficulty): string =>
  `${playStyle}:${difficulty}`

// 全ページの楽曲・譜面情報を楽曲単位で 1 つに集約する。両ページ種別を含む
// 1 回のアップロードでも、カタログへの書き込みは楽曲ごとに 1 回で済む。
// scoreList の行は譜面の存在のみを示す (level を持たない)。artist/level は
// musicDetail のみが提供するため、2 パス目で scoreList のベースラインを上書きする。
const aggregateMusicUpdates = (
  pages: ParsedPage[],
): Map<string, MusicUpdate> => {
  const updates = new Map<string, MusicUpdate>()

  const getOrCreate = (musicId: string, title: string): MusicUpdate => {
    const existing = updates.get(musicId)
    if (existing !== undefined) return existing
    const created: MusicUpdate = {
      musicId,
      title,
      artist: undefined,
      charts: new Map(),
    }
    updates.set(musicId, created)
    return created
  }

  for (const page of pages) {
    if (page.pageType !== 'scoreList') continue
    for (const row of page.rows) {
      const update = getOrCreate(row.musicId, row.musicTitle)
      const key = chartKey(row.playStyle, row.difficulty)
      if (!update.charts.has(key)) {
        update.charts.set(key, {
          playStyle: row.playStyle,
          difficulty: row.difficulty,
          level: undefined,
        })
      }
    }
  }

  for (const page of pages) {
    if (page.pageType !== 'musicDetail') continue
    const { detail } = page
    const update = getOrCreate(detail.musicId, detail.title)
    update.title = detail.title
    update.artist = detail.artist
    for (const chart of detail.charts) {
      update.charts.set(chartKey(chart.playStyle, chart.difficulty), {
        playStyle: chart.playStyle,
        difficulty: chart.difficulty,
        level: chart.level,
      })
    }
  }

  return updates
}

interface MusicRow {
  id: string
  title: string
  status: string
}

// INSERT ... ON CONFLICT 自体が、本モジュールの承認閾値集計が依拠する行ロックを
// 取得する。そのため同一トランザクション内でこの楽曲の送信記録・status を
// 読み取る後続処理は、常に一貫した直列化されたビューを観測できる。
const upsertMusic = async (
  tx: Tx,
  params: {
    musicId: string
    title: string
    artist: string | undefined
    trusted: boolean
  },
): Promise<MusicRow> => {
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
      .returning({ id: musics.id, title: musics.title, status: musics.status })
    if (row === undefined) throw new Error('musics upsert returned no row')
    return row
  }

  // 非信頼ユーザーは pending エントリの null 列 (artist 等) の補完のみ行える。
  // title の変更は下記の承認遷移経路でのみ発生し、approved エントリは一切変更しない。
  const [row] = await tx
    .insert(musics)
    .values({ id: musicId, title, artist: artist ?? null, status: 'pending' })
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
    .returning({ id: musics.id, title: musics.title, status: musics.status })
  if (row === undefined) throw new Error('musics upsert returned no row')
  return row
}

const approveChartIfThresholdReached = async (
  tx: Tx,
  musicId: string,
  playStyle: PlayStyle,
  difficulty: Difficulty,
  approvalThreshold: number,
): Promise<void> => {
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
  if (result === undefined) throw new Error('count query returned no row')

  if (result.count < approvalThreshold) return

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
}

// 楽曲が承認されるまで、配下の pending 譜面は「楽曲が approved であること」
// という前提条件を満たせず判定を保留されていた。ここで前提条件を満たしたので
// 各譜面の閾値判定を再実行する。手動承認 (approve.ts) からも同じ理由で再利用する。
export const reevaluatePendingCharts = async (
  tx: Tx,
  musicId: string,
  approvalThreshold: number,
): Promise<void> => {
  const pending = await tx
    .select({
      playStyle: musicCharts.playStyle,
      difficulty: musicCharts.difficulty,
    })
    .from(musicCharts)
    .where(
      and(eq(musicCharts.musicId, musicId), eq(musicCharts.status, 'pending')),
    )

  for (const chart of pending) {
    await approveChartIfThresholdReached(
      tx,
      musicId,
      chart.playStyle,
      chart.difficulty,
      approvalThreshold,
    )
  }
}

const registerChart = async (
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
): Promise<void> => {
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
    return
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
  if (chart === undefined)
    throw new Error('music_charts upsert returned no row')

  // 送信記録は pending エントリの追跡専用: 既に approved な譜面に
  // 送信記録を蓄積してはならない。
  if (chart.status !== 'pending') return

  await tx
    .insert(chartSubmissions)
    .values({ musicId, playStyle, difficulty, userId })
    .onConflictDoNothing()

  if (musicApproved) {
    await approveChartIfThresholdReached(
      tx,
      musicId,
      playStyle,
      difficulty,
      approvalThreshold,
    )
  }
}

const registerMusic = async (
  tx: Tx,
  update: MusicUpdate,
  userId: string,
  trusted: boolean,
  approvalThreshold: number,
): Promise<void> => {
  const { musicId, title, artist, charts } = update
  let music = await upsertMusic(tx, { musicId, title, artist, trusted })

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
    await registerChart(
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
  }

  // 冪等な処理: pending 譜面が無い楽曲 (大半のケース) に対して呼んでも
  // 空結果のクエリ 1 回で済むため、「この呼び出しで承認遷移が起きたか」を
  // 個別に追跡するより、常に呼ぶ方が安価。
  if (musicApproved) {
    await reevaluatePendingCharts(tx, musicId, approvalThreshold)
  }
}

export const registerCatalogEntries = async (
  tx: Tx,
  input: CatalogRegisterInput,
  approvalThreshold: number,
): Promise<void> => {
  const updates = aggregateMusicUpdates(input.pages)

  const sortedUpdates = [...updates.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )
  for (const [, update] of sortedUpdates) {
    await registerMusic(
      tx,
      update,
      input.userId,
      input.trusted,
      approvalThreshold,
    )
  }
}
