import {
  type EnvSource,
  EnvValidationError,
  optionalEnum,
  optionalInt,
  optionalString,
  parseEnv,
  requireString,
} from '@fohte/service-kit/env'
import type { LogLevel as ServiceKitLogLevel } from '@fohte/service-kit/logger'

// Pinned to service-kit's own LogLevel union via `satisfies`, minus
// 'silent' (this app has no use case for silencing logs entirely).
const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const satisfies readonly ServiceKitLogLevel[]

type LogLevel = (typeof LOG_LEVELS)[number]

export interface Env {
  PORT: number
  LOG_LEVEL: LogLevel
  DATABASE_URL: string
  AUTH_ALLOWED_EMAILS: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  CATALOG_TRUSTED_EMAILS: string
  CATALOG_APPROVAL_THRESHOLD: number
}

const DEFAULT_PORT = 3000
const DEFAULT_LOG_LEVEL: LogLevel = 'info'
const DEFAULT_CATALOG_APPROVAL_THRESHOLD = 2

export { EnvValidationError }

// Standalone from loadEnv/Env: src/db/migrate.ts only ever needs this one
// var and must not fail on the rest of the app's required env.
export const requireDatabaseUrl = (source: EnvSource = process.env): string => {
  const result = requireString(source, 'DATABASE_URL')
  if (result.isErr()) {
    // eslint-disable-next-line no-restricted-syntax -- process bootstrap: fails fast on invalid env
    throw new EnvValidationError([result.error])
  }
  return result.value
}

export const loadEnv = (source: EnvSource = process.env): Env => {
  const result = parseEnv({
    PORT: optionalInt(source, 'PORT', DEFAULT_PORT, { min: 1, max: 65_535 }),
    LOG_LEVEL: optionalEnum(source, 'LOG_LEVEL', LOG_LEVELS, DEFAULT_LOG_LEVEL),
    DATABASE_URL: requireString(source, 'DATABASE_URL'),
    AUTH_ALLOWED_EMAILS: optionalString(source, 'AUTH_ALLOWED_EMAILS', ''),
    GOOGLE_CLIENT_ID: optionalString(source, 'GOOGLE_CLIENT_ID', ''),
    GOOGLE_CLIENT_SECRET: optionalString(source, 'GOOGLE_CLIENT_SECRET', ''),
    CATALOG_TRUSTED_EMAILS: optionalString(
      source,
      'CATALOG_TRUSTED_EMAILS',
      '',
    ),
    CATALOG_APPROVAL_THRESHOLD: optionalInt(
      source,
      'CATALOG_APPROVAL_THRESHOLD',
      DEFAULT_CATALOG_APPROVAL_THRESHOLD,
      { min: 2 },
    ),
  })
  if (result.isErr()) {
    // eslint-disable-next-line no-restricted-syntax -- process bootstrap: fails fast on invalid env
    throw result.error
  }
  return result.value
}
