import { describe, expect, it } from 'vitest'

import { resolveTestDatabaseUrl } from '@/resolve-test-database-url'

describe('resolveTestDatabaseUrl', () => {
  it('keeps the current value when TEST_DATABASE_URL is unset', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev',
        undefined,
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev',
    )
  })

  it('uses TEST_DATABASE_URL when the current value is unset', () => {
    expect(
      resolveTestDatabaseUrl(
        undefined,
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
    )
  })

  it('uses TEST_DATABASE_URL when the current value points at ddr_score_manager_dev', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev',
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
    )
  })

  it('preserves an explicit DATABASE_URL that does not point at ddr_score_manager_dev', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/custom_db',
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/custom_db',
    )
  })

  it('preserves an explicit DATABASE_URL that only shares the ddr_score_manager_dev prefix', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev_snapshot',
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev_snapshot',
    )
  })

  it('preserves an explicit DATABASE_URL whose query string merely contains the dev path', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/custom_db?comment=/ddr_score_manager_dev',
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/custom_db?comment=/ddr_score_manager_dev',
    )
  })

  it('uses TEST_DATABASE_URL when the current value points at ddr_score_manager_dev with a query string', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev?sslmode=disable',
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
    )
  })

  it('keeps the current value when TEST_DATABASE_URL is an empty string', () => {
    expect(
      resolveTestDatabaseUrl(
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev',
        '',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_dev',
    )
  })

  it('uses TEST_DATABASE_URL when the current value is an empty string', () => {
    expect(
      resolveTestDatabaseUrl(
        '',
        'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
      ),
    ).toBe(
      'postgresql://ddr_score_manager:ddr_score_manager@localhost:1/ddr_score_manager_test',
    )
  })
})
