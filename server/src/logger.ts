import pino, { type Logger } from 'pino'

import type { LogLevel } from '#env'

export const createLogger = (level: LogLevel): Logger =>
  pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  })
