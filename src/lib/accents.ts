/* ============================================================
   Accents of the learning language — the pronunciation used for audio and IPA.
   Adding an accent = one entry here (+ its voice in supabase/functions/tts).
   Only available accents can be chosen; en-US is the default.
   ============================================================ */

export type Accent = {
  code: string // stored in user_settings.accent
  label: string
  ttsVoice: string // Google Cloud voice for cached audio
  browserLang: string // fallback browser speech
  available: boolean
}

export const ACCENTS: Accent[] = [
  { code: 'en-US', label: 'American English', ttsVoice: 'en-US-Neural2-F', browserLang: 'en-US', available: true },
  { code: 'en-GB', label: 'British English', ttsVoice: 'en-GB-Neural2-A', browserLang: 'en-GB', available: false },
  { code: 'en-AU', label: 'Australian English', ttsVoice: 'en-AU-Neural2-A', browserLang: 'en-AU', available: false },
]

export const DEFAULT_ACCENT = ACCENTS[0]

/** The accent for a stored code; unknown or not-yet-available accents fall back to the default. */
export function accentFor(code: string | null | undefined): Accent {
  return ACCENTS.find((a) => a.code === code && a.available) ?? DEFAULT_ACCENT
}
