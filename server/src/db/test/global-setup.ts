import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

import { createSql } from '@/db'
import { runMigrations } from '@/db/migrations'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

let container: StartedPostgreSqlContainer | undefined

export const setup = async (project: TestProject): Promise<void> => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const url = container.getConnectionUri()

  const sql = createSql(url)
  try {
    await runMigrations(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }

  project.provide('databaseUrl', url)
}

export const teardown = async (): Promise<void> => {
  await container?.stop()
}
