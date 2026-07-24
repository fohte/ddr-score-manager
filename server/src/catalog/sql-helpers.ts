import { type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// trusted なメタデータ上書きで、新しい値が未指定 (undefined) の場合に既存値を保持する。
export const keepIfUndefined = <T>(
  newValue: T | undefined,
  column: AnyPgColumn,
): T | SQL => newValue ?? sql`${column}`

// 初回承認時刻のみを確定し、以降の再承認では上書きしない。
export const coalesceApprovedAt = (column: AnyPgColumn): SQL =>
  sql`coalesce(${column}, now())`

// 非信頼ユーザーによる null 列補完: pending かつ現在値が null のときのみ埋める。
export const fillIfPendingAndNull = (
  statusColumn: AnyPgColumn,
  targetColumn: AnyPgColumn,
  newValue: unknown,
): SQL =>
  sql`CASE WHEN ${statusColumn} = 'pending' AND ${targetColumn} IS NULL THEN ${newValue} ELSE ${targetColumn} END`
