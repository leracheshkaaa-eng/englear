// EngLean grammar explanations: free, open to guests. Each topic × interface language is written by
// the AI once (the first time someone opens it) and stored in grammar_explanations; after that it is
// read straight from the table. At most 48 topics × 11 languages are ever generated.
//
// Secrets: ANTHROPIC_API_KEY (+ ANTHROPIC_WORKSPACE_ID); SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { GRAMMAR_SCHEMA, grammarSystem, grammarUser } from './prompt.ts'

const MODEL = 'claude-sonnet-5-5'
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', uk: 'Ukrainian', ru: 'Russian', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', pl: 'Polish', zh: 'Simplified Chinese', ja: 'Japanese',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const body = await req.json().catch(() => ({}))
  const code = String(body.lang ?? '')
  const langName = LANGUAGE_NAMES[code]
  if (!langName) return json({ error: 'bad_request' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: topic } = await admin.from('grammar_topics').select('id, code, cefr, titles').eq('id', String(body.topic_id ?? '')).maybeSingle()
  if (!topic) return json({ error: 'not_found' }, 404)
  const { data: have } = await admin.from('grammar_explanations').select('content').eq('topic_id', topic.id).eq('lang', code).maybeSingle()
  if (have) return json({ content: have.content })
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'ai_not_configured' }, 503)

  try {
    const workspace = Deno.env.get('ANTHROPIC_WORKSPACE_ID')
    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), defaultHeaders: workspace ? { 'anthropic-workspace-id': workspace } : undefined })
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 12000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: GRAMMAR_SCHEMA } },
      system: grammarSystem(topic.cefr, langName),
      messages: [{ role: 'user', content: grammarUser(topic.titles?.en ?? topic.code, topic.code, topic.cefr) }],
    } as Anthropic.MessageCreateParamsNonStreaming)
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error(`stopped: ${res.stop_reason}`)
    let raw = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    // the model keeps writing the mascot's name in Latin letters: «Лин» / «Лін» in Russian / Ukrainian
    if (code === 'ru' || code === 'uk') raw = raw.replace(/\bLean\b/g, code === 'ru' ? 'Лин' : 'Лін')
    const content = JSON.parse(raw)
    // two people opening a new topic at once: keep whichever was saved first
    await admin.from('grammar_explanations').upsert({ topic_id: topic.id, lang: code, content, model: res.model }, { onConflict: 'topic_id,lang', ignoreDuplicates: true })
    const { data: saved } = await admin.from('grammar_explanations').select('content').eq('topic_id', topic.id).eq('lang', code).maybeSingle()
    return json({ content: saved?.content ?? content })
  } catch (e) {
    console.error('grammar failed', topic.code, code, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e)
    const busy = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503))
    return json({ error: busy ? 'ai_busy' : 'ai_failed' }, busy ? 503 : 502)
  }
})
