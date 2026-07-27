import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '#db/schema/index'

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

// drizzle-orm の PgTransaction 型を直接 import せず Db['transaction'] 自体から
// 導出することで、この Db インスタンスが実際に生成するコールバック引数と
// 常に一致させる。
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
