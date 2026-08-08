import { createSql } from '#db/index'
import { runMigrations } from '#db/migrations'
import { EnvValidationError, requireDatabaseUrl } from '#env'

// infra runs this as `node dist/db/migrate.js` in an init container.
const main = async (): Promise<void> => {
  const sql = createSql(requireDatabaseUrl())
  // eslint-disable-next-line no-restricted-syntax -- process bootstrap: propagates the rejection while guaranteeing sql.end()
  try {
    await runMigrations(sql)
    console.log('migrations applied')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    for (const issue of err.issues) console.error(issue)
  } else {
    console.error(err)
  }
  process.exit(1)
})
