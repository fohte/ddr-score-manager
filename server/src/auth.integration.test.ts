import { betterAuth } from 'better-auth'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildAuthOptions } from '#auth'
import { createSql } from '#db/index'
import { session, user } from '#db/schema/index'
import { requireDatabaseUrl } from '#env'
import { createLogger } from '#logger'

// drizzle-orm's postgres-js driver patches type parsers on the client's
// `.options` at construction time, which only the top-level pool client
// exposes — a `setupTx()` reserved connection does not carry `.options`
// and fails construction. Isolation is by deleting the known test emails
// before and after each test instead of wrapping in a transaction.
const TEST_EMAILS = [
  'blocked@example.com',
  'allowed@example.com',
  'user@example.com',
]

describe('allowlist gating', () => {
  const sql = createSql(requireDatabaseUrl())
  const db = drizzle(sql)
  const logger = createLogger('fatal')

  const deleteTestUsers = () =>
    db.delete(user).where(inArray(user.email, TEST_EMAILS))

  beforeAll(deleteTestUsers)
  afterEach(deleteTestUsers)

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
        logger,
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

  // Creates an account while its email is still on the allowlist, without
  // auto-signing in, so the returned user has no session yet — the
  // fixture the session.create.before tests re-authenticate against.
  const createExistingAllowedUser = async (email: string): Promise<void> => {
    const setupAuth = createTestAuth(email, { autoSignIn: false })
    await setupAuth.api.signUpEmail({
      body: { email, password: PASSWORD, name: 'User' },
    })
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
    await createExistingAllowedUser('user@example.com')

    const authAfterRemoval = createTestAuth('someone-else@example.com')
    await expect(
      authAfterRemoval.api.signInEmail({
        body: { email: 'user@example.com', password: PASSWORD },
      }),
    ).rejects.toThrow()

    expect(await countSessionsByEmail('user@example.com')).toBe(0)
  })

  it('creates a session for an existing user still on the allowlist', async () => {
    await createExistingAllowedUser('user@example.com')

    const authForSignIn = createTestAuth('user@example.com')
    await authForSignIn.api.signInEmail({
      body: { email: 'user@example.com', password: PASSWORD },
    })

    expect(await countSessionsByEmail('user@example.com')).toBe(1)
  })
})
