// EngLean AI: the tutor chat, the writing check and the lesson generator for teachers.
//
// Every request is charged on the server BEFORE the model call (ai_charge decides: plan allowance,
// free taste or coins) and refunded if the call fails. The client never decides what something costs.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY       Claude API key
//   ANTHROPIC_WORKSPACE_ID  workspace of an organization-level key (optional)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { LANGUAGE_NAMES, LEVELS, WRITING_SCHEMA, feedbackLanguage, tutorSystem, writingSystem } from './prompts.ts'
import { FEEDBACK_SCHEMA, MAX_TURNS, SCENARIOS, SESSION_MINUTES, SPEAK_SCHEMA, feedbackSystem, speakingSystem, toMessages, transcriptText, type Line } from './speaking.ts'
import { GEN_TYPES, LESSON_SCHEMA, SOLVE_SCHEMA, agrees, lessonSystem, lessonUser, ruleProblem, solverPrompt, toEditorLine, type GenExercise, type GenRequest } from './lesson.ts'

// Lean's chat and voice: the free taste runs on the fast, cheap model; paid requests (Plus or coins)
// on the wittier one. The TUTOR_MODEL secret can override the paid model.
const FREE_MODEL = 'claude-haiku-4-5'
const PAID_MODEL = Deno.env.get('TUTOR_MODEL') || 'claude-sonnet-5-5'
const chatModel = (mode: string) => (mode === 'free' ? FREE_MODEL : PAID_MODEL)
// Sonnet thinks by default; short conversational turns need little of it
const lowEffort = (model: string) => (model.includes('sonnet') ? { effort: 'low' as const } : {})
const WRITING_MODEL = 'claude-sonnet-5-5' // careful feedback on a whole text
const LESSON_MODEL = 'claude-sonnet-5-5' // writes lessons for teachers
const SOLVER_MODEL = 'claude-haiku-4-5' // independently solves the generated exercises
const MAX_MESSAGE = 1000 // characters per tutor message
const HISTORY = 20 // previous messages sent with each tutor turn
const MIN_TEXT = 20
const MAX_TEXT = 4000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function anthropic() {
  const workspace = Deno.env.get('ANTHROPIC_WORKSPACE_ID')
  return new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    defaultHeaders: workspace ? { 'anthropic-workspace-id': workspace } : undefined,
  })
}

const textOf = (msg: Anthropic.Message) =>
  msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()

