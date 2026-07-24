import type {
  Difficulty,
  ParsedPage,
  PlayStyle,
} from '@fohte/ddr-score-manager-parser'

export interface ChartUpdate {
  playStyle: PlayStyle
  difficulty: Difficulty
  level: number | undefined
}

export interface MusicUpdate {
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
export const aggregateMusicUpdates = (
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
