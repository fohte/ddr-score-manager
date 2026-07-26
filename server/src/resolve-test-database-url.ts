const DEV_DATABASE_PATH = '/ddr_score_manager_dev'

// Parses the URL instead of doing a substring search, so a query/fragment
// value that happens to contain `/ddr_score_manager_dev` (e.g. a
// `search_path` option) can't be mistaken for the path itself.
function pointsAtDevDatabase(url: string): boolean {
  // eslint-disable-next-line no-restricted-syntax -- interops with the URL constructor's throw-based contract for invalid input
  try {
    return new URL(url).pathname === DEV_DATABASE_PATH
  } catch {
    return false
  }
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
