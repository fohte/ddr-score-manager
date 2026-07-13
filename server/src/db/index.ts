import postgres from 'postgres'

export type Sql = postgres.Sql

// `generate` commands (drizzle-kit, better-auth) only diff schema and never
// open a connection, so this is safe to use in place of a real DATABASE_URL.
export const PLACEHOLDER_DATABASE_URL =
  'postgresql://localhost:5432/placeholder'

export const createSql = (url: string): Sql => postgres(url)

export const pingDb = async (sql: Sql): Promise<void> => {
  await sql`SELECT 1`
}