const isBusy = (e: unknown) => e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503))
const ACTIONS = ['tutor', 'writing', 'lesson', 'speaking_start', 'speaking_turn', 'speaking_end']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'ai_not_configured' }, 503)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await userClient.auth.getUser()
  const user = auth.user
  if (!user) return json({ error: 'sign_in_required' }, 401)
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  if (!ACTIONS.includes(action)) return json({ error: 'unknown_action' }, 400)

  // validate input before charging anything
  const message = String(body.message ?? '').trim()
  const text = String(body.text ?? '').trim()
  const task = String(body.task ?? '').trim().slice(0, 500)
  if (action === 'tutor' && (!message || message.length > MAX_MESSAGE)) return json({ error: 'bad_message' }, 400)
  if (action === 'writing' && (text.length < MIN_TEXT || text.length > MAX_TEXT)) return json({ error: 'bad_text' }, 400)
  const scenario = String(body.scenario ?? '')
  if (action === 'speaking_start' && !SCENARIOS[scenario]) return json({ error: 'bad_request' }, 400)

  const [{ data: profile }, { data: settings }, { data: likes }] = await Promise.all([
    admin.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle(),
    admin.from('user_settings').select('english_level, native_language, interface_language').eq('user_id', user.id).maybeSingle(),
    admin.from('user_interests').select('interests').eq('user_id', user.id).maybeSingle(),
  ])
  // the learner's own answers are short free text: keep only letters, digits, spaces and a few signs
  const interests = ((likes?.interests ?? []) as string[]).slice(0, 30).map((i) => i.replace(/[^\p{L}\p{N} _:'&.-]/gu, '').slice(0, 48)).filter(Boolean)
  const hour = Number.isInteger(body.hour) && body.hour >= 0 && body.hour < 24 ? (body.hour as number) : null
  const level = LEVELS.includes(settings?.english_level) ? settings!.english_level : 'A1'
  const lang = feedbackLanguage(settings)

  if (action === 'speaking_turn' || action === 'speaking_end') {
    const { data: ses } = await admin.from('speaking_sessions').select('*').eq('id', String(body.session_id ?? '')).eq('user_id', user.id).maybeSingle()
    if (!ses) return json({ error: 'session_not_found' }, 404)
    const lines = (ses.transcript ?? []) as Line[]
    const model = chatModel(ses.mode)
    // the session's token use is added to its usage row
    const addTokens = async (res: Anthropic.Message) => {
      if (!ses.usage_id) return
      const { data: u } = await admin.from('ai_usage').select('input_tokens, output_tokens').eq('id', ses.usage_id).maybeSingle()
      await admin.rpc('ai_finish', { p_usage: ses.usage_id, p_model: res.model, p_in: (u?.input_tokens ?? 0) + res.usage.input_tokens, p_out: (u?.output_tokens ?? 0) + res.usage.output_tokens })
    }
    try {
      if (action === 'speaking_end') {
        if (ses.feedback) return json({ feedback: ses.feedback })
        if (!lines.some((l) => l.role === 'learner')) {
          await admin.from('speaking_sessions').update({ ended_at: new Date().toISOString() }).eq('id', ses.id)
          return json({ feedback: null })
        }
        const res = await anthropic().messages.create({
          model,
          max_tokens: 3000,
          output_config: { ...lowEffort(model), format: { type: 'json_schema', schema: FEEDBACK_SCHEMA } },
          system: feedbackSystem(ses.level, lang),
          messages: [{ role: 'user', content: `Scene: ${SCENARIOS[ses.scenario] ?? ''}\n\nTranscript:\n${transcriptText(lines)}` }],
        } as Anthropic.MessageCreateParamsNonStreaming)
        const feedback = JSON.parse(textOf(res))
        await admin.from('speaking_sessions').update({ feedback, ended_at: new Date().toISOString() }).eq('id', ses.id)
        await addTokens(res)
        return json({ feedback })
      }

      const said = String(body.text ?? '').trim().slice(0, 400)
      if (!said) return json({ error: 'bad_message' }, 400)
      if (ses.ended_at || ses.turns >= MAX_TURNS || Date.now() - Date.parse(ses.created_at) > SESSION_MINUTES * 60_000) return json({ error: 'session_over' }, 409)
      const next: Line[] = [...lines, { role: 'learner', text: said }]
      const res = await anthropic().messages.create({
        model,
        max_tokens: 800,
        output_config: { ...lowEffort(model), format: { type: 'json_schema', schema: SPEAK_SCHEMA } },
        system: speakingSystem({ level: ses.level, lang, name: profile?.full_name ?? '', interests, scenario: ses.scenario }),
        messages: toMessages(next),
      } as Anthropic.MessageCreateParamsNonStreaming)
      if (res.stop_reason === 'refusal') throw new Error('refused')
      const out = JSON.parse(textOf(res)) as { reply: string; said: string; better: string; why: string }
      const fix = out.said && out.better ? { said: out.said.slice(0, 200), better: out.better.slice(0, 200), why: out.why.slice(0, 300) } : null
      if (fix) next[next.length - 1] = { ...next[next.length - 1], ...fix }
      next.push({ role: 'lean', text: out.reply.slice(0, 600) })
      await admin.from('speaking_sessions').update({ transcript: next, turns: ses.turns + 1 }).eq('id', ses.id)
      await addTokens(res)
      return json({ reply: out.reply.slice(0, 600), fix, turns_left: MAX_TURNS - ses.turns - 1 })
    } catch (e) {
      console.error('speaking failed', action, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e)
      return json({ error: isBusy(e) ? 'ai_busy' : 'ai_failed' }, isBusy(e) ? 503 : 502)
    }
  }

  // lesson generator: teachers only; the request is checked before charging
  let gen: GenRequest | null = null
  if (action === 'lesson') {
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') return json({ error: 'teachers_only' }, 403)
    const types = (Array.isArray(body.types) ? body.types : []).filter((x: string) => (GEN_TYPES as readonly string[]).includes(x))
    const count = Math.round(Number(body.count) || 0)
    const genLevel = String(body.level ?? '')
    if (!LEVELS.includes(genLevel) || !types.length || count < 4 || count > 15) return json({ error: 'bad_request' }, 400)
    const explainCode = String(body.explain_lang ?? '')
    gen = {
      level: genLevel,
      focus: body.focus === 'grammar' || body.focus === 'vocabulary' ? body.focus : 'mixed',
      grammar: String(body.grammar ?? '').trim().slice(0, 120),
      topic: String(body.topic ?? '').trim().slice(0, 120),
      count,
      types,
      wishes: String(body.wishes ?? '').trim().slice(0, 400),
      explainLang: LANGUAGE_NAMES[explainCode] ?? lang,
    }
  }

  // conversation must belong to this user (checked before charging)
  let conversationId: string | null = null
  if (action === 'tutor' && body.conversation_id) {
    const { data: conv } = await admin.from('ai_conversations').select('id').eq('id', body.conversation_id).eq('user_id', user.id).maybeSingle()
    if (!conv) return json({ error: 'conversation_not_found' }, 404)
    conversationId = conv.id
  }

  const kind = action === 'speaking_start' ? 'speaking' : action
  const { data: charge, error: chargeErr } = await admin.rpc('ai_charge', { p_user: user.id, p_kind: kind, p_key: crypto.randomUUID() })
  if (chargeErr) {
    if (chargeErr.hint === 'not_enough_coins') return json({ error: 'not_enough_coins' }, 402)
    console.error('ai_charge', chargeErr)
    return json({ error: 'charge_failed' }, 500)
  }
  const usageId = charge.usage_id as number

  try {
    if (action === 'tutor') {
      let history: { role: 'user' | 'assistant'; content: string }[] = []
      if (conversationId) {
        const { data } = await admin
          .from('ai_messages')
          .select('role, content')
          .eq('conversation_id', conversationId)
          .order('id', { ascending: false })
          .limit(HISTORY)
        history = (data ?? []).reverse()
        while (history.length && history[0].role !== 'user') history.shift() // must start with the user
      }
      const model = chatModel(charge.mode)
      const res = await anthropic().messages.create({
        model,
        max_tokens: 1200,
        ...(model.includes('sonnet') ? { output_config: lowEffort(model) } : {}),
        system: tutorSystem({ level, lang, name: profile?.full_name ?? '', interests, hour }),
        messages: [...history, { role: 'user', content: message }],
      } as Anthropic.MessageCreateParamsNonStreaming)
      const reply = textOf(res)
      if (res.stop_reason === 'refusal' || !reply) throw new Error('empty_or_refused')

      if (!conversationId) {
        const { data: conv, error } = await admin
          .from('ai_conversations')
          .insert({ user_id: user.id, title: message.slice(0, 60) })
          .select('id')
          .single()
        if (error) throw error
        conversationId = conv.id
      }
      const { error: insErr } = await admin.from('ai_messages').insert([
        { conversation_id: conversationId, user_id: user.id, role: 'user', content: message },
        { conversation_id: conversationId, user_id: user.id, role: 'assistant', content: reply.slice(0, 8000) },
      ])
      if (insErr) throw insErr
      await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
      await admin.rpc('ai_finish', { p_usage: usageId, p_model: res.model, p_in: res.usage.input_tokens, p_out: res.usage.output_tokens })
      return json({ conversation_id: conversationId, reply, mode: charge.mode, coins: charge.coins })
    }

    if (action === 'speaking_start') {
      const model = chatModel(charge.mode)
      const res = await anthropic().messages.create({
        model,
        max_tokens: 600,
        output_config: { ...lowEffort(model), format: { type: 'json_schema', schema: SPEAK_SCHEMA } },
        system: speakingSystem({ level, lang, name: profile?.full_name ?? '', interests, scenario }),
        messages: toMessages([]),
      } as Anthropic.MessageCreateParamsNonStreaming)
      if (res.stop_reason === 'refusal') throw new Error('refused')
      const reply = String(JSON.parse(textOf(res)).reply ?? '').slice(0, 600)
      if (!reply) throw new Error('empty')
      const { data: ses, error } = await admin
        .from('speaking_sessions')
        .insert({ user_id: user.id, scenario, level, usage_id: usageId, mode: charge.mode, transcript: [{ role: 'lean', text: reply }] })
        .select('id')
        .single()
      if (error) throw error
      await admin.rpc('ai_finish', { p_usage: usageId, p_model: res.model, p_in: res.usage.input_tokens, p_out: res.usage.output_tokens })
      return json({ session_id: ses.id, reply, turns_left: MAX_TURNS, mode: charge.mode, coins: charge.coins })
    }

    if (action === 'lesson' && gen) {
      const client = anthropic()
      const res = await client.messages.create({
        model: LESSON_MODEL,
        max_tokens: 12000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: LESSON_SCHEMA } },
        system: lessonSystem(gen),
        messages: [{ role: 'user', content: lessonUser(gen) }],
      } as Anthropic.MessageCreateParamsNonStreaming)
      if (res.stop_reason === 'refusal') throw new Error('refused')
      const draft = JSON.parse(textOf(res)) as { title: string; description: string; exercises: GenExercise[] }

      // 1) rules
      const dropped: { n: number; reason: string }[] = []
      const ok: { n: number; ex: GenExercise }[] = []
      draft.exercises.forEach((ex, i) => {
        const problem = ruleProblem(ex, gen!.level)
        if (problem) dropped.push({ n: i + 1, reason: problem })
        else ok.push({ n: i + 1, ex })
      })
      // 2) an independent solver must reach the same answers
      let inTok = res.usage.input_tokens
      let outTok = res.usage.output_tokens
      const toSolve = ok.filter((x) => x.ex.type !== 'listen')
      let kept = ok
      if (toSolve.length) {
        const sol = await client.messages.create({
          model: SOLVER_MODEL,
          max_tokens: 2000,
          output_config: { format: { type: 'json_schema', schema: SOLVE_SCHEMA } },
          messages: [{ role: 'user', content: solverPrompt(toSolve, gen.level) }],
        } as Anthropic.MessageCreateParamsNonStreaming)
        inTok += sol.usage.input_tokens
        outTok += sol.usage.output_tokens
        const answers = new Map((JSON.parse(textOf(sol)).answers as { n: number; answer: string }[]).map((a) => [a.n, a.answer]))
        kept = ok.filter(({ n, ex }) => {
          if (ex.type === 'listen') return true
          const given = answers.get(n)
          if (given !== undefined && agrees(ex, given)) return true
          dropped.push({ n, reason: 'ambiguous: an independent check answered differently' })
          return false
        })
      }
      if (!kept.length) throw new Error('nothing_left')
      await admin.rpc('ai_finish', { p_usage: usageId, p_model: res.model, p_in: inTok, p_out: outTok })
      return json({
        title: String(draft.title ?? '').slice(0, 120),
        description: String(draft.description ?? '').slice(0, 300),
        raw: kept.map(({ ex }) => toEditorLine(ex, gen!.level)).join('\n'),
        kept: kept.length,
        dropped: dropped.sort((a, b) => a.n - b.n),
        mode: charge.mode,
        coins: charge.coins,
      })
    }

    // writing check
    const res = await anthropic().messages.create({
      model: WRITING_MODEL,
      max_tokens: 6000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: WRITING_SCHEMA } },
      system: writingSystem(level, lang),
      messages: [
        {
          role: 'user',
          content: `${task ? `Task: ${task}\n\n` : 'There is no set task; the learner wrote freely.\n\n'}The learner's text:\n"""\n${text}\n"""`,
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming)
    if (res.stop_reason === 'refusal') throw new Error('refused')
    const result = JSON.parse(textOf(res))
    const clamp = (n: unknown) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)))
    for (const k of ['grammar', 'vocabulary', 'organization', 'task']) result.scores[k] = clamp(result.scores[k])
    result.mistakes = (result.mistakes ?? []).slice(0, 20)

    const { data: saved, error } = await admin
      .from('writing_checks')
      .insert({ user_id: user.id, task, text, level, result })
      .select('id, created_at')
      .single()
    if (error) throw error
    await admin.rpc('ai_finish', { p_usage: usageId, p_model: res.model, p_in: res.usage.input_tokens, p_out: res.usage.output_tokens })
    return json({ id: saved.id, created_at: saved.created_at, result, mode: charge.mode, coins: charge.coins })
  } catch (e) {
    console.error('ai failed', action, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e)
    await admin.rpc('ai_refund', { p_usage: usageId })
    return json({ error: isBusy(e) ? 'ai_busy' : 'ai_failed' }, isBusy(e) ? 503 : 502)
  }
})
