const DEV_DATABASE_PATH = '/ddr_score_manager_dev'

// A plain `includes` would also match a custom database sharing the
// `ddr_score_manager_dev` prefix (e.g. `/ddr_score_manager_dev_snapshot`), so
// require the path to end there or be followed by a query/fragment separator.
function pointsAtDevDatabase(url: string): boolean {
  const index = url.indexOf(DEV_DATABASE_PATH)
  if (index === -1) return false
  const after = url.charAt(index + DEV_DATABASE_PATH.length)
  return after === '' || after === '?' || after === '#'
}

export function resolveTestDatabaseUrl(
  currentDatabaseUrl: string | undefined,
  testDatabaseUrl: string | undefined,
): string | undefined {
  if (testDatabaseUrl == null || testDatabaseUrl === '') {
    return currentDatabaseUrl
  }

  // Only override the mise-injected ddr_score_manager_dev default; an
  // explicit DATABASE_URL set for this invocation (e.g.
  // `DATABASE_URL=... pnpm test`) wins.
  if (
    currentDatabaseUrl == null ||
    currentDatabaseUrl === '' ||
    pointsAtDevDatabase(currentDatabaseUrl)
  ) {
    return testDatabaseUrl
  }

  return currentDatabaseUrl
}
