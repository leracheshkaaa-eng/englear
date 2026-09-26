import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'
import { currentLanguage, LANGUAGES, setLanguage, type LanguageCode } from './index'

/** Interface language picker. Saves the choice on this device and, when signed in, in the profile. */
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation() // re-renders on language change, so the shown value stays current
  const { userId, updateSettings } = useAuth()

  async function choose(code: LanguageCode) {
    await setLanguage(code)
    if (userId) updateSettings({ interface_language: code }).catch(() => {})
  }

  return (
    <label className={`inline-flex items-center gap-1 ${compact ? '' : 'w-full'}`}>
      <span aria-hidden className={compact ? 'text-mute' : 'sr-only'}>🌐</span>
      <select
        value={currentLanguage()}
        onChange={(e) => choose(e.target.value as LanguageCode)}
        aria-label={t('settings.interfaceLanguage')}
        className={
          compact
            ? 'rounded-full border border-line bg-paper px-2 py-1 font-body text-sm text-ink'
            : 'w-full rounded-xl border border-line bg-paper px-3 py-2 font-body text-ink'
        }
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
