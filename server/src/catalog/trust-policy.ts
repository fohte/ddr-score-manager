export interface CatalogTrustPolicy {
  /** CATALOG_TRUSTED_EMAILS (カンマ区切り) を検査する。大文字小文字は区別しない */
  isTrusted(email: string): boolean
}

export const createCatalogTrustPolicy = (
  trustedEmailsCsv: string,
): CatalogTrustPolicy => {
  const trustedEmails = new Set(
    trustedEmailsCsv
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )

  return {
    isTrusted: (email) => trustedEmails.has(email.trim().toLowerCase()),
  }
}
