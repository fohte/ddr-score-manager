import { ResultAsync } from 'neverthrow'

import { CatalogError, CatalogPersistenceError } from '#catalog/errors'
import type { Db, Tx } from '#db/index'

// db.transaction() は「コールバックが返す Promise が resolve すれば COMMIT、
// reject すれば ROLLBACK」という契約で動く (drizzle-orm/postgres.js)。fn が
// 返す ResultAsync の Err をそのまま return しただけでは Promise は resolve
// してしまい、意図せず COMMIT される。ここで Err を throw に変換して確実に
// reject させ、ROLLBACK を発火させたうえで、外側で Result に戻す。
export const runInTransaction = <T>(
  db: Db,
  fn: (tx: Tx) => ResultAsync<T, CatalogError>,
): ResultAsync<T, CatalogError> =>
  ResultAsync.fromPromise(
    db.transaction(async (tx) => {
      const result = await fn(tx)
      // eslint-disable-next-line no-restricted-syntax -- converts Err to a rejection so db.transaction() ROLLBACKs instead of committing
      if (result.isErr()) throw result.error
      return result.value
    }),
    (caughtErr) =>
      caughtErr instanceof CatalogError
        ? caughtErr
        : new CatalogPersistenceError('transaction failed', caughtErr),
  )
