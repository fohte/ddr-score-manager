import { defineConfig } from 'drizzle-kit'

// `generate` only diffs the local schema against migration snapshots and
// never opens a connection, so it works fine against a placeholder URL.
const url =
  process.env['DATABASE_URL'] ??
  (process.argv.includes('generate')
    ? 'postgresql://localhost:5432/placeholder'
    : undefined)
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
