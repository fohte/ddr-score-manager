export type PlayStyle = 'sp' | 'dp'

export type Difficulty =
  'beginner' | 'basic' | 'difficult' | 'expert' | 'challenge'

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value })
export const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error })

export interface ParsedScoreRow {
  musicId: string
  musicTitle: string
  playStyle: PlayStyle
  difficulty: Difficulty
  score: number // 0-1,000,000
  rank: string // AAA, AA+, ..., E
  clearType: string | null // null = 未クリア
  flareRank: string | null // null = なし
}

export interface ParsedMusicDetail {
  musicId: string
  title: string
  artist: string
  charts: { playStyle: PlayStyle; difficulty: Difficulty; level: number }[]
}

export type ParsedPage =
  | { pageType: 'scoreList'; rows: ParsedScoreRow[] }
  | { pageType: 'musicDetail'; detail: ParsedMusicDetail }

export interface ParseError {
  reason: 'unknown_page_type' | 'invalid_structure'
  detail: string
}

export interface EamusementParser {
  parsePage(doc: Document): Result<ParsedPage, ParseError>
}
