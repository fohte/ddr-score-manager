import { hc } from 'hono/client'
import type { AppType } from 'server'

export const createApiClient = (baseUrl: string) => hc<AppType>(baseUrl)
