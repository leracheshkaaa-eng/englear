// Turns a lesson package into SQL that adds its lessons to the site library as DRAFTS
// (the admin reviews and publishes them). Idempotent: a lesson whose title already exists
// in the library (same kind) is skipped, so nothing existing is changed.
// Usage: node scripts/lessons/to-sql.mjs supabase/seed/lessons/starter.json > out.sql
import { readFileSync } from 'node:fs'
import { durationSec, exerciseRow, materialText, wordCount } from './lib.mjs'

const pkg = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`
const j = (v) => `${q(JSON.stringify(v))}::jsonb`
const legacyLevel = (c) => (c.startsWith('C') ? 'advanced' : c.startsWith('B') ? 'intermediate' : 'beginner')

const out = []
for (const l of pkg.lessons) {
  const exRows = l.exercises.map((ex, i) => exerciseRow(ex, i, l.cefr))
  const lines = [
    'do $$',
    'declare lid uuid;',
    'begin',
    `  if exists (select 1 from public.lessons where scope = 'library' and kind = ${q(l.kind)} and lower(title) = lower(${q(l.title)})) then return; end if;`,
    '  insert into public.lessons (title, description, cefr, level, skill, topic, kind, scope, status, sequence, source, author_id, grammar_topic_id)',
    `  values (${q(l.title)}, ${q(l.description)}, ${q(l.cefr)}, ${q(legacyLevel(l.cefr))}, ${q(l.skill)}, ${l.topic ? q(l.topic) : 'null'}, ${q(l.kind)},`,
    `          'library', 'draft', ${l.sequence ?? 0}, 'import', (select id from public.profiles where role = 'admin' order by created_at limit 1),`,
    `          ${l.grammar ? `(select id from public.grammar_topics where code = ${q(l.grammar)})` : 'null'})`,
    '  returning id into lid;',
  ]
  if (l.kind === 'practice') {
    const text = materialText(l)
    lines.push(
      '  insert into public.lesson_materials (lesson_id, material_type, body, segments, word_count, duration_sec)',
      `  values (lid, ${q(l.material.type)}, ${q(l.material.body ?? '')}, ${j(l.material.segments ?? [])}, ${wordCount(text)}, ${durationSec(l)});`,
    )
  }
  lines.push(
    '  insert into public.exercises (lesson_id, type, position, prompt, answer, options, explanation, dialogue, data, solution) values',
    exRows
      .map((r) => `  (lid, ${q(r.type)}, ${r.position}, ${q(r.prompt)}, ${q(r.answer)}, ${j(r.options)}, ${q(r.explanation)}, ${j(r.dialogue)}, ${j(r.data)}, ${j(r.solution)})`)
      .join(',\n') + ';',
  )
  lines.push('end $$;')
  out.push(lines.join('\n'))
}
console.log(out.join('\n\n'))
