import '@/bootstrap'

import * as Sentry from '@sentry/node'

import { EnvError } from '@/env'
import { main } from '@/main'

// eslint-disable-next-line no-restricted-syntax -- process entrypoint: catches startup failure to flush Sentry and exit with a nonzero code
try {
  main()
} catch (err) {
  if (err instanceof EnvError) {
    for (const issue of err.issues) console.error(issue)
  } else {
    console.error(err)
  }
  Sentry.captureException(err)
  // main() can reject before anything else flushes Sentry (e.g. missing
  // env), so this exit path has to flush it directly. Imported dynamically
  // (rather than a named import above) so the bootstrap side-effect import
  // stays a bare, unsorted first import — required for OTel patching order.
  const { observability } = await import('@/bootstrap')
  await observability?.shutdown()
  process.exit(1)
}
