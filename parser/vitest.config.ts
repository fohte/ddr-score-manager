import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Currently only type-only exports (no runtime behavior to assert on).
  test: { passWithNoTests: true },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
