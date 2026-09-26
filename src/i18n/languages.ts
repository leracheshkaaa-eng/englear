/* ============================================================
   Interface languages — the ONLY list of UI languages.
   Adding a language = one entry here + src/i18n/locales/<code>.json.
   The order is the order shown in language selectors.
   ============================================================ */

export const LANGUAGES = [
  { code: 'uk', label: 'Українська', htmlLang: 'uk' },
  { code: 'en', label: 'English', htmlLang: 'en' },
  { code: 'de', label: 'Deutsch', htmlLang: 'de' },
  { code: 'fr', label: 'Français', htmlLang: 'fr' },
  { code: 'es', label: 'Español', htmlLang: 'es' },
  { code: 'it', label: 'Italiano', htmlLang: 'it' },
  { code: 'pt', label: 'Português', htmlLang: 'pt' },
  { code: 'pl', label: 'Polski', htmlLang: 'pl' },
  { code: 'ru', label: 'Русский', htmlLang: 'ru' },
  { code: 'zh', label: '中文', htmlLang: 'zh-Hans' }, // Simplified Chinese
  { code: 'ja', label: '日本語', htmlLang: 'ja' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

/** Used when the browser language is not supported, and for missing strings. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en'

export function isLanguageCode(code: unknown): code is LanguageCode {
  return typeof code === 'string' && LANGUAGES.some((l) => l.code === code)
}

/** "pt-BR" -> "pt", "zh-Hans-CN" -> "zh"; null if not supported. */
export function matchLanguage(tag: string | null | undefined): LanguageCode | null {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0]
  return isLanguageCode(base) ? base : null
}

/** First supported language from the browser/system preferences, else English. */
export function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return FALLBACK_LANGUAGE
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of tags) {
    const code = matchLanguage(tag)
    if (code) return code
  }
  return FALLBACK_LANGUAGE
}
