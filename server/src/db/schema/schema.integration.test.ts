import { describe, expect, it } from 'vitest'

import { setupTx } from '@/db/test/db'

// Postgres SQLSTATE error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'

const pgErrorCode = async (query: Promise<unknown>): Promise<string> => {
  try {
    await query
  } catch (err) {
    if (err !== null && typeof err === 'object' && 'code' in err) {
      return String(err.code)
    }
    throw err
  }
  throw new Error('expected the query to fail')
}

describe('schema constraints', () => {
  const getTx = setupTx()

  const insertUser = (id: string) => {
    const tx = getTx()
    return tx`INSERT INTO "user" (id, name, email) VALUES (${id}, ${'Test User'}, ${`${id}@example.com`})`
  }

  const insertMusic = (
    id: string,
    status: 'pending' | 'approved' = 'approved',
  ) => {
    const tx = getTx()
    return tx`INSERT INTO musics (id, title, status) VALUES (${id}, ${'Test Music'}, ${status})`
  }

  const insertChart = (
    musicId: string,
    playStyle = 'sp',
    difficulty = 'basic',
    status: 'pending' | 'approved' = 'approved',
  ) => {
    const tx = getTx()
    return tx`INSERT INTO music_charts (music_id, play_style, difficulty, status) VALUES (${musicId}, ${playStyle}, ${difficulty}, ${status})`
  }

  describe('musics', () => {
    it('accepts a valid row', async () => {
      await expect(insertMusic('abc123')).resolves.not.toThrow()
    })

    it.each([
      ['contains a non-alphanumeric character', 'bad-id'],
      ['exceeds 64 characters', 'a'.repeat(65)],
      ['is empty', ''],
    ])('rejects an id that %s', async (_desc, id) => {
      expect(await pgErrorCode(insertMusic(id))).toBe(CHECK_VIOLATION)
    })

    it('rejects an invalid status', async () => {
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO musics (id, title, status) VALUES (${'abc123'}, ${'t'}, ${'invalid'})`,
        ),
      ).toBe(CHECK_VIOLATION)
    })
  })

  describe('music_charts', () => {
    it('accepts a valid row', async () => {
      await insertMusic('abc123')
      await expect(insertChart('abc123')).resolves.not.toThrow()
    })

    it('rejects an invalid play_style', async () => {
      await insertMusic('abc123')
      expect(await pgErrorCode(insertChart('abc123', 'invalid'))).toBe(
        CHECK_VIOLATION,
      )
    })

    it('rejects an invalid difficulty', async () => {
      await insertMusic('abc123')
      expect(await pgErrorCode(insertChart('abc123', 'sp', 'invalid'))).toBe(
        CHECK_VIOLATION,
      )
    })

    it('rejects an invalid status', async () => {
      await insertMusic('abc123')
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO music_charts (music_id, play_style, difficulty, status) VALUES (${'abc123'}, ${'sp'}, ${'basic'}, ${'invalid'})`,
        ),
      ).toBe(CHECK_VIOLATION)
    })

    it('accepts a null level', async () => {
      await insertMusic('abc123')
      const tx = getTx()
      await expect(
        tx`INSERT INTO music_charts (music_id, play_style, difficulty, level, status) VALUES (${'abc123'}, ${'sp'}, ${'basic'}, ${null}, ${'approved'})`,
      ).resolves.not.toThrow()
    })

    it.each([
      ['below the minimum', 0],
      ['above the maximum', 20],
    ])('rejects a level %s', async (_desc, level) => {
      await insertMusic('abc123')
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO music_charts (music_id, play_style, difficulty, level, status) VALUES (${'abc123'}, ${'sp'}, ${'basic'}, ${level}, ${'approved'})`,
        ),
      ).toBe(CHECK_VIOLATION)
    })

    it('rejects a music_id with no matching musics row', async () => {
      expect(await pgErrorCode(insertChart('missing'))).toBe(
        FOREIGN_KEY_VIOLATION,
      )
    })
  })

  describe('music_submissions', () => {
    it('rejects a music_id with no matching musics row', async () => {
      await insertUser('user1')
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO music_submissions (music_id, user_id, title_normalized) VALUES (${'missing'}, ${'user1'}, ${'test'})`,
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })

    it('rejects a user_id with no matching user row', async () => {
      await insertMusic('abc123', 'pending')
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO music_submissions (music_id, user_id, title_normalized) VALUES (${'abc123'}, ${'missing'}, ${'test'})`,
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  describe('chart_submissions', () => {
    it('rejects a chart with no matching music_charts row', async () => {
      await insertUser('user1')
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO chart_submissions (music_id, play_style, difficulty, user_id) VALUES (${'missing'}, ${'sp'}, ${'basic'}, ${'user1'})`,
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })

    it('rejects a user_id with no matching user row', async () => {
      await insertMusic('abc123', 'pending')
      await insertChart('abc123', 'sp', 'basic', 'pending')
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO chart_submissions (music_id, play_style, difficulty, user_id) VALUES (${'abc123'}, ${'sp'}, ${'basic'}, ${'missing'})`,
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  describe('music_jackets', () => {
    it('rejects a music_id with no matching musics row', async () => {
      const tx = getTx()
      expect(
        await pgErrorCode(
          tx`INSERT INTO music_jackets (music_id, content, content_type) VALUES (${'missing'}, ${Buffer.from('x')}, ${'image/jpeg'})`,
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  describe('score_records', () => {
    const insertScore = (score: number) => {
      const tx = getTx()
      return tx`INSERT INTO score_records (user_id, music_id, play_style, difficulty, score, rank) VALUES (${'user1'}, ${'abc123'}, ${'sp'}, ${'basic'}, ${score}, ${'AAA'})`
    }

    it.each([
      ['the minimum', 0],
      ['the maximum', 1_000_000],
    ])('accepts a score at %s', async (_desc, score) => {
      await insertUser('user1')
      await insertMusic('abc123')
      await insertChart('abc123')
      await expect(insertScore(score)).resolves.not.toThrow()
    })

    it.each([
      ['below the minimum', -1],
      ['above the maximum', 1_000_001],
    ])('rejects a score %s', async (_desc, score) => {
      await insertUser('user1')
      await insertMusic('abc123')
      await insertChart('abc123')
      expect(await pgErrorCode(insertScore(score))).toBe(CHECK_VIOLATION)
    })

    it('rejects a user_id with no matching user row', async () => {
      await insertMusic('abc123')
      await insertChart('abc123')
      expect(await pgErrorCode(insertScore(900_000))).toBe(
        FOREIGN_KEY_VIOLATION,
      )
    })

    it('rejects a chart with no matching music_charts row', async () => {
      await insertUser('user1')
      expect(await pgErrorCode(insertScore(900_000))).toBe(
        FOREIGN_KEY_VIOLATION,
      )
    })
  })
})
