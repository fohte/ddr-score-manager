import { describe, expect, it } from 'vitest'

import { setupTx } from '@/db/test/db'

// Postgres SQLSTATE error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'

interface PgError {
  code: string
  constraint: string | undefined
}

// Returns both the SQLSTATE class and the specific constraint name, so a
// test asserts exactly which constraint fired instead of merely that some
// check/FK constraint did.
const pgError = async (query: Promise<unknown>): Promise<PgError> => {
  try {
    await query
  } catch (err) {
    if (err !== null && typeof err === 'object' && 'code' in err) {
      const { code, constraint_name: constraint } = err as {
        code: unknown
        constraint_name?: unknown
      }
      return {
        code: String(code),
        constraint: typeof constraint === 'string' ? constraint : undefined,
      }
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
    it.each([
      ['a typical id', 'abc123'],
      ['an id at the 64 character limit', 'a'.repeat(64)],
    ])('accepts %s', async (_desc, id) => {
      await expect(insertMusic(id)).resolves.not.toThrow()
    })

    it.each([
      ['contains a non-alphanumeric character', 'bad-id'],
      ['exceeds 64 characters', 'a'.repeat(65)],
      ['is empty', ''],
    ])('rejects an id that %s', async (_desc, id) => {
      expect(await pgError(insertMusic(id))).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'musics_id_alnum',
      })
    })

    it('rejects an invalid status', async () => {
      const tx = getTx()
      expect(
        await pgError(
          tx`INSERT INTO musics (id, title, status) VALUES (${'abc123'}, ${'t'}, ${'invalid'})`,
        ),
      ).toEqual({ code: CHECK_VIOLATION, constraint: 'musics_status_valid' })
    })
  })

  describe('music_charts', () => {
    it('accepts a valid row', async () => {
      await insertMusic('abc123')
      await expect(insertChart('abc123')).resolves.not.toThrow()
    })

    it('rejects an invalid play_style', async () => {
      await insertMusic('abc123')
      expect(await pgError(insertChart('abc123', 'invalid'))).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'music_charts_play_style_valid',
      })
    })

    it('rejects an invalid difficulty', async () => {
      await insertMusic('abc123')
      expect(await pgError(insertChart('abc123', 'sp', 'invalid'))).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'music_charts_difficulty_valid',
      })
    })

    it('rejects an invalid status', async () => {
      await insertMusic('abc123')
      const tx = getTx()
      expect(
        await pgError(
          tx`INSERT INTO music_charts (music_id, play_style, difficulty, status) VALUES (${'abc123'}, ${'sp'}, ${'basic'}, ${'invalid'})`,
        ),
      ).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'music_charts_status_valid',
      })
    })

    const insertWithLevel = (level: number | null) => {
      const tx = getTx()
      return tx`INSERT INTO music_charts (music_id, play_style, difficulty, level, status) VALUES (${'abc123'}, ${'sp'}, ${'basic'}, ${level}, ${'approved'})`
    }

    it.each([
      ['null', null],
      ['the minimum', 1],
      ['the maximum', 19],
    ])('accepts a level of %s', async (_desc, level) => {
      await insertMusic('abc123')
      await expect(insertWithLevel(level)).resolves.not.toThrow()
    })

    it.each([
      ['below the minimum', 0],
      ['above the maximum', 20],
    ])('rejects a level %s', async (_desc, level) => {
      await insertMusic('abc123')
      expect(await pgError(insertWithLevel(level))).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'music_charts_level_range',
      })
    })

    it('rejects a music_id with no matching musics row', async () => {
      expect(await pgError(insertChart('missing'))).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'music_charts_music_id_fk',
      })
    })
  })

  describe('music_submissions', () => {
    const insertSubmission = (musicId: string, userId: string) => {
      const tx = getTx()
      return tx`INSERT INTO music_submissions (music_id, user_id, title_normalized) VALUES (${musicId}, ${userId}, ${'test'})`
    }

    it('accepts a valid row', async () => {
      await insertUser('user1')
      await insertMusic('abc123', 'pending')
      await expect(insertSubmission('abc123', 'user1')).resolves.not.toThrow()
    })

    it('rejects a music_id with no matching musics row', async () => {
      await insertUser('user1')
      expect(await pgError(insertSubmission('missing', 'user1'))).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'music_submissions_music_id_fk',
      })
    })

    it('rejects a user_id with no matching user row', async () => {
      await insertMusic('abc123', 'pending')
      expect(await pgError(insertSubmission('abc123', 'missing'))).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'music_submissions_user_id_fk',
      })
    })
  })

  describe('chart_submissions', () => {
    const insertSubmission = (
      musicId: string,
      playStyle: string,
      difficulty: string,
      userId: string,
    ) => {
      const tx = getTx()
      return tx`INSERT INTO chart_submissions (music_id, play_style, difficulty, user_id) VALUES (${musicId}, ${playStyle}, ${difficulty}, ${userId})`
    }

    it('accepts a valid row', async () => {
      await insertUser('user1')
      await insertMusic('abc123', 'pending')
      await insertChart('abc123', 'sp', 'basic', 'pending')
      await expect(
        insertSubmission('abc123', 'sp', 'basic', 'user1'),
      ).resolves.not.toThrow()
    })

    it('rejects a chart with no matching music_charts row', async () => {
      await insertUser('user1')
      expect(
        await pgError(insertSubmission('missing', 'sp', 'basic', 'user1')),
      ).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'chart_submissions_chart_fk',
      })
    })

    it('rejects a user_id with no matching user row', async () => {
      await insertMusic('abc123', 'pending')
      await insertChart('abc123', 'sp', 'basic', 'pending')
      expect(
        await pgError(insertSubmission('abc123', 'sp', 'basic', 'missing')),
      ).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'chart_submissions_user_id_fk',
      })
    })
  })

  describe('music_jackets', () => {
    const insertJacket = (musicId: string) => {
      const tx = getTx()
      return tx`INSERT INTO music_jackets (music_id, content, content_type) VALUES (${musicId}, ${Buffer.from('x')}, ${'image/jpeg'})`
    }

    it('accepts a valid row', async () => {
      await insertMusic('abc123')
      await expect(insertJacket('abc123')).resolves.not.toThrow()
    })

    it('rejects a music_id with no matching musics row', async () => {
      expect(await pgError(insertJacket('missing'))).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'music_jackets_music_id_fk',
      })
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
      expect(await pgError(insertScore(score))).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'score_records_score_range',
      })
    })

    it('rejects a user_id with no matching user row', async () => {
      await insertMusic('abc123')
      await insertChart('abc123')
      expect(await pgError(insertScore(900_000))).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'score_records_user_id_fk',
      })
    })

    it('rejects a chart with no matching music_charts row', async () => {
      await insertUser('user1')
      expect(await pgError(insertScore(900_000))).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'score_records_chart_fk',
      })
    })
  })
})
