import type { Level as PinoLevel } from 'pino'

// Pinned to pino's own Level union via `satisfies` so a future pino major
// that changes the accepted levels fails to compile here instead of
// silently drifting from what pino actually accepts.
const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const satisfies readonly PinoLevel[]

export type LogLevel = (typeof LOG_LEVELS)[number]

export interface Env {
  PORT: number
  LOG_LEVEL: LogLevel
  DATABASE_URL: string
  CATALOG_TRUSTED_EMAILS: string
  CATALOG_APPROVAL_THRESHOLD: number
}

const DEFAULT_PORT = 3000
const DEFAULT_LOG_LEVEL: LogLevel = 'info'
const DEFAULT_CATALOG_APPROVAL_THRESHOLD = 2

const isLogLevel = (value: string): value is LogLevel =>
  (LOG_LEVELS as readonly string[]).includes(value)

export class EnvError extends Error {
  constructor(
    public readonly issues: readonly string[],
    message?: string,
  ) {
    super(message ?? `invalid environment: ${issues.join('; ')}`)
    this.name = 'EnvError'
  }
}

const missingEnvMessage = (key: string): string =>
  `missing required env: ${key}`

// Standalone from loadEnv/Env: src/db/migrate.ts only ever needs this one
// var and must not fail on the rest of the app's required env.
export const requireDatabaseUrl = (
  source: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const raw = source['DATABASE_URL']
  if (raw === undefined || raw === '') {
    throw new EnvError([missingEnvMessage('DATABASE_URL')])
  }
  return raw
}

export const loadEnv = (
  source: Readonly<Record<string, string | undefined>> = process.env,
): Env => {
  const issues: string[] = []

  const parseDatabaseUrl = (): string => {
    const raw = source['DATABASE_URL']
    if (raw === undefined || raw === '') {
      issues.push(missingEnvMessage('DATABASE_URL'))
      return ''
    }
    return raw
  }

  const parsePort = (): number => {
    const raw = source['PORT']
    if (raw === undefined) return DEFAULT_PORT
    const parsed = Number(raw)
    if (
      raw === '' ||
      !Number.isInteger(parsed) ||
      parsed <= 0 ||
      parsed > 65_535
    ) {
      issues.push(`PORT must be a valid TCP port (got: ${raw})`)
      return DEFAULT_PORT
    }
    return parsed
  }

  const parseLogLevel = (): LogLevel => {
    const raw = source['LOG_LEVEL']
    if (raw === undefined) return DEFAULT_LOG_LEVEL
    if (!isLogLevel(raw)) {
      issues.push(
        `LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got: ${raw})`,
      )
      return DEFAULT_LOG_LEVEL
    }
    return raw
  }

  const parseCatalogApprovalThreshold = (): number => {
    const raw = source['CATALOG_APPROVAL_THRESHOLD']
    if (raw === undefined) return DEFAULT_CATALOG_APPROVAL_THRESHOLD
    const parsed = Number(raw)
    if (raw === '' || !Number.isInteger(parsed) || parsed < 2) {
      issues.push(
        `CATALOG_APPROVAL_THRESHOLD must be an integer >= 2 (got: ${raw})`,
      )
      return DEFAULT_CATALOG_APPROVAL_THRESHOLD
    }
    return parsed
  }

  const env: Env = {
    PORT: parsePort(),
    LOG_LEVEL: parseLogLevel(),
    DATABASE_URL: parseDatabaseUrl(),
    CATALOG_TRUSTED_EMAILS: source['CATALOG_TRUSTED_EMAILS'] ?? '',
    CATALOG_APPROVAL_THRESHOLD: parseCatalogApprovalThreshold(),
  }

  if (issues.length > 0) {
    throw new EnvError(issues)
  }

  return env
}
