import { type Result, ResultAsync } from 'neverthrow'

import { type CatalogError, CatalogPersistenceError } from '#catalog/errors'

// 非同期処理内で発生した例外を CatalogPersistenceError にラップしつつ、
// fn 自身が返す Result (通常の失敗系) はそのまま伝播する。
export const tryCatalog = <T>(
  fn: () => Promise<Result<T, CatalogError>>,
  message: string,
): ResultAsync<T, CatalogError> =>
  ResultAsync.fromPromise(
    fn(),
    (caughtErr) => new CatalogPersistenceError(message, caughtErr),
  ).andThen((result) => result)
