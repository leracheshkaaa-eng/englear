import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'
import { currentLanguage, LANGUAGES, setLanguage, type LanguageCode } from './index'

/** Interface language picker (sign-up form and Settings). Saves the choice on this device and, when signed in, in the profile. */
export function LanguageSelect() {
  const { t } = useTranslation() // re-renders on language change, so the shown value stays current
  const { userId, updateSettings } = useAuth()

  async function choose(code: LanguageCode) {
    await setLanguage(code)
    if (userId) updateSettings({ interface_language: code }).catch(() => {})
  }

  return (
    <select
      value={currentLanguage()}
      onChange={(e) => choose(e.target.value as LanguageCode)}
      aria-label={t('settings.interfaceLanguage')}
      className="w-full rounded-xl border border-line bg-paper px-3 py-2 font-body text-ink"
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  )
}
