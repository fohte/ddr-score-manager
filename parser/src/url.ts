// e-amusement の href は相対 URL (例: "music_detail.html?index=...") のため、
// URL パース用にダミーの base を与える。
const DUMMY_BASE = 'https://e-amusement.invalid/'

export const getQueryParam = (
  href: string,
  param: string,
): string | undefined => {
  return new URL(href, DUMMY_BASE).searchParams.get(param) ?? undefined
}
