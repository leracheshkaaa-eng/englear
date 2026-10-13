// Grammar explanations (free for everyone): written once per topic and language, then reused.
// How much is in the learner's language depends on the topic level: the lower the level, the more
// of the explanation is in their language; from B2 on it is mostly English.

export const GRAMMAR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'sections', 'table', 'mistakes', 'tip', 'check'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'text', 'examples'],
        properties: {
          heading: { type: 'string' },
          text: { type: 'string' },
          examples: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['en', 'tr'], properties: { en: { type: 'string' }, tr: { type: 'string' } } },
          },
        },
      },
    },
    table: {
      type: 'object',
      additionalProperties: false,
      required: ['headers', 'rows'],
      properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } },
    },
    mistakes: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['wrong', 'right', 'why'], properties: { wrong: { type: 'string' }, right: { type: 'string' }, why: { type: 'string' } } },
    },
    tip: { type: 'string' },
    check: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'options', 'answer', 'why'],
        properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, why: { type: 'string' } },
      },
    },
  },
}

function languagePolicy(cefr: string, lang: string) {
  if (lang === 'English')
    return `Write everything in simple, clear English suited to a ${cefr} learner. "tr" is always "".`
  switch (cefr) {
    case 'A1':
    case 'A2':
      return `The learner is a beginner. Write the title, summary, headings, text, "why", the tip and the check questions/options-explanations in ${lang}. English appears only in example sentences ("en"), in forms inside the text (in **bold**) and in the table. Every example has "tr": its translation into ${lang}. Use very simple words and short sentences, no linguistic jargon (if a term is unavoidable, explain it in brackets). Compare with ${lang} where it helps ("in ${lang} we say…, in English…").`
    case 'B1':
      return `Write the explanation text in ${lang}, but keep grammar terms, formulas and key patterns in English (for example "Present Perfect = **have/has + V3**"). Headings may mix ${lang} and English. Examples are in English with "tr" in ${lang}.`
    case 'B2':
      return `Write mostly in clear, simple English. For tricky points add a short clarification in ${lang} in brackets. "tr" is a ${lang} translation only for hard examples, otherwise "".`
    default:
      return `Write everything in English. "tr" is always "".`
  }
}

export function grammarSystem(cefr: string, lang: string) {
  return `You write grammar explanations for EngLean, an English-learning site for Gen Z learners (14–30). The site's mascot and tutor is Lean, a sly, friendly fennec fox with huge ears that "hear every mistake".

The explanation must be as clear and easy to understand as possible — the learner reads it alone, without a teacher.

LANGUAGE (topic level ${cefr}): ${languagePolicy(cefr, lang)}

STRUCTURE
- "title": the topic name for this learner (in the explanation language, with the English name if helpful).
- "summary": 1–2 sentences: what it is and when we use it.
- "sections": 2–4 short sections that build up step by step (form → use → special cases). Each "text" is 1–4 short sentences; use **bold** for forms and key words (no other Markdown). Each section has 2–4 examples.
- "table": a table of forms if it helps (e.g. affirmative / negative / question, or pronoun → form); otherwise empty "headers" and "rows". At most 5 columns and 8 rows; cells are short.
- "mistakes": 3–5 typical mistakes, especially ones that ${lang === 'English' ? 'learners' : `${lang} speakers`} make: "wrong", "right", "why" (one short sentence).
- "tip": one short line in Lean's voice — a memory trick with a light joke (friendly, never mean), in the explanation language. Lean's name is written «Лин» in Russian, «Лін» in Ukrainian, and "Lean" in other languages; never call him a fox in the text, just Lean.
- "check": 4 multiple-choice questions to check understanding: each has 3 options, exactly one correct; "answer" is the 0-based index of the correct option — vary its position across the questions (not always the same index); "why" is one short sentence. Questions and options test the English form; the question wording follows the language rule above.

EXAMPLES: modern and relatable — school, friends, series, music, games, travel, food, pets. Everything suitable for a 14-year-old. Invent your own sentences; never quote songs, books or films. Use natural, correct English (no British/American mixing within one example).`
}

export function grammarUser(title: string, code: string, cefr: string) {
  return `Explain this grammar topic: "${title}" (code: ${code}, level ${cefr}).`
}
