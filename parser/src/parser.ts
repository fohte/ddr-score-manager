import {
  DIFFICULTY_SECTION_SELECTOR,
  MUSIC_INFO_TABLE_SELECTOR,
  parseMusicDetail,
} from '@/musicDetailParser'
import { parsedPageSchema } from '@/schemas'
import {
  parseScoreListRows,
  SCORE_LIST_TABLE_SELECTOR,
} from '@/scoreListParser'
import type { ParsedPage, ParseError, Result } from '@/types'
import { err, ok } from '@/types'

const detectAndParse = (doc: Document): Result<ParsedPage, ParseError> => {
  if (doc.querySelector(SCORE_LIST_TABLE_SELECTOR)) {
    const rows = parseScoreListRows(doc)
    if (!rows.ok) return rows
    return ok({ pageType: 'scoreList', rows: rows.value })
  }

  if (
    doc.querySelector(MUSIC_INFO_TABLE_SELECTOR) &&
    doc.querySelector(DIFFICULTY_SECTION_SELECTOR)
  ) {
    const detail = parseMusicDetail(doc)
    if (!detail.ok) return detail
    return ok({ pageType: 'musicDetail', detail: detail.value })
  }

  return err({
    reason: 'unknown_page_type',
    detail: 'neither score list nor music detail structure was found',
  })
}

// e-amusement のスコア一覧・楽曲詳細 HTML から構造化データを抽出する。
// ページ種別は DOM 構造から自動判別し、抽出値は zod スキーマで最終検証してから返す。
export const parsePage = (doc: Document): Result<ParsedPage, ParseError> => {
  const page = detectAndParse(doc)
  if (!page.ok) return page

  const validated = parsedPageSchema.safeParse(page.value)
  if (!validated.success) {
    return err({
      reason: 'invalid_structure',
      detail: `schema validation failed: ${validated.error.message}`,
    })
  }

  return ok(validated.data)
}
