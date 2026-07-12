import {
  basenameFromSrc,
  mapClearType,
  mapDifficulty,
  mapFlareRank,
  mapPlayStyleFromStyleParam,
  mapRank,
} from '@/enumMappings'
import type { ParsedScoreRow, ParseError, PlayStyle, Result } from '@/types'
import { err, ok } from '@/types'
import { getQueryParam } from '@/url'

export const SCORE_LIST_TABLE_SELECTOR = 'table#data_tbl'

interface RowIdentity {
  musicId: string
  musicTitle: string
  playStyle: PlayStyle
}

const invalidStructure = (detail: string): ParseError => ({
  reason: 'invalid_structure',
  detail,
})

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
  if (!/^\d+$/.test(scoreText)) return ok(null)

  const score = Number(scoreText)
  if (score === 0) return ok(null)
  if (score > 1_000_000) {
    return err(
      invalidStructure(
        `score out of range: ${String(score)} (${identity.musicTitle} ${difficulty})`,
      ),
    )
  }

  const rankSrc = td.querySelector('div.data_rank img')?.getAttribute('src')
  if (rankSrc === null || rankSrc === undefined) {
    return err(
      invalidStructure(
        `rank image not found: ${identity.musicTitle} ${difficulty}`,
      ),
    )
  }
  const rank = mapRank(basenameFromSrc(rankSrc))
  if (rank === undefined) {
    return err(invalidStructure(`unknown rank image: ${rankSrc}`))
  }

  const clearSrc = td
    .querySelector('div.data_clearkind img')
    ?.getAttribute('src')
  if (clearSrc === null || clearSrc === undefined) {
    return err(
      invalidStructure(
        `clear type image not found: ${identity.musicTitle} ${difficulty}`,
      ),
    )
  }
  const clearType = mapClearType(basenameFromSrc(clearSrc))
  if (clearType === undefined) {
    return err(invalidStructure(`unknown clear type image: ${clearSrc}`))
  }

  const flareSrc = td
    .querySelector('div.data_flarerank img')
    ?.getAttribute('src')
  if (flareSrc === null || flareSrc === undefined) {
    return err(
      invalidStructure(
        `flare rank image not found: ${identity.musicTitle} ${difficulty}`,
      ),
    )
  }
  const flareRank = mapFlareRank(basenameFromSrc(flareSrc))
  if (flareRank === undefined) {
    return err(invalidStructure(`unknown flare rank image: ${flareSrc}`))
  }

  return ok({
    musicId: identity.musicId,
    musicTitle: identity.musicTitle,
    playStyle: identity.playStyle,
    difficulty,
    score,
    rank,
    clearType,
    flareRank,
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
