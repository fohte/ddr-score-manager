import { createSql } from '@/db'
import { runMigrations } from '@/db/migrations'
import { requireDatabaseUrl } from '@/env'

// Postgres itself is expected to already be running (docker compose locally,
// GitHub Actions `services:` in CI) — this only applies migrations once for
// the whole run.
export const setup = async (): Promise<void> => {
  const sql = createSql(requireDatabaseUrl())
  try {
    await runMigrations(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}
