import { and, eq, sql } from 'drizzle-orm'
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

// Aggregates every page's music/chart facts into one update per music, so a
// single upload spanning both page types is written to the catalog once per
// entry instead of racing itself. scoreList rows only prove a chart exists
// (no level); musicDetail is the only source for artist/level, so it's
// applied in a second pass that overrides the scoreList baseline.
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

// The INSERT ... ON CONFLICT itself takes the row lock this module's
// approval-threshold aggregation relies on (see data-models.md's catalog
// trust model), so every subsequent read of this music's submissions/status
// within the same tx observes a consistent, serialized view.
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
          artist: artist ?? sql`${musics.artist}`,
          status: 'approved',
          approvedAt: sql`coalesce(${musics.approvedAt}, now())`,
        },
      })
      .returning({ id: musics.id, title: musics.title, status: musics.status })
    if (row === undefined) throw new Error('musics upsert returned no row')
    return row
  }

  // Untrusted senders may only fill a still-null column on a pending entry
  // (e.g. artist); title changes only through the approval paths below, and
  // approved entries are never touched here.
  const [row] = await tx
    .insert(musics)
    .values({ id: musicId, title, artist: artist ?? null, status: 'pending' })
    .onConflictDoUpdate({
      target: musics.id,
      set: {
        artist: sql`CASE WHEN ${musics.status} = 'pending' AND ${musics.artist} IS NULL THEN ${artist ?? null} ELSE ${musics.artist} END`,
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
    .set({ status: 'approved', approvedAt: new Date() })
    .where(
      and(
        eq(musicCharts.musicId, musicId),
        eq(musicCharts.playStyle, playStyle),
        eq(musicCharts.difficulty, difficulty),
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

// Charts pending under a music that was just approved were held back
// because chart approval requires the parent music to be approved first;
// re-run each one's threshold check now that the precondition holds. Also
// reused by manual approval (approve.ts) for the same reason.
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
          level: level ?? sql`${musicCharts.level}`,
          status: 'approved',
          approvedAt: sql`coalesce(${musicCharts.approvedAt}, now())`,
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
        level: sql`CASE WHEN ${musicCharts.status} = 'pending' AND ${musicCharts.level} IS NULL THEN ${level ?? null} ELSE ${musicCharts.level} END`,
      },
    })
  // Re-fetch after the upsert (under its row lock) instead of trusting the
  // pre-upsert music status: an untrusted submission can arrive for a chart
  // whose music was approved by a concurrent trusted submission moments ago.
  const [chart] = await tx
    .select({ status: musicCharts.status })
    .from(musicCharts)
    .where(chartMatch)
  if (chart === undefined)
    throw new Error('music_charts upsert returned no row')

  // Submission tracking is pending-only (data-models.md): an already-approved
  // chart must not accumulate submission rows.
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

  // Idempotent: re-running this against a music with no pending charts (the
  // common case) is a single empty-result query, so it's cheaper to always
  // call it than to track whether this call is what flipped the status.
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
