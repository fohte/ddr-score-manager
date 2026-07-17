import { apiKey } from '@better-auth/api-key'
import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/postgres-js'

import { createSql, PLACEHOLDER_DATABASE_URL } from '@/db'

const databaseUrl = process.env['DATABASE_URL'] ?? PLACEHOLDER_DATABASE_URL

const db = drizzle(createSql(databaseUrl))

const authOptions: BetterAuthOptions = {
  database: drizzleAdapter(db, { provider: 'pg' }),
  socialProviders: {
    google: {
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    },
  },
  plugins: [apiKey()],
}

export const auth: Auth = betterAuth(authOptions)
