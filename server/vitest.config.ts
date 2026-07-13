import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    // Starts a real Postgres container and applies migrations once for the
    // whole run; see src/db/test/global-setup.ts.
    globalSetup: ['./src/db/test/global-setup.ts'],
    // Container pull + startup can take longer than vitest's 10s default.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
})
