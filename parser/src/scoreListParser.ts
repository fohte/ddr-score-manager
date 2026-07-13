import {
  basenameFromSrc,
  mapClearType,
  mapDifficulty,
  mapFlareRank,
  mapPlayStyleFromStyleParam,
  mapRank,
} from '@/enumMappings'
import type { ParsedScoreRow, ParseError, PlayStyle, Result } from '@/types'
import { err, invalidStructure, ok } from '@/types'
import { getQueryParam } from '@/url'

export const SCORE_LIST_TABLE_SELECTOR = 'table#data_tbl'

interface RowIdentity {
  musicId: string
  musicTitle: string
  playStyle: PlayStyle
}

const parseRowIdentity = (tr: Element): Result<RowIdentity, ParseError> => {
  const anchor = tr.querySelector('td:first-child a.music_info')
  if (!anchor) return err(invalidStructure('music title link not found'))

  const musicTitle = anchor.textContent.trim()
  if (!musicTitle) return err(invalidStructure('music title is empty'))

  const href = anchor.getAttribute('href')
  if (href === null) {
    return err(invalidStructure(`music title link has no href: ${musicTitle}`))
  }

  const musicId = getQueryParam(href, 'index')
  if (musicId === undefined) {
    return err(invalidStructure(`music id not found in href: ${href}`))
  }

  const styleParam = getQueryParam(href, 'style')
  if (styleParam === undefined) {
    return err(invalidStructure(`style param not found in href: ${href}`))
  }

  const playStyle = mapPlayStyleFromStyleParam(styleParam)
  if (!playStyle) {
    return err(invalidStructure(`unknown style param: ${styleParam}`))
  }

  return ok({ musicId, musicTitle, playStyle })
}

// rank / clearType / flareRank は「img の src → basename → enum マッピング」という
// 同一形状の抽出を行うため、セレクタとマッパーだけを差し替えて共通化する。
const extractMappedImageValue = <T>(
  td: Element,
  selector: string,
  mapper: (basename: string) => T | undefined,
  label: string,
  context: string,
): Result<T, ParseError> => {
  const src = td.querySelector(selector)?.getAttribute('src')
  if (src === null || src === undefined) {
    return err(invalidStructure(`${label} image not found: ${context}`))
  }

  const value = mapper(basenameFromSrc(src))
  if (value === undefined) {
    return err(invalidStructure(`unknown ${label} image: ${src}`))
  }

  return ok(value)
}

// 戻り値が null の場合は未プレイ (スコアなし) のため、行を生成しない。
const parseScoreCell = (
  td: Element,
  identity: RowIdentity,
): Result<ParsedScoreRow | null, ParseError> => {
  const difficultyRaw = td.getAttribute('id')
  if (difficultyRaw === null) {
    return err(
      invalidStructure(`difficulty column has no id: ${identity.musicTitle}`),
    )
  }

  const difficulty = mapDifficulty(difficultyRaw)
  if (!difficulty) {
    return err(
      invalidStructure(
        `unknown difficulty: ${difficultyRaw} (${identity.musicTitle})`,
      ),
    )
  }

  const scoreText = td.querySelector('div.data_score')?.textContent.trim() ?? ''
  // 未プレイの譜面は "---" (プレイ済み譜面が存在しない場合は空文字) で表示される。
  // これらは数字のみの文字列にならないため、以下のチェックだけで判別できる
  // (スコア 0 のプレイ済み譜面と区別するため、数値としての 0 判定は行わない)。
  if (!/^\d+$/.test(scoreText)) return ok(null)

  const score = Number(scoreText)
  if (score > 1_000_000) {
    return err(
      invalidStructure(
        `score out of range: ${String(score)} (${identity.musicTitle} ${difficulty})`,
      ),
    )
  }

  const context = `${identity.musicTitle} ${difficulty}`

  const rankResult = extractMappedImageValue(
    td,
    'div.data_rank img',
    mapRank,
    'rank',
    context,
  )
  if (!rankResult.ok) return rankResult

  const clearTypeResult = extractMappedImageValue(
    td,
    'div.data_clearkind img',
    mapClearType,
    'clear type',
    context,
  )
  if (!clearTypeResult.ok) return clearTypeResult

  const flareRankResult = extractMappedImageValue(
    td,
    'div.data_flarerank img',
    mapFlareRank,
    'flare rank',
    context,
  )
  if (!flareRankResult.ok) return flareRankResult

  return ok({
    musicId: identity.musicId,
    musicTitle: identity.musicTitle,
    playStyle: identity.playStyle,
    difficulty,
    score,
    rank: rankResult.value,
    clearType: clearTypeResult.value,
    flareRank: flareRankResult.value,
  })
}

export const parseScoreListRows = (
  doc: Document,
): Result<ParsedScoreRow[], ParseError> => {
  const trs = Array.from(
    doc.querySelectorAll(`${SCORE_LIST_TABLE_SELECTOR} tr.data`),
  )
  if (trs.length === 0) return err(invalidStructure('no score rows found'))

  const rows: ParsedScoreRow[] = []

  for (const tr of trs) {
    const identity = parseRowIdentity(tr)
    if (!identity.ok) return identity

    const cells = Array.from(tr.querySelectorAll('td.rank'))
    if (cells.length === 0) {
      return err(
        invalidStructure(
          `no difficulty columns found: ${identity.value.musicTitle}`,
        ),
      )
    }

    for (const cell of cells) {
      const result = parseScoreCell(cell, identity.value)
      if (!result.ok) return result
      if (result.value) rows.push(result.value)
    }
  }

  return ok(rows)
}
