import {
  approveCatalogEntries,
  listPendingCatalogEntries,
} from '#catalog/approve'
import { registerCatalogEntries } from '#catalog/register'
import type { CatalogService } from '#catalog/types'
import type { Db } from '#db/index'

export const createCatalogService = (
  db: Db,
  approvalThreshold: number,
): CatalogService => ({
  register: (tx, input) => registerCatalogEntries(tx, input, approvalThreshold),
  approve: (input) => approveCatalogEntries(db, input, approvalThreshold),
  listPending: () => listPendingCatalogEntries(db),
})
