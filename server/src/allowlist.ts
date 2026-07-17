export interface AllowlistPolicy {
  isAllowed(email: string): boolean
}

// Failure mode is deny-all: an unset or empty AUTH_ALLOWED_EMAILS yields an
// empty set, so isAllowed() rejects every email instead of admitting
// everyone on a misconfiguration.
export const createAllowlistPolicy = (
  rawAllowedEmails: string | undefined,
): AllowlistPolicy => {
  const allowed = new Set(
    (rawAllowedEmails ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )

  return {
    isAllowed: (email) => allowed.has(email.trim().toLowerCase()),
  }
}
