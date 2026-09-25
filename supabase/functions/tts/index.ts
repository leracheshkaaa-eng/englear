// EngLear TTS: turns a short English text into an MP3 with ONE fixed Google
// Cloud voice and caches it in the public "tts-audio" bucket, so every text
// is synthesized once and then served as a plain file to everyone.
//
// Secret (Supabase dashboard -> Edge Functions -> Secrets):
//   GOOGLE_TTS_API_KEY  an API key restricted to the Text-to-Speech API
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Must match TTS_VOICE / TTS_RATE in src/lib/supabase.ts (they form the cache key).
const VOICE = 'en-US-Neural2-F'
const RATE = 0.9
const MAX_CHARS = 200
const BUCKET = 'tts-audio'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Must match ttsKey() in src/lib/supabase.ts.
async function cacheKey(text: string) {
  const bytes = new TextEncoder().encode(`${VOICE}|${RATE}|${text}`)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const { text } = await req.json().catch(() => ({ text: '' }))
    const clean = String(text ?? '').trim().replace(/\s+/g, ' ')
    if (!clean || clean.length > MAX_CHARS || !/[a-z]/i.test(clean)) return json({ error: 'invalid text' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    // Only signed-in users may create new audio (protects the TTS quota).
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await userClient.auth.getUser()
    if (!auth.user) return json({ error: 'sign in required' }, 401)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const path = `${await cacheKey(clean)}.mp3`
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

    const cached = await fetch(publicUrl, { method: 'HEAD' })
    if (cached.ok) return json({ url: publicUrl })

    const apiKey = Deno.env.get('GOOGLE_TTS_API_KEY')
    if (!apiKey) return json({ error: 'tts not configured' }, 503)

    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: clean },
        voice: { languageCode: 'en-US', name: VOICE },
        audioConfig: { audioEncoding: 'MP3', speakingRate: RATE },
      }),
    })
    if (!res.ok) {
      console.error('google tts failed', res.status, await res.text())
      return json({ error: 'tts failed' }, 502)
    }
    const { audioContent } = await res.json()
    const audio = Uint8Array.from(atob(audioContent), (c) => c.charCodeAt(0))

    const { error } = await admin.storage.from(BUCKET).upload(path, audio, { contentType: 'audio/mpeg', upsert: true })
    if (error) {
      console.error('upload failed', error.message)
      return json({ error: 'store failed' }, 500)
    }
    return json({ url: publicUrl })
  } catch (e) {
    console.error(e)
    return json({ error: 'internal error' }, 500)
  }
})
