import { createSql } from '@/db'
import { runMigrations } from '@/db/migrations'
import { requireDatabaseUrl } from '@/env'

// Postgres itself is expected to already be running (docker compose locally,
// GitHub Actions `services:` in CI) — this only applies migrations once for
// the whole run.
export const setup = async (): Promise<void> => {
  const sql = createSql(requireDatabaseUrl())
  // eslint-disable-next-line no-restricted-syntax -- test helper outside vitest's *.test.ts/__tests__ convention; propagates the rejection while guaranteeing sql.end()
  try {
    await runMigrations(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}
