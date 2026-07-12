import '@/bootstrap'

import { EnvError } from '@/env'
import { main } from '@/main'

try {
  main()
} catch (err) {
  if (err instanceof EnvError) {
    for (const issue of err.issues) console.error(issue)
  } else {
    console.error(err)
  }
  process.exit(1)
}
