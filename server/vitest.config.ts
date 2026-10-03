import { defineConfig } from 'vitest/config'

import { resolveTestDatabaseUrl } from './src/resolve-test-database-url'

// mise が設定する開発 DB の URL を、テスト用 DB の URL に置き換える。
const resolvedDatabaseUrl = resolveTestDatabaseUrl(
  process.env['DATABASE_URL'],
  process.env['TEST_DATABASE_URL'],
)
if (resolvedDatabaseUrl != null) {
  process.env['DATABASE_URL'] = resolvedDatabaseUrl
}

export default defineConfig({
  test: {
    // 実行全体の migration は src/db/test/global-setup.ts で適用する。
    // PostgreSQL はローカルと CI のどちらも mise run db:up で起動する。
    globalSetup: ['./src/db/test/global-setup.ts'],
    // Spelled out (matching Vitest's own default) so knip's static analysis
    // of this file can resolve test entry files; Vitest's own runtime
    // behavior is unchanged.
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
})
