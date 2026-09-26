/* ============================================================
   Interface language (i18next).
   - English is bundled and is the fallback for missing strings.
   - Other languages are loaded on demand (one small chunk each).
   - Priority: manual choice (profile or this browser) > browser language > English.
   ============================================================ */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import { detectBrowserLanguage, FALLBACK_LANGUAGE, isLanguageCode, LANGUAGES, type LanguageCode } from './languages'

export { LANGUAGES, type LanguageCode } from './languages'

const STORAGE_KEY = 'englear.interfaceLanguage'

// Every locale file becomes a lazily loaded chunk.
const loaders = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json')

async function ensureLoaded(code: LanguageCode) {
  if (i18n.hasResourceBundle(code, 'translation')) return
  const load = loaders[`./locales/${code}.json`]
  if (!load) return
  const mod = await load()
  i18n.addResourceBundle(code, 'translation', mod.default, true, true)
}

/** The language chosen manually on this device, if any. */
export function storedLanguage(): LanguageCode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLanguageCode(v) ? v : null
  } catch {
    return null
  }
}

function applyHtmlLang(code: LanguageCode) {
  const lang = LANGUAGES.find((l) => l.code === code)?.htmlLang ?? code
  document.documentElement.lang = lang
}

/** Switch the UI language. `remember` stores it as a manual choice on this device. */
export async function setLanguage(code: LanguageCode, remember = true) {
  await ensureLoaded(code)
  await i18n.changeLanguage(code)
  applyHtmlLang(code)
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      /* private mode: the choice still applies for this visit */
    }
  }
}

export function currentLanguage(): LanguageCode {
  return isLanguageCode(i18n.language) ? i18n.language : FALLBACK_LANGUAGE
}

/** Call once before rendering. */
export async function initI18n() {
  const initial = storedLanguage() ?? detectBrowserLanguage()
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  })
  await setLanguage(initial, false)
}

/* ---------- translation (native) language ----------
   The language word translations are shown in. It is a separate setting from the
   interface language; while the student has not chosen one it follows the UI language. */
let nativeLanguage: string | null = null

export function setNativeLanguage(code: string | null) {
  nativeLanguage = code
}

export function translationLanguage(): string {
  return nativeLanguage ?? currentLanguage()
}

/** For data-driven keys (topics, statuses…) that TypeScript cannot check. */
export function tKey(key: string, fallback?: string): string {
  return i18n.t(key as never, { defaultValue: fallback ?? key }) as string
}

export default i18n
