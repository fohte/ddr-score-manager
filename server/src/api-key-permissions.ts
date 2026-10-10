import { eq } from 'drizzle-orm'

import type { Db } from '#db/index'
import { apikey } from '#db/schema/index'

export const createApiKeyPermissionsLookup =
  (db: Db) =>
  async (apiKeyId: string): Promise<string | null> => {
    const [apiKey] = await db
      .select({ permissions: apikey.permissions })
      .from(apikey)
      .where(eq(apikey.id, apiKeyId))
      .limit(1)
    return apiKey?.permissions ?? null
  }
