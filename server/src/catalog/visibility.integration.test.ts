import { describe, expect, it } from 'vitest'

import { createCatalogService } from '#catalog/catalog-service'
import {
  insertScoreRecord,
  insertUser,
  scoreListPage,
  scoreRow,
} from '#catalog/test/fixtures'
import { runInTransaction } from '#catalog/transaction'
import type { CatalogRegisterInput } from '#catalog/types'
import { isMusicVisibleToUser } from '#catalog/visibility'
import { setupDrizzleTx } from '#db/test/db'

const APPROVAL_THRESHOLD = 2

describe('isMusicVisibleToUser', () => {
  const getDb = setupDrizzleTx()

  const register = async (input: CatalogRegisterInput): Promise<void> => {
    const service = createCatalogService(getDb(), APPROVAL_THRESHOLD)
    const result = await runInTransaction(getDb(), (tx) =>
      service.register(tx, input),
    )
    result._unsafeUnwrap()
  }

  const isVisible = async (musicId: string, userId: string): Promise<boolean> =>
    (await isMusicVisibleToUser(getDb(), musicId, userId))._unsafeUnwrap()

  it('is visible to anyone when approved', async () => {
    await insertUser(getDb(), 'trusted1')
    await register({
      userId: 'trusted1',
      trusted: true,
      pages: [scoreListPage([scoreRow()])],
    })

    expect(await isVisible('abc123', 'unrelatedUser')).toBe(true)
  })

  it('is visible to the submitter of a pending music', async () => {
    await insertUser(getDb(), 'user1')
    await register({
      userId: 'user1',
      trusted: false,
      pages: [scoreListPage([scoreRow()])],
    })

    expect(await isVisible('abc123', 'user1')).toBe(true)
  })

  it('is visible to a user with an attached score record even without a submission', async () => {
    await insertUser(getDb(), 'user1')
    await insertUser(getDb(), 'user2')
    await register({
      userId: 'user1',
      trusted: false,
      pages: [scoreListPage([scoreRow()])],
    })
    await insertScoreRecord(getDb(), { userId: 'user2' })

    expect(await isVisible('abc123', 'user2')).toBe(true)
  })

  it('is not visible to an unrelated user when pending', async () => {
    await insertUser(getDb(), 'user1')
    await register({
      userId: 'user1',
      trusted: false,
      pages: [scoreListPage([scoreRow()])],
    })

    expect(await isVisible('abc123', 'unrelatedUser')).toBe(false)
  })

  it('is not visible when the music does not exist', async () => {
    expect(await isVisible('missing', 'anyone')).toBe(false)
  })
})
