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

// Speak helper (English only). Never receives explanations/Russian.
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}
