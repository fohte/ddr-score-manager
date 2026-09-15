import { defineConfig } from 'vitest/config'

import { resolveTestDatabaseUrl } from './src/resolve-test-database-url'

// mise's [env] loads DATABASE_URL from .env.runtime pointed at
// ddr_score_manager_dev; tests must use ddr_score_manager_test instead, so
// prefer TEST_DATABASE_URL when it is set.
const resolvedDatabaseUrl = resolveTestDatabaseUrl(
  process.env['DATABASE_URL'],
  process.env['TEST_DATABASE_URL'],
)
if (resolvedDatabaseUrl != null) {
  process.env['DATABASE_URL'] = resolvedDatabaseUrl
}

export default defineConfig({
  test: {
<<<<<<< before updating
    // Applies migrations once for the whole run against DATABASE_URL; see
    // src/db/test/global-setup.ts. Postgres itself must already be running
    // (mise run db:up locally, GitHub Actions `services:` in CI).
    globalSetup: ['./src/db/test/global-setup.ts'],
||||||| last update
  })
=======
    // Spelled out (matching Vitest's own default) so knip's static analysis
    // of this file can resolve test entry files; Vitest's own runtime
    // behavior is unchanged.
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
>>>>>>> after updating
  },})
