import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseHTML } from 'linkedom'
import { describe, expect, it } from 'vitest'

import { parsePage } from '@/parser'
import type { ParsedScoreRow } from '@/types'

const TESTDATA_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../testdata',
)

const parseDocument = (html: string): Document => parseHTML(html).document

const readFixtureDocument = (name: string): Document =>
  parseDocument(readFileSync(path.join(TESTDATA_ROOT, name), 'utf-8'))

describe('parsePage', () => {
  describe('スコア一覧ページ (music_data_single.html)', () => {
    const doc = readFixtureDocument('music_data_single.html')

    it('プレイ済みの譜面を抽出する', () => {
      const result = parsePage(doc)
      if (!result.ok || result.value.pageType !== 'scoreList') {
        throw new Error('expected a successful scoreList parse')
      }

      const rows = result.value.rows.filter(
        (row) => row.musicId === '6d10P0Pd1PiD1l6DPQdoPD1Q8DP0QlqQ',
      )

      expect(rows).toEqual([
        {
          musicId: '6d10P0Pd1PiD1l6DPQdoPD1Q8DP0QlqQ',
          musicTitle: '蒼が消えるとき',
          playStyle: 'sp',
          difficulty: 'expert',
          score: 916770,
          rank: 'AA',
          clearType: 'clear',
          flareRank: 'FLARE I',
        } satisfies ParsedScoreRow,
      ])
    })

    it('未プレイの譜面は行として含まれない', () => {
      const result = parsePage(doc)
      if (!result.ok || result.value.pageType !== 'scoreList') {
        throw new Error('expected a successful scoreList parse')
      }

      const unplayedDifficulties = result.value.rows
        .filter((row) => row.musicId === '6d10P0Pd1PiD1l6DPQdoPD1Q8DP0QlqQ')
        .map((row) => row.difficulty)

      expect(unplayedDifficulties).toEqual(['expert'])
    })
  })

  describe('楽曲詳細ページ (music_detail.html)', () => {
    it('タイトル・アーティスト・譜面一覧を抽出する', () => {
      const doc = readFixtureDocument('music_detail.html')

      const result = parsePage(doc)
      if (!result.ok) throw new Error('expected a successful parse')

      expect(result.value).toEqual({
        pageType: 'musicDetail',
        detail: {
          musicId: 'OboID1PloIIoOOObQdQOP110I61Ddl9I',
          title: '蒼い衝動 ～for EXTREME～',
          artist: 'NAOKI feat.YUKI',
          charts: [
            { playStyle: 'sp', difficulty: 'beginner', level: 2 },
            { playStyle: 'sp', difficulty: 'basic', level: 4 },
            { playStyle: 'sp', difficulty: 'difficult', level: 7 },
            { playStyle: 'sp', difficulty: 'expert', level: 9 },
            { playStyle: 'dp', difficulty: 'basic', level: 4 },
            { playStyle: 'dp', difficulty: 'difficult', level: 7 },
            { playStyle: 'dp', difficulty: 'expert', level: 11 },
          ],
        },
      })
    })
  })

  describe('未知のページ', () => {
    it('スコア一覧・楽曲詳細のいずれの構造も見つからない場合はエラーを返す', () => {
      const doc = parseDocument('<html><body><p>e-amusement</p></body></html>')

      expect(parsePage(doc)).toEqual({
        ok: false,
        error: {
          reason: 'unknown_page_type',
          detail: 'neither score list nor music detail structure was found',
        },
      })
    })
  })

  describe('構造が壊れたスコア一覧ページ', () => {
    it('スコア行が 1 件もない場合はエラーを返す', () => {
      const doc = parseDocument(`
        <html><body>
          <table id="data_tbl"></table>
        </body></html>
      `)

      expect(parsePage(doc)).toEqual({
        ok: false,
        error: {
          reason: 'invalid_structure',
          detail: 'no score rows found',
        },
      })
    })

    it('未知のランク画像の場合はエラーを返す', () => {
      const doc = parseDocument(`
        <html><body>
          <table id="data_tbl">
            <tr class="data">
              <td><a href="music_detail.html?index=abc123&style=0" class="music_info">曲名</a></td>
              <td class="rank" id="expert">
                <div class="data_score">900000</div>
                <div class="data_rank"><img src="/images/playdata/rank_s_unknown.png" /></div>
                <div class="data_clearkind"><img src="/images/playdata/cl_clear.png" /></div>
                <div class="data_flarerank"><img src="/images/playdata/flare_none.png" /></div>
              </td>
            </tr>
          </table>
        </body></html>
      `)

      expect(parsePage(doc)).toEqual({
        ok: false,
        error: {
          reason: 'invalid_structure',
          detail: 'unknown rank image: /images/playdata/rank_s_unknown.png',
        },
      })
    })

    it('musicId が英数字以外を含む場合、zod スキーマ検証でエラーを返す', () => {
      const doc = parseDocument(`
        <html><body>
          <table id="data_tbl">
            <tr class="data">
              <td><a href="music_detail.html?index=abc-123&style=0" class="music_info">曲名</a></td>
              <td class="rank" id="expert">
                <div class="data_score">900000</div>
                <div class="data_rank"><img src="/images/playdata/rank_s_aaa.png" /></div>
                <div class="data_clearkind"><img src="/images/playdata/cl_clear.png" /></div>
                <div class="data_flarerank"><img src="/images/playdata/flare_none.png" /></div>
              </td>
            </tr>
          </table>
        </body></html>
      `)

      const result = parsePage(doc)
      if (result.ok) throw new Error('expected parsePage to fail')

      expect(result.error.reason).toBe('invalid_structure')
      expect(result.error.detail).toContain('schema validation failed')
    })
  })

  describe('構造が壊れた楽曲詳細ページ', () => {
    it('タイトルとアーティストの区切り (br) がない場合はエラーを返す', () => {
      const doc = parseDocument(`
        <html><body>
          <table id="music_info">
            <tr><td><img /></td><td>タイトルのみ</td></tr>
          </table>
          <div id="difficulty">
            <div id="single">
              <div class="font">SINGLE</div>
              <ul>
                <li class="beginner">
                  <a href="music_detail.html?index=abc123&style=0&difficulty=0">beginner
                    <ul><li class="step"><img src="/images/playdata/songdetails_level_1.png" /></li></ul>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </body></html>
      `)

      expect(parsePage(doc)).toEqual({
        ok: false,
        error: {
          reason: 'invalid_structure',
          detail: 'title/artist separator (br) not found',
        },
      })
    })

    it('譜面が 1 件もない場合はエラーを返す', () => {
      const doc = parseDocument(`
        <html><body>
          <table id="music_info">
            <tr><td><img /></td><td>タイトル<br />アーティスト</td></tr>
          </table>
          <div id="difficulty">
            <div id="single">
              <div class="font">SINGLE</div>
              <ul>
                <li class="beginner"></li>
              </ul>
            </div>
          </div>
        </body></html>
      `)

      expect(parsePage(doc)).toEqual({
        ok: false,
        error: {
          reason: 'invalid_structure',
          detail: 'no charts found',
        },
      })
    })
  })
})
