import type { Difficulty, PlayStyle } from '#types'

const DIFFICULTIES: readonly Difficulty[] = [
  'beginner',
  'basic',
  'difficult',
  'expert',
  'challenge',
]

export const mapDifficulty = (value: string): Difficulty | undefined =>
  DIFFICULTIES.find((difficulty) => difficulty === value)

// music_data_single.html の各セル / music_detail.html の各譜面リンクの href に
// 含まれる `style` クエリパラメータの値。
export const mapPlayStyleFromStyleParam = (
  value: string,
): PlayStyle | undefined => {
  if (value === '0') return 'sp'
  if (value === '1') return 'dp'
  return undefined
}

// music_detail.html の div#difficulty 直下の div の id 属性値。
export const mapPlayStyleFromDivId = (id: string): PlayStyle | undefined => {
  if (id === 'single') return 'sp'
  if (id === 'double') return 'dp'
  return undefined
}

export const basenameFromSrc = (src: string): string => {
  const filename = src.split('/').pop() ?? ''
  return filename.replace(/\.[^.]+$/, '')
}

const RANK_BASENAME_MAP: Readonly<Record<string, string>> = {
  rank_s_aaa: 'AAA',
  rank_s_aa_p: 'AA+',
  rank_s_aa: 'AA',
  rank_s_aa_m: 'AA-',
  rank_s_a_p: 'A+',
  rank_s_a: 'A',
  rank_s_a_m: 'A-',
  rank_s_b_p: 'B+',
  rank_s_b: 'B',
  rank_s_b_m: 'B-',
  rank_s_c_p: 'C+',
  rank_s_c: 'C',
  rank_s_c_m: 'C-',
  rank_s_d: 'D',
  rank_s_e: 'E',
}

export const mapRank = (basename: string): string | undefined =>
  RANK_BASENAME_MAP[basename]

const CLEAR_TYPE_BASENAME_MAP: Readonly<Record<string, string>> = {
  cl_clear: 'clear',
  cl_marv: 'MFC',
  cl_perf: 'PFC',
  cl_great: 'GFC',
  cl_good: 'FC',
}

// 戻り値: 既知のクリア種別なら string、未クリア (cl_none) なら null、
// 未知の画像名なら undefined (呼び出し側でパースエラーとして扱う)
export const mapClearType = (basename: string): string | null | undefined => {
  if (basename === 'cl_none') return null
  return CLEAR_TYPE_BASENAME_MAP[basename]
}

const FLARE_RANK_BASENAME_MAP: Readonly<Record<string, string>> = {
  flare_1: 'FLARE I',
  flare_2: 'FLARE II',
  flare_3: 'FLARE III',
  flare_4: 'FLARE IV',
  flare_5: 'FLARE V',
  flare_6: 'FLARE VI',
  flare_7: 'FLARE VII',
  flare_8: 'FLARE VIII',
  flare_9: 'FLARE IX',
  flare_ex: 'FLARE EX',
}

// 戻り値: 既知のフレアランクなら string、フレアなし (flare_none) なら null、
// 未知の画像名なら undefined (呼び出し側でパースエラーとして扱う)
export const mapFlareRank = (basename: string): string | null | undefined => {
  if (basename === 'flare_none') return null
  return FLARE_RANK_BASENAME_MAP[basename]
}
