import { z } from 'zod'

import type { ParsedMusicDetail, ParsedPage, ParsedScoreRow } from '#types'

// アップロード API の入力検証 (musics.id の CHECK 制約) と共有するパターン。
const MUSIC_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/
const MAX_SCORE_LIST_ROWS = 200

export const musicIdSchema = z.string().regex(MUSIC_ID_PATTERN)

export const playStyleSchema = z.enum(['sp', 'dp'])

export const difficultySchema = z.enum([
  'beginner',
  'basic',
  'difficult',
  'expert',
  'challenge',
])

export const rankSchema = z.enum([
  'AAA',
  'AA+',
  'AA',
  'AA-',
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D',
  'E',
])

export const clearTypeSchema = z.enum(['clear', 'MFC', 'PFC', 'GFC', 'FC'])

export const flareRankSchema = z.enum([
  'FLARE I',
  'FLARE II',
  'FLARE III',
  'FLARE IV',
  'FLARE V',
  'FLARE VI',
  'FLARE VII',
  'FLARE VIII',
  'FLARE IX',
  'FLARE EX',
])

export const parsedScoreRowSchema = z.object({
  musicId: musicIdSchema,
  musicTitle: z.string().min(1),
  playStyle: playStyleSchema,
  difficulty: difficultySchema,
  score: z.number().int().min(0).max(1_000_000),
  rank: rankSchema,
  clearType: clearTypeSchema.nullable(),
  flareRank: flareRankSchema.nullable(),
}) satisfies z.ZodType<ParsedScoreRow>

export const parsedMusicDetailSchema = z.object({
  musicId: musicIdSchema,
  title: z.string().min(1),
  artist: z.string().min(1),
  charts: z.array(
    z.object({
      playStyle: playStyleSchema,
      difficulty: difficultySchema,
      level: z.number().int().min(1).max(19),
    }),
  ),
}) satisfies z.ZodType<ParsedMusicDetail>

export const parsedPageSchema = z.discriminatedUnion('pageType', [
  z.object({
    pageType: z.literal('scoreList'),
    rows: z.array(parsedScoreRowSchema).max(MAX_SCORE_LIST_ROWS),
  }),
  z.object({
    pageType: z.literal('musicDetail'),
    detail: parsedMusicDetailSchema,
  }),
]) satisfies z.ZodType<ParsedPage>
