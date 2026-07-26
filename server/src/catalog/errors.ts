export class CatalogError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.name = 'CatalogError'
  }
}

// drizzle クエリが期待した行を返さなかった場合 (upsert 直後の再取得など、
// 通常起こり得ない不変条件違反) と、DB アクセス自体が失敗した場合の両方を表す。
export class CatalogPersistenceError extends CatalogError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = 'CatalogPersistenceError'
  }
}
