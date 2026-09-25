import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'

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
   1. Cloud voice: one fixed Google voice, synthesized once by the "tts" edge
      function and cached as a public MP3, so it sounds the same everywhere.
   2. Fallback: the browser's own speech synthesis with a consistently chosen
      voice (used for guests on new texts, offline, or before TTS is configured). */

// Must match VOICE / RATE in supabase/functions/tts/index.ts.
const TTS_VOICE = 'en-US-Neural2-F'
const TTS_RATE = 0.9
const TTS_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/tts`
const TTS_FILES_URL = `${SUPABASE_URL}/storage/v1/object/public/tts-audio/`

const audioUrls = new Map<string, string>() // text -> MP3 that played fine
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
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${TTS_VOICE}|${TTS_RATE}|${text}`))
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function playCloud(text: string, seq: number, onEnd: () => void) {
  if (cloudDisabled || noCloudAudio.has(text)) throw new Error('no cloud audio')
  let url = audioUrls.get(text) ?? `${TTS_FILES_URL}${await ttsKey(text)}.mp3`
  try {
    await playUrl(url, seq, onEnd)
  } catch {
    if (seq !== playSeq) return onEnd()
    url = await generateAudio(text) // not cached yet: create it once
    await playUrl(url, seq, onEnd)
  }
  audioUrls.set(text, url)
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
    body: JSON.stringify({ text }),
  })
  if (res.status === 503) cloudDisabled = true
  if (!res.ok) throw new Error(`tts ${res.status}`)
  return (await res.json()).url as string
}

// Browser fallback: always prefer the same, clearest available US voice.
const PREFERRED_VOICES = [/natural/i, /samantha/i, /google us english/i, /aria|jenny|zira/i]
let browserVoice: SpeechSynthesisVoice | null | undefined
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => (browserVoice = undefined))
}

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  const us = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('en-us'))
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
  u.lang = 'en-US'
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
