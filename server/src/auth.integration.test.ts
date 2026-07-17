import { betterAuth } from 'better-auth'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { buildAuthOptions } from '@/auth'
import { createSql } from '@/db'
import { session, user } from '@/db/schema'
import { requireDatabaseUrl } from '@/env'

// better-auth's drizzle adapter patches type parsers on the client's
// `.options` (see drizzle-orm's postgres-js driver), which only the
// top-level pool client exposes — a `setupTx()` reserved connection does
// not carry `.options` and fails construction. Isolation is by deleting the
// known test emails after each test instead of wrapping in a transaction.
const TEST_EMAILS = [
  'blocked@example.com',
  'allowed@example.com',
  'user@example.com',
]

describe('allowlist gating', () => {
  const sql = createSql(requireDatabaseUrl())
  const db = drizzle(sql)

  afterEach(async () => {
    await db.delete(user).where(inArray(user.email, TEST_EMAILS))
  })

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  const PASSWORD = 'password12345'

  const createTestAuth = (
    allowedEmails: string,
    options: { autoSignIn: boolean } = { autoSignIn: true },
  ) =>
    betterAuth({
      ...buildAuthOptions({
        db,
        googleClientId: 'test-client-id',
        googleClientSecret: 'test-client-secret',
        allowedEmails,
      }),
      emailAndPassword: { enabled: true, autoSignIn: options.autoSignIn },
    })

  const countUsersByEmail = async (email: string): Promise<number> => {
    const rows = await db.select().from(user).where(eq(user.email, email))
    return rows.length
  }

  const countSessionsByEmail = async (email: string): Promise<number> => {
    const rows = await db
      .select({ id: session.id })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(eq(user.email, email))
    return rows.length
  }

  it('rejects account creation for a disallowed email', async () => {
    const auth = createTestAuth('allowed@example.com', { autoSignIn: false })

    await expect(
      auth.api.signUpEmail({
        body: {
          email: 'blocked@example.com',
          password: PASSWORD,
          name: 'Blocked',
        },
      }),
    ).rejects.toThrow()

    expect(await countUsersByEmail('blocked@example.com')).toBe(0)
  })

  it('creates the account for an allowed email', async () => {
    const auth = createTestAuth('allowed@example.com', { autoSignIn: false })

    await auth.api.signUpEmail({
      body: {
        email: 'allowed@example.com',
        password: PASSWORD,
        name: 'Allowed',
      },
    })

    expect(await countUsersByEmail('allowed@example.com')).toBe(1)
  })

  it('rejects a new session for an existing user no longer on the allowlist', async () => {
    const setupAuth = createTestAuth('user@example.com', {
      autoSignIn: false,
    })
    await setupAuth.api.signUpEmail({
      body: { email: 'user@example.com', password: PASSWORD, name: 'User' },
    })

    const authAfterRemoval = createTestAuth('someone-else@example.com')
    await expect(
      authAfterRemoval.api.signInEmail({
        body: { email: 'user@example.com', password: PASSWORD },
      }),
    ).rejects.toThrow()

    expect(await countSessionsByEmail('user@example.com')).toBe(0)
  })

  it('creates a session for an existing user still on the allowlist', async () => {
    const setupAuth = createTestAuth('user@example.com', {
      autoSignIn: false,
    })
    await setupAuth.api.signUpEmail({
      body: { email: 'user@example.com', password: PASSWORD, name: 'User' },
    })

    const authForSignIn = createTestAuth('user@example.com')
    await authForSignIn.api.signInEmail({
      body: { email: 'user@example.com', password: PASSWORD },
    })

    expect(await countSessionsByEmail('user@example.com')).toBe(1)
  })
})
