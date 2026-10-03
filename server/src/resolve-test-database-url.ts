const DEV_DATABASE_PATH = '/ddr-score-manager_server_dev'

// URL の pathname を解析し、query や fragment の同じ文字列を誤認しない。
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

  // TEST_DATABASE_URL が設定されている場合、開発 DB のパスを指す URL を置き換える。
  if (
    currentDatabaseUrl == null ||
    currentDatabaseUrl === '' ||
    pointsAtDevDatabase(currentDatabaseUrl)
  ) {
    return testDatabaseUrl
  }

  return currentDatabaseUrl
}
