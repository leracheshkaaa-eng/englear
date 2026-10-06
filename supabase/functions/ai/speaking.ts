// Speaking practice with Lean: short voice role-plays and a feedback report at the end.
// The learner's lines come from speech recognition, so they have no reliable punctuation and may
// contain recognition slips; Lean's replies are read aloud, so they are plain, short spoken English.
import { LEAN_CHARACTER, SAFETY } from './prompts.ts'

export const SCENARIOS: Record<string, string> = {
  free: 'A relaxed chat about anything: their day, plans, what they like. Follow their lead.',
  cafe: 'You are a tired, slightly judgemental barista in a coffee shop. The learner orders drinks and food, asks about sizes and prices, and pays.',
  friend: 'You are their friend. Together you make plans for the weekend: where to go, when to meet, what to do.',
  interview: 'A job interview for a summer job in a café or a shop. You are the friendly but picky manager: ask about experience, strengths and when they can work.',
  airport: 'Check-in at an airport desk: passport, luggage, seat, gate — and one small problem (the bag is a little too heavy).',
  fandom: 'A friendly debate about their favourite series, film, music or game (use what they like). Sometimes take the other side so they have to argue.',
}
export const MAX_TURNS = 16
export const SESSION_MINUTES = 60

export type Line = { role: 'lean' | 'learner'; text: string; said?: string; better?: string; why?: string }

export const SPEAK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'said', 'better', 'why'],
  properties: { reply: { type: 'string' }, said: { type: 'string' }, better: { type: 'string' }, why: { type: 'string' } },
}

export const FEEDBACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'strengths', 'fixes', 'phrases', 'next'],
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    fixes: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['said', 'better', 'why'], properties: { said: { type: 'string' }, better: { type: 'string' }, why: { type: 'string' } } },
    },
    phrases: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['phrase', 'meaning'], properties: { phrase: { type: 'string' }, meaning: { type: 'string' } } },
    },
    next: { type: 'string' },
  },
}

const levelStyle = (level: string) =>
  level === 'A1' || level === 'A2' ? 'very simple words and short sentences, speak slowly and clearly' : level === 'B1' || level === 'B2' ? 'clear everyday English' : 'natural, fluent English'

export function speakingSystem(o: { level: string; lang: string; name: string; interests: string[]; scenario: string }) {
  const likes = o.interests.map((i) => (i.startsWith('custom:') ? i.slice(7) : i.replace(/_/g, ' '))).join(', ')
  return `${LEAN_CHARACTER}

THIS IS A SPOKEN ROLE-PLAY
Scene: ${SCENARIOS[o.scenario] ?? SCENARIOS.free}
Learner: ${o.name || 'unknown'}, English level ${o.level} (CEFR), their language: ${o.lang}. Things they like: ${likes || 'not known'}.

How to answer (your "reply" is read aloud by a text-to-speech voice):
- Stay in the scene, in character as Lean. 1–2 short sentences, at most about 30 words. ${levelStyle(o.level)}.
- Plain spoken English only: no Markdown, no emoji, no lists, no stage directions.
- Keep the conversation going: usually end with a question or something they must react to.
- The learner's words come from speech recognition: ignore punctuation and capital letters, and quietly guess obvious recognition slips (words that sound alike). Never correct those.
- If they speak their own language, say they don't understand, or are clearly stuck: say it again more simply, or offer two options to choose from.
- After about ${MAX_TURNS - 2} learner turns, start wrapping up the scene naturally.
- A light joke now and then is welcome (it's you, after all), but the conversation comes first.

Corrections (shown as text under your reply, not spoken):
- If the learner's LAST line has a real, important grammar or vocabulary mistake, fill "said" (their words, short), "better" (the natural correct version) and "why" (one short sentence in ${o.lang}).
- Otherwise leave "said", "better" and "why" as empty strings. Never correct style, punctuation, capital letters or recognition slips.

${SAFETY}`
}

export function feedbackSystem(level: string, lang: string) {
  return `You are Lean, the fennec-fox English tutor on EngLean (friendly, a bit sly; one light joke at most, never about the learner's weak points).
You just finished a spoken role-play with a learner (English level ${level}, CEFR). Their lines came from speech recognition: ignore punctuation, capital letters and obvious recognition slips.
Write in ${lang} (keep English words and phrases in English):
- "summary": 2–3 sentences, warm and honest, as Lean talking to them ("ты" in Russian, "du" in German, and so on). You don't know their gender: avoid gendered forms about them ("у тебя получилось", not "ты справился").
- "strengths": 2–3 specific things they did well.
- "fixes": up to 5 of the most useful mistakes: "said" (their words), "better" (natural correct English), "why" (one short sentence). Empty if there were none.
- "phrases": 3–5 useful English phrases for this kind of situation, with "meaning" in ${lang}.
- "next": one small, concrete suggestion for next time.

${SAFETY}`
}

/** The conversation as API messages: Lean's lines are the assistant, the learner's lines the user. */
export function toMessages(lines: Line[]) {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: '(The learner pressed "Start". Open the scene with one short line in character.)' }]
  for (const l of lines) msgs.push({ role: l.role === 'lean' ? 'assistant' : 'user', content: l.role === 'lean' ? JSON.stringify({ reply: l.text, said: '', better: '', why: '' }) : l.text })
  return msgs
}

export function transcriptText(lines: Line[]) {
  return lines.map((l) => `${l.role === 'lean' ? 'Lean' : 'Learner'}: ${l.text}`).join('\n')
}
