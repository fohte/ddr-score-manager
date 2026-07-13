import { apiKey } from '@better-auth/api-key'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/postgres-js'

import { createSql } from '@/db'

// `better-auth generate` and `drizzle-kit generate` only diff schema and
// never open a connection, so this works fine against a placeholder URL.
const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/placeholder'

const db = drizzle(createSql(databaseUrl))

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  socialProviders: {
    google: {
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    },
  },
  plugins: [apiKey()],
})
