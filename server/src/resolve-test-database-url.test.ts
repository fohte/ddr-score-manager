import { describe, expect, it } from 'vitest'

import { resolveTestDatabaseUrl } from '#resolve-test-database-url'

describe('resolveTestDatabaseUrl', () => {
  it('keeps the current value when TEST_DATABASE_URL is unset', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev',
        undefined,
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev',
    )
  })

  it('uses TEST_DATABASE_URL when the current value is unset', () => {
    expect(
      resolveTestDatabaseUrl(
        undefined,
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
    )
  })

  it('uses TEST_DATABASE_URL when the current value points at ddr-score-manager_server_dev', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev',
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
    )
  })

  it('preserves an explicit DATABASE_URL that does not point at ddr-score-manager_server_dev', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/custom_db',
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/custom_db',
    )
  })

  it('preserves an explicit DATABASE_URL that only shares the ddr-score-manager_server_dev prefix', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev_snapshot',
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev_snapshot',
    )
  })

  it('preserves an explicit DATABASE_URL whose query string merely contains the dev path', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/custom_db?comment=/ddr-score-manager_server_dev',
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/custom_db?comment=/ddr-score-manager_server_dev',
    )
  })

  it('uses TEST_DATABASE_URL when the current value points at ddr-score-manager_server_dev with a query string', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev?sslmode=disable',
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
    )
  })

  it('keeps the current value when TEST_DATABASE_URL is an empty string', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev',
        '',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_dev',
    )
  })

  it('uses TEST_DATABASE_URL when the current value is an empty string', () => {
    expect(
      resolveTestDatabaseUrl(
        '',
        'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
      ),
    ).toBe(
      'postgresql://ddr-score-manager:ddr-score-manager@localhost:1/ddr-score-manager_server_test',
    )
  })
})
