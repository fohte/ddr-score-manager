import { mapDifficulty, mapPlayStyleFromDivId } from '#enumMappings'
import type { ParsedMusicDetail, ParseError, Result } from '#types'
import { err, invalidStructure, ok } from '#types'
import { getQueryParam } from '#url'

export const MUSIC_INFO_TABLE_SELECTOR = 'table#music_info'
export const DIFFICULTY_SECTION_SELECTOR = 'div#difficulty'

const LEVEL_SRC_PATTERN = /level_(\d+)\.png/

interface TitleAndArtist {
  title: string
  artist: string
}

// table#music_info の 2 列目セルは `タイトル<br />アーティスト` の形式のため、
// <br> を境に childNodes を分割してテキストを取り出す。
const parseTitleAndArtist = (
  doc: Document,
): Result<TitleAndArtist, ParseError> => {
  const cell = doc.querySelector(`${MUSIC_INFO_TABLE_SELECTOR} td:nth-child(2)`)
  if (!cell) return err(invalidStructure('music info cell not found'))

  const children = Array.from(cell.childNodes)
  const brIndex = children.findIndex((node) => node.nodeName === 'BR')
  if (brIndex === -1) {
    return err(invalidStructure('title/artist separator (br) not found'))
  }

  const title = children
    .slice(0, brIndex)
    .map((node) => node.textContent ?? '')
    .join('')
    .trim()
  const artist = children
    .slice(brIndex + 1)
    .map((node) => node.textContent ?? '')
    .join('')
    .trim()

  if (!title) return err(invalidStructure('title is empty'))
  if (!artist) return err(invalidStructure('artist is empty'))

  return ok({ title, artist })
}

interface ChartsResult {
  musicId: string
  charts: ParsedMusicDetail['charts']
}

const parseDifficultySections = (
  doc: Document,
): Result<ChartsResult, ParseError> => {
  const sections = Array.from(
    doc.querySelectorAll(`${DIFFICULTY_SECTION_SELECTOR} > div`),
  )
  if (sections.length === 0) {
    return err(invalidStructure('difficulty sections not found'))
  }

  const charts: ParsedMusicDetail['charts'] = []
  let musicId: string | undefined

  for (const section of sections) {
    const sectionId = section.getAttribute('id')
    if (sectionId === null) {
      return err(invalidStructure('difficulty section has no id'))
    }

    const playStyle = mapPlayStyleFromDivId(sectionId)
    if (!playStyle) {
      return err(
        invalidStructure(`unknown difficulty section id: ${sectionId}`),
      )
    }

    const items = Array.from(section.querySelectorAll('div.font + ul > li'))
    for (const item of items) {
      const anchor = item.querySelector('a')
      if (!anchor) continue // この難易度の譜面が存在しない

      if (musicId === undefined) {
        const href = anchor.getAttribute('href')
        if (href === null)
          return err(invalidStructure('chart link has no href'))
        const index = getQueryParam(href, 'index')
        if (index === undefined) {
          return err(invalidStructure(`music id not found in href: ${href}`))
        }
        musicId = index
      }

      const difficultyRaw = item.getAttribute('class')
      if (difficultyRaw === null) {
        return err(invalidStructure('difficulty item has no class'))
      }
      const difficulty = mapDifficulty(difficultyRaw)
      if (!difficulty) {
        return err(invalidStructure(`unknown difficulty: ${difficultyRaw}`))
      }

      const levelSrc = item.querySelector('li.step img')?.getAttribute('src')
      if (levelSrc === null || levelSrc === undefined) {
        return err(
          invalidStructure(`level image not found: ${playStyle} ${difficulty}`),
        )
      }
      const levelMatch = LEVEL_SRC_PATTERN.exec(levelSrc)
      const levelText = levelMatch?.[1]
      if (levelText === undefined) {
        return err(invalidStructure(`unrecognized level image: ${levelSrc}`))
      }

      charts.push({ playStyle, difficulty, level: Number(levelText) })
    }
  }

  if (charts.length === 0) return err(invalidStructure('no charts found'))
  // charts が 1 件以上あれば、その譜面を処理した時点で musicId は必ず設定されている。
  if (musicId === undefined) return err(invalidStructure('music id not found'))

  return ok({ musicId, charts })
}

export const parseMusicDetail = (
  doc: Document,
): Result<ParsedMusicDetail, ParseError> => {
  const titleAndArtist = parseTitleAndArtist(doc)
  if (!titleAndArtist.ok) return titleAndArtist

  const sections = parseDifficultySections(doc)
  if (!sections.ok) return sections

  return ok({
    musicId: sections.value.musicId,
    title: titleAndArtist.value.title,
    artist: titleAndArtist.value.artist,
    charts: sections.value.charts,
  })
}
