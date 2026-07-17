import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '@/db/schema'

export type Sql = postgres.Sql

// `generate` commands (drizzle-kit, better-auth) only diff schema and never
// open a connection, so this is safe to use in place of a real DATABASE_URL.
export const PLACEHOLDER_DATABASE_URL =
  'postgresql://localhost:5432/placeholder'

export const createSql = (url: string): Sql => postgres(url)

export const pingDb = async (sql: Sql): Promise<void> => {
  await sql`SELECT 1`
}

export type Db = PostgresJsDatabase<typeof schema>

export const createDb = (sql: Sql): Db => drizzle(sql, { schema })

// Derived from Db['transaction'] itself (rather than importing drizzle-orm's
// PgTransaction type directly) so it always matches the callback argument
// this Db instance actually produces.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
