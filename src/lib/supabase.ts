import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'
import { accentFor, DEFAULT_ACCENT, type Accent } from './accents'

export const SUPABASE_URL = `https://${projectId}.supabase.co`
export const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/make-server-526ae811`

// Browser client: anon key + the signed-in user's JWT. RLS enforces access.
export const supabase = createClient(SUPABASE_URL, publicAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Call the privileged edge function with the current user's access token. */
export async function callFunction(path: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? publicAnonKey
  const res = await fetch(`${FUNCTION_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json
}

/* ---------- Speech (English only; never receives explanations/Russian) ----------
   1. Cloud voice: the Google voice of the chosen accent (American English by
      default), synthesized once by the "tts" edge function and cached as a
      public MP3, so it sounds the same everywhere.
   2. Fallback: the browser's own speech synthesis with a consistently chosen
      voice (used for guests on new texts, offline, or before TTS is configured). */

// Must match RATE in supabase/functions/tts/index.ts (voice + rate + text form the cache key).
const TTS_RATE = 0.9
let accent: Accent = DEFAULT_ACCENT

/** Use the voice of this accent (user_settings.accent) from now on. */
export function setSpeechAccent(code: string | null | undefined) {
  const next = accentFor(code)
  if (next.code === accent.code) return
  accent = next
  browserVoice = undefined
}
const TTS_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/tts`
const TTS_FILES_URL = `${SUPABASE_URL}/storage/v1/object/public/tts-audio/`

const audioUrls = new Map<string, string>() // voice|text -> MP3 that played fine
const noCloudAudio = new Set<string>() // texts a guest cannot generate
let cloudDisabled = false // TTS not configured on the server: skip it this session
let currentAudio: HTMLAudioElement | null = null
let currentEnd: (() => void) | null = null // "finished" callback of what is playing now
let playSeq = 0 // only the latest click may start playing

/** Speak English text. `onEnd` fires once when playback ends, fails or is replaced. */
export function speak(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined') return onEnd?.()
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return onEnd?.()
  stopSpeech()
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    if (currentEnd === end) currentEnd = null
    onEnd?.()
  }
  currentEnd = end
  const seq = ++playSeq
  playCloud(clean, seq, end).catch(() => {
    if (seq === playSeq) speakWithBrowser(clean, end)
    else end()
  })
}

function stopSpeech() {
  currentAudio?.pause()
  currentAudio = null
  if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel()
  currentEnd?.()
}

async function ttsKey(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${accent.ttsVoice}|${TTS_RATE}|${text}`))
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function playCloud(text: string, seq: number, onEnd: () => void) {
  if (cloudDisabled || noCloudAudio.has(text)) throw new Error('no cloud audio')
  const cacheKey = `${accent.ttsVoice}|${text}`
  let url = audioUrls.get(cacheKey) ?? `${TTS_FILES_URL}${await ttsKey(text)}.mp3`
  try {
    await playUrl(url, seq, onEnd)
  } catch {
    if (seq !== playSeq) return onEnd()
    url = await generateAudio(text) // not cached yet: create it once
    await playUrl(url, seq, onEnd)
  }
  audioUrls.set(cacheKey, url)
}

async function playUrl(url: string, seq: number, onEnd: () => void) {
  if (seq !== playSeq) return onEnd()
  const audio = new Audio(url)
  currentAudio = audio
  await audio.play() // rejects if the file does not exist
  audio.onended = onEnd
  if (seq !== playSeq) {
    audio.pause() // a newer click won while this was loading
    onEnd()
  }
}

async function generateAudio(text: string): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    noCloudAudio.add(text)
    throw new Error('guest')
  }
  const res = await fetch(TTS_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: publicAnonKey },
    body: JSON.stringify({ text, voice: accent.ttsVoice }),
  })
  if (res.status === 503) cloudDisabled = true
  if (!res.ok) throw new Error(`tts ${res.status}`)
  return (await res.json()).url as string
}

// Browser fallback: always prefer the same, clearest available voice of the accent.
const PREFERRED_VOICES = [/natural/i, /samantha/i, /google us english/i, /aria|jenny|zira/i]
let browserVoice: SpeechSynthesisVoice | null | undefined
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => (browserVoice = undefined))
}

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  const lang = accent.browserLang.toLowerCase()
  const us = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang))
  for (const re of PREFERRED_VOICES) {
    const v = us.find((x) => re.test(x.name))
    if (v) return v
  }
  return us.find((v) => v.localService) ?? us[0] ?? null
}

function speakWithBrowser(text: string, onEnd: () => void) {
  if (!('speechSynthesis' in window)) return onEnd()
  if (!browserVoice) browserVoice = pickBrowserVoice()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = accent.browserLang
  u.rate = TTS_RATE
  if (browserVoice) u.voice = browserVoice
  u.onend = onEnd
  u.onerror = onEnd
  // Chrome may garble speech queued right after cancel(); give it a moment.
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel()
    setTimeout(() => speechSynthesis.speak(u), 60)
  } else {
    speechSynthesis.speak(u)
  }
}

/* ---------- Audio prewarm (admin) ----------
   Creates the cached MP3 for every text that does not have one yet, so students
   never wait for the first synthesis. Stops early if cloud TTS is not configured. */
export type PrewarmResult = { total: number; ready: number; created: number; failed: number; notConfigured: boolean }

export async function prewarmSpeech(texts: string[], onProgress?: (done: number, total: number) => void): Promise<PrewarmResult> {
  const unique = [...new Set(texts.map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean))]
  const result: PrewarmResult = { total: unique.length, ready: 0, created: 0, failed: 0, notConfigured: false }
  let next = 0
  let done = 0
  async function worker() {
    while (next < unique.length && !result.notConfigured) {
      const text = unique[next++]
      try {
        const url = `${TTS_FILES_URL}${await ttsKey(text)}.mp3`
        const head = await fetch(url, { method: 'HEAD' })
        if (head.ok) result.ready++
        else {
          await generateAudio(text)
          result.created++
          result.ready++
        }
      } catch {
        if (cloudDisabled) result.notConfigured = true
        else result.failed++
      }
      onProgress?.(++done, unique.length)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return result
}
