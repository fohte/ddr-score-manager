import { defineConfig } from 'drizzle-kit'

import { PLACEHOLDER_DATABASE_URL } from '@/db'

const url =
  process.env['DATABASE_URL'] ??
  (process.argv.includes('generate') ? PLACEHOLDER_DATABASE_URL : undefined)
if (url === undefined) {
  throw new Error('DATABASE_URL is required')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
