import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth'

import { type AuthDeps, buildAuthOptions } from '#auth-options'

export const createAuth = (
  deps: AuthDeps,
  options: Pick<BetterAuthOptions, 'emailAndPassword'> = {},
): Auth => betterAuth({ ...buildAuthOptions(deps), ...options })
