import { supabase } from './supabase'
import { exerciseToRow, rowToExercise, type Exercise, type ExerciseRow, type Response } from './exercises'
import { translationLanguage } from '../i18n'

export type Role = 'student' | 'teacher' | 'admin'
export type TeacherRequest = 'none' | 'pending'
export type Profile = {
  id: string
  full_name: string
  role: Role
  avatar: string
  /** a frame bought in the shop (item code) */
  frame?: string | null
  teacher_request: TeacherRequest
  created_at?: string
}

export type LessonScope = 'library' | 'teacher'
export type LessonStatus = 'draft' | 'review' | 'published'
export const LESSON_SKILLS = ['vocabulary', 'grammar', 'listening', 'reading', 'writing', 'speaking', 'mixed'] as const
export type LessonSkill = (typeof LESSON_SKILLS)[number]

/** A lesson without its exercises (catalog cards, lists). */
export type LessonSummary = {
  id: string
  title: string
  description: string
  /** legacy level (beginner / intermediate / advanced); cefr is the real level */
  level: string
  cefr: string | null
  scope: LessonScope
  skill: LessonSkill
  topic: string | null
  grammar_topic_id: string | null
  sequence: number
  status: LessonStatus
  author_id: string | null
  exercise_count: number
  /** 'lesson': grammar / vocabulary; 'practice': a reading or listening material with questions */
  kind: LessonKind
  position: number
}

export type LessonKind = 'lesson' | 'practice'
/** Skills of the Practice section (writing / speaking later). */
export const PRACTICE_SKILLS = ['reading', 'listening'] as const

export type MaterialType =
  | 'article' | 'story' | 'blog' | 'email' | 'letter' | 'notice' | 'advert' | 'review' | 'interview_text'
  | 'podcast' | 'dialogue' | 'interview' | 'announcement' | 'monologue' | 'radio'

/** Catalog rows also carry the material's type and length (practice). */
export type CatalogLesson = LessonSummary & { material_type: MaterialType | null; word_count: number; duration_sec: number }

/** The text (reading) or script (listening) of a practice lesson. */
export type Material = {
  lesson_id: string
  material_type: MaterialType
  body: string
  segments: { speaker: string; text: string }[]
  audio_url: string
  word_count: number
  duration_sec: number
}

export type Lesson = LessonSummary & {
  /** kept in sync with scope/status by the database */
  visibility: 'public' | 'private'
  is_published: boolean
  exercises: Exercise[]
}

const LESSON_SUMMARY =
  'id, title, description, level, cefr, scope, skill, topic, grammar_topic_id, sequence, status, author_id, exercise_count, position, kind'

/** Legacy level for the old `level` column, derived from the CEFR level. */
const legacyLevel = (cefr: string | null | undefined) =>
  cefr?.startsWith('C') ? 'advanced' : cefr?.startsWith('B') ? 'intermediate' : 'beginner'

/* ---------- profiles / settings ---------- */

export async function getProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  return data as Profile | null
}

/** Update own nickname / avatar. (role is protected by a DB trigger.) */
export async function updateProfile(id: string, patch: { full_name?: string; avatar?: string; frame?: string | null }) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) throw error
}

/** A student asks to become a teacher; the admin approves it later. */
export async function requestTeacher(id: string) {
  const { error } = await supabase.from('profiles').update({ teacher_request: 'pending' }).eq('id', id)
  if (error) throw error
}

export type Settings = {
  translations_enabled: boolean
  translation_mode: string
  english_level: string
  /** UI language; null = not chosen yet (detected from the browser) */
  interface_language: string | null
  /** language of word translations; null = same as the UI language */
  native_language: string | null
  learning_language: string
  accent: string
}
export const DEFAULT_SETTINGS: Settings = {
  translations_enabled: true,
  translation_mode: 'on',
  english_level: 'A1',
  interface_language: null,
  native_language: null,
  learning_language: 'en',
  accent: 'en-US',
}
export async function getSettings(userId: string): Promise<Settings> {
  const { data } = await supabase
    .from('user_settings')
    .select('translations_enabled, translation_mode, english_level, interface_language, native_language, learning_language, accent')
    .eq('user_id', userId)
    .maybeSingle()
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) }
}
export async function saveSettings(userId: string, s: Partial<Settings>) {
  await supabase.from('user_settings').upsert({ user_id: userId, ...s })
}

/** Self-heal admin: promotes the caller iff their JWT email == admin_email(). */
export async function claimAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc('claim_admin')
  return data === true
}

/* ---------- lessons + exercises ---------- */

export type LessonFilters = {
  scope: LessonScope
  cefr?: string[]
  skill?: string
  topic?: string
  grammarTopicId?: string
  q?: string
  /** 'lesson' (default) or 'practice' */
  kind?: LessonKind
  /** any of these skills (e.g. grammar + vocabulary + mixed) */
  skills?: string[]
}

/** One page of the lesson catalog (no exercises) and the total number of matches.
 *  RLS decides what is visible: published library lessons for everyone;
 *  teacher lessons for their author, assigned students and admins. */
export async function lessonCatalog(f: LessonFilters, from: number, pageSize: number): Promise<{ lessons: CatalogLesson[]; total: number }> {
  const { data, error } = await supabase.rpc('lesson_catalog', {
    p_scope: f.scope,
    p_cefr: f.cefr?.length ? f.cefr : null,
    p_skill: f.skill || null,
    p_topic: f.topic || null,
    p_grammar: f.grammarTopicId || null,
    p_q: f.q ?? '',
    p_limit: pageSize,
    p_offset: from,
    p_kind: f.kind ?? 'lesson',
    p_skills: f.skills?.length ? f.skills : null,
  })
  if (error) throw error
  const rows = (data ?? []) as (CatalogLesson & { total: number })[]
  return { lessons: rows.map(({ total: _total, ...l }) => l), total: rows[0]?.total ?? 0 }
}

/** Lessons for the teacher tab: the teacher's own lessons; an admin sees all (library + teacher). */
export async function teacherLessons(userId: string, isAdmin: boolean): Promise<LessonSummary[]> {
  let query = supabase.from('lessons').select(LESSON_SUMMARY)
  if (!isAdmin) query = query.eq('author_id', userId)
  const { data, error } = await query.order('scope').order('cefr').order('sequence').order('position')
  if (error) throw error
  return (data ?? []) as LessonSummary[]
}

/** Summaries of the given lessons (e.g. the ones a student has progress in). */
export async function lessonSummaries(ids: string[]): Promise<LessonSummary[]> {
  if (!ids.length) return []
  const { data, error } = await supabase.from('lessons').select(LESSON_SUMMARY).in('id', ids)
  if (error) throw error
  return (data ?? []) as LessonSummary[]
}

/** Exercise columns a player needs. The answers (answer, solution) are not read here:
 *  the server checks answers, and editors get them through lesson_solutions(). */
// dialogue_public: the dialogue with the answers of its gaps blanked out
const EXERCISE_PUBLIC = 'id, lesson_id, type, position, prompt, options, explanation, dialogue:dialogue_public, data'

/** A lesson with its exercises. `withSolutions`: for the editor (its author / an admin). */
export async function getLesson(id: string, opts: { withSolutions?: boolean } = {}): Promise<Lesson | null> {
  const { data: l } = await supabase.from('lessons').select('*').eq('id', id).maybeSingle()
  if (!l) return null
  const { data: exs } = await supabase.from('exercises').select(EXERCISE_PUBLIC).eq('lesson_id', id).order('position')
  const rows = (exs ?? []) as unknown as ExerciseRow[]
  if (opts.withSolutions) {
    const { data: sol, error } = await supabase.rpc('lesson_solutions', { p_lesson_id: id })
    if (error) throw error
    const byId = new Map(
      ((sol ?? []) as { exercise_id: string; answer: string; solution: Record<string, unknown>; dialogue: ExerciseRow['dialogue'] }[]).map((s) => [s.exercise_id, s]),
    )
    for (const r of rows) {
      const s = r.id ? byId.get(r.id) : undefined
      if (s) Object.assign(r, { answer: s.answer, solution: s.solution, dialogue: s.dialogue })
    }
  }
  return { ...l, exercises: rows.map((e) => rowToExercise({ ...e, answer: e.answer ?? '' })) } as Lesson
}

/** A grammar topic of the library (A1–C2); titles in every interface language. */
export type GrammarTopic = { id: string; code: string; cefr: string | null; titles: Record<string, string>; position: number }

let grammarCache: Promise<GrammarTopic[]> | null = null
/** All grammar topics in course order (loaded once). */
export function grammarTopics(): Promise<GrammarTopic[]> {
  grammarCache ??= (async () => {
    const { data, error } = await supabase.from('grammar_topics').select('id, code, cefr, titles, position').order('position')
    if (error) throw error
    return (data ?? []) as GrammarTopic[]
  })().catch((e) => {
    grammarCache = null
    throw e
  })
  return grammarCache
}

/** The title in the interface language (English if missing). */
export const grammarTitle = (g: Pick<GrammarTopic, 'titles' | 'code'>, lang: string) => g.titles[lang] ?? g.titles.en ?? g.code

/** The text / script of a practice lesson (null for ordinary lessons). */
export async function getMaterial(lessonId: string): Promise<Material | null> {
  const { data, error } = await supabase.from('lesson_materials').select('*').eq('lesson_id', lessonId).maybeSingle()
  if (error) throw error
  return (data as Material | null) ?? null
}

/** Correct answers (as text) of a lesson: for its editors, and for a student after completing it. */
export async function lessonSolutions(lessonId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('lesson_solutions', { p_lesson_id: lessonId })
  if (error) throw error
  return Object.fromEntries(((data ?? []) as { exercise_id: string; correct_answer: string }[]).map((s) => [s.exercise_id, s.correct_answer ?? '']))
}

export type Verdict = { correct: boolean; correctAnswer: string }

/** Grade without saving (guests, and a guest's unchecked answers at the end). */
export async function gradeAnswers(items: { exerciseId: string; response: Response }[]): Promise<Record<string, Verdict>> {
  if (!items.length) return {}
  const { data, error } = await supabase.rpc('grade_answers', {
    p_items: items.map((i) => ({ exercise_id: i.exerciseId, response: i.response })),
  })
  if (error) throw error
  return Object.fromEntries(
    ((data ?? []) as { exercise_id: string; correct: boolean; correct_answer: string }[]).map((r) => [r.exercise_id, { correct: r.correct, correctAnswer: r.correct_answer ?? '' }]),
  )
}

export type NewLesson = {
  title: string
  description: string
  cefr: string
  skill: LessonSkill
  topic: string | null
  /** 'library' only for admins (enforced by the database) */
  scope: LessonScope
  status: LessonStatus
  sequence: number
  exercises: Exercise[]
  /** default 'lesson' */
  kind?: LessonKind
  grammar_topic_id?: string | null
}

const lessonRow = (input: Partial<NewLesson>) => {
  const { exercises: _exercises, ...rest } = input
  return rest.cefr ? { ...rest, level: legacyLevel(rest.cefr) } : rest
}

export async function createLesson(authorId: string, input: NewLesson): Promise<string> {
  const { data: lesson, error } = await supabase
    .from('lessons')
    .insert({ ...lessonRow(input), author_id: authorId })
    .select('id')
    .single()
  if (error) throw error
  await saveLessonExercises(lesson.id, input.exercises)
  return lesson.id
}

export async function updateLesson(id: string, patch: Partial<NewLesson>) {
  const row = lessonRow(patch)
  if (Object.keys(row).length) {
    const { error } = await supabase.from('lessons').update(row).eq('id', id)
    if (error) throw error
  }
  if (patch.exercises) await saveLessonExercises(id, patch.exercises)
}

/** Create or replace the text / script of a practice lesson. */
export async function saveMaterial(lessonId: string, m: Omit<Material, 'lesson_id'>) {
  const { error } = await supabase.from('lesson_materials').upsert({ lesson_id: lessonId, ...m }, { onConflict: 'lesson_id' })
  if (error) throw error
}

/** Dictionary words linked to a lesson. */
export async function lessonWordIds(lessonId: string): Promise<string[]> {
  const { data, error } = await supabase.from('lesson_words').select('word_id').eq('lesson_id', lessonId)
  if (error) throw error
  return (data ?? []).map((r) => r.word_id as string)
}

/** Replace the dictionary words linked to a lesson. */
export async function setLessonWords(lessonId: string, wordIds: string[]) {
  const current = new Set(await lessonWordIds(lessonId))
  const wanted = new Set(wordIds)
  const remove = [...current].filter((id) => !wanted.has(id))
  const add = [...wanted].filter((id) => !current.has(id))
  if (remove.length) {
    const { error } = await supabase.from('lesson_words').delete().eq('lesson_id', lessonId).in('word_id', remove)
    if (error) throw error
  }
  if (add.length) {
    const { error } = await supabase.from('lesson_words').insert(add.map((word_id) => ({ lesson_id: lessonId, word_id })))
    if (error) throw error
  }
}

export type ExerciseSaveImpact = { deleted: number; affected_answers: number; affected_attempts: number }

/** Save a lesson's exercises in one transaction. Unchanged and edited exercises keep
 *  their ids (and students' answers); only exercises removed from the text are deleted.
 *  With dryRun nothing is written — it only reports what would be deleted. */
export async function saveLessonExercises(lessonId: string, exercises: Exercise[], dryRun = false): Promise<ExerciseSaveImpact> {
  const { data, error } = await supabase.rpc('save_lesson_exercises', {
    p_lesson_id: lessonId,
    p_exercises: exercises.map((ex, i) => exerciseToRow(ex, i)),
    p_dry_run: dryRun,
  })
  if (error) throw error
  return data as ExerciseSaveImpact
}

export async function deleteLesson(id: string) {
  const { error } = await supabase.from('lessons').delete().eq('id', id)
  if (error) throw error
}

export async function reorderLessons(ordered: { id: string; position: number }[]) {
  for (const { id, position } of ordered) await supabase.from('lessons').update({ position }).eq('id', id)
}

/* ---------- migration: localStorage -> Supabase ---------- */

export async function importLessons(authorId: string, lessons: NewLesson[]): Promise<{ imported: number; skipped: number }> {
  // Dedup by title against existing lessons authored by this user.
  const { data: existing } = await supabase.from('lessons').select('title').eq('author_id', authorId)
  const have = new Set((existing ?? []).map((l) => l.title.trim().toLowerCase()))
  let imported = 0
  let skipped = 0
  for (const l of lessons) {
    if (have.has(l.title.trim().toLowerCase())) {
      skipped++
      continue
    }
    await createLesson(authorId, l)
    have.add(l.title.trim().toLowerCase())
    imported++
  }
  return { imported, skipped }
}

/* ---------- dictionary ----------
   Words are English (the learning language); their translations live in
   word_translations, one row per language. Reads embed only the translation
   language needed, so the payload stays small as languages are added. */

export type WordType = 'word' | 'collocation' | 'phrasal_verb'

/** An extra meaning of a word (the main meaning lives in the word's own fields). */
export type Meaning = {
  /** stable id within the word; flashcards refer to a meaning by it */
  key: string
  part_of_speech?: string
  cefr?: string
  definition?: string
  examples?: string[]
  translations?: Record<string, string>
}

export type Word = {
  id: string
  word: string
  /** legacy Russian translation column; use wordTranslation() instead */
  translation: string
  part_of_speech: string
  example: string
  pronunciation: string
  cefr_level: string
  definition: string
  examples: string[]
  meanings: Meaning[]
  topic: string
  related: string[]
  word_type: WordType
  ielts_category: string | null
  language?: string
  /** translations by language code (only the requested languages are loaded) */
  translations?: Record<string, string>
  updated_at?: string
}

type WordRow = Word & { word_translations?: { lang: string; translation: string }[] }

const WORD_SELECT = '*, word_translations(lang, translation)'

function toWord(row: WordRow): Word {
  const { word_translations, ...w } = row
  return { ...w, translations: Object.fromEntries((word_translations ?? []).map((t) => [t.lang, t.translation])) }
}

/** Translation of a word in the student's translation language ('' if there is none yet). */
export function wordTranslation(w: Pick<Word, 'translation' | 'translations'>, lang: string = translationLanguage()): string {
  if (lang === 'en') return ''
  return w.translations?.[lang] ?? (lang === 'ru' ? w.translation : '') ?? ''
}

/** One meaning of a word in a uniform shape: the main one (key null) or an extra one. */
export type Sense = {
  key: string | null
  part_of_speech: string
  cefr: string
  definition: string
  examples: string[]
  translation: string
}

/** All meanings of a word, the main one first. */
export function wordSenses(w: Word, lang: string = translationLanguage()): Sense[] {
  const main: Sense = {
    key: null,
    part_of_speech: w.part_of_speech,
    cefr: w.cefr_level,
    definition: w.definition,
    examples: w.examples?.length ? w.examples : w.example ? [w.example] : [],
    translation: wordTranslation(w, lang),
  }
  const extra = (w.meanings ?? []).map(
    (m): Sense => ({
      key: m.key,
      part_of_speech: m.part_of_speech ?? '',
      cefr: m.cefr ?? '',
      definition: m.definition ?? '',
      examples: m.examples ?? [],
      translation: lang === 'en' ? '' : (m.translations?.[lang] ?? ''),
    }),
  )
  return [main, ...extra]
}

/** The meaning with this key (null or unknown key = the main meaning). */
export function wordSense(w: Word, key: string | null | undefined, lang: string = translationLanguage()): Sense {
  const senses = wordSenses(w, lang)
  return senses.find((s) => s.key === (key ?? null)) ?? senses[0]
}

/** PostgREST returns at most 1000 rows per request: read every page. */
async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const size = 1000
  const all: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < size) return all
  }
}

/** Escape LIKE wildcards in user input. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** All words with every field, with the given translation language only (admin tools). */
export async function listWords(lang: string = translationLanguage()): Promise<Word[]> {
  const rows = await fetchAllPages<WordRow>((from, to) =>
    supabase.from('dictionary_words').select(WORD_SELECT).eq('word_translations.lang', lang).order('word').order('id').range(from, to),
  )
  return rows.map(toWord)
}

/** What an inline lesson hint needs: the word and its main translation. */
export type WordHint = { id: string; word: string; translation: string | null; definition: string; example: string | null }

/** Hints only for the given words (the words of one lesson), in the translation language. */
export async function lessonHints(words: string[], lang: string = translationLanguage()): Promise<WordHint[]> {
  if (!words.length) return []
  const { data, error } = await supabase.rpc('lesson_hints', { p_words: words.slice(0, 3000), p_lang: lang })
  if (error) throw error
  return (data ?? []) as WordHint[]
}

export async function getWord(id: string, lang: string = translationLanguage()): Promise<Word | null> {
  const { data } = await supabase.from('dictionary_words').select(WORD_SELECT).eq('word_translations.lang', lang).eq('id', id).maybeSingle()
  return data ? toWord(data as WordRow) : null
}

export type WordFilters = {
  q?: string
  levels?: string[]
  topic?: string
  part_of_speech?: string
  word_type?: WordType
  ielts_category?: string
  sort?: 'word' | 'cefr'
  limit?: number
}

/** Search by English word, definition or a translation in any language. */
export async function searchWords(f: WordFilters = {}, lang: string = translationLanguage()): Promise<Word[]> {
  const { data, error } = await supabase
    .rpc('search_dictionary', {
      p_q: f.q ?? '',
      p_levels: f.levels?.length ? f.levels : null,
      p_topic: f.topic ?? null,
      p_pos: f.part_of_speech ?? null,
      p_type: f.word_type ?? null,
      p_ielts: f.ielts_category ?? null,
      p_sort: f.sort ?? 'word',
      p_limit: f.limit ?? 300,
    })
    .select(WORD_SELECT)
    .eq('word_translations.lang', lang)
  if (error) throw error
  return ((data ?? []) as WordRow[]).map(toWord)
}

/** One page of the dictionary search plus the total number of matches. */
export async function searchWordsPage(
  f: WordFilters,
  from: number,
  pageSize: number,
  lang: string = translationLanguage(),
): Promise<{ words: Word[]; total: number }> {
  const { data, error, count } = await supabase
    .rpc(
      'search_dictionary',
      {
        p_q: f.q ?? '',
        p_levels: f.levels?.length ? f.levels : null,
        p_topic: f.topic ?? null,
        p_pos: f.part_of_speech ?? null,
        p_type: f.word_type ?? null,
        p_ielts: f.ielts_category ?? null,
        p_sort: f.sort ?? 'word',
        p_limit: null, // all matches; the page is cut by range() below
      },
      { count: 'exact' },
    )
    .select(WORD_SELECT)
    .eq('word_translations.lang', lang)
    .range(from, from + pageSize - 1)
  if (error) throw error
  const words = ((data ?? []) as WordRow[]).map(toWord)
  return { words, total: count ?? from + words.length }
}

/** Look up ONE word by its exact spelling, ignoring case (used by quick flashcard creation). */
export async function findWordByText(text: string, lang: string = translationLanguage()): Promise<Word | null> {
  const { data } = await supabase
    .from('dictionary_words')
    .select(WORD_SELECT)
    .eq('word_translations.lang', lang)
    .ilike('word', likeLiteral(text.trim()))
    .limit(1)
  const row = (data ?? [])[0] as WordRow | undefined
  return row ? toWord(row) : null
}

/** All dictionary words matching a topic + levels + type, ordered stably. */
export async function dictionaryPool(
  f: { topic?: string; levels?: string[]; word_type?: WordType; ielts_category?: string },
  lang: string = translationLanguage(),
): Promise<Word[]> {
  const rows = await fetchAllPages<WordRow>((from, to) => {
    let query = supabase.from('dictionary_words').select(WORD_SELECT).eq('word_translations.lang', lang)
    if (f.topic) query = query.eq('topic', f.topic)
    if (f.word_type) query = query.eq('word_type', f.word_type)
    if (f.ielts_category) query = query.eq('ielts_category', f.ielts_category)
    if (f.levels?.length) query = query.in('cefr_level', f.levels)
    return query.order('word').order('id').range(from, to)
  })
  return rows.map(toWord)
}

/* ---------- dictionary import (admin) ---------- */

export type ImportWord = {
  word: string
  part_of_speech?: string
  cefr?: string
  topic?: string
  ipa?: string
  definition?: string
  examples?: string[]
  translations?: Record<string, string>
  word_type?: string
  ielts_category?: string | null
}

export type ImportReport = {
  dry_run: boolean
  new: number
  updated: number
  unchanged: number
  translations_added: number
  conflicts: { word: string; field: string; current: unknown; proposed: unknown }[]
  invalid: { word: string | null; reason: string }[]
  new_words: string[]
}

/** Add words safely: new words are added, existing ones only get their EMPTY fields filled.
 *  Different existing values are reported as conflicts and never overwritten. */
export async function importWords(words: ImportWord[], dryRun = true): Promise<ImportReport> {
  const { data, error } = await supabase.rpc('import_dictionary_words', { p_words: words, p_dry_run: dryRun })
  if (error) throw error
  return data as ImportReport
}

/* ---------- teacher <-> students ---------- */

export async function myStudents(teacherId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('teacher_students')
    .select('student:profiles!teacher_students_student_id_fkey(id, full_name, role, created_at)')
    .eq('teacher_id', teacherId)
  return (data ?? []).map((r: any) => r.student).filter(Boolean)
}

export async function myTeachers(studentId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('teacher_students')
    .select('teacher:profiles!teacher_students_teacher_id_fkey(id, full_name, role)')
    .eq('student_id', studentId)
  return (data ?? []).map((r: any) => r.teacher).filter(Boolean)
}

export async function linkStudent(teacherId: string, studentId: string) {
  const { error } = await supabase.from('teacher_students').insert({ teacher_id: teacherId, student_id: studentId })
  if (error && !error.message.includes('duplicate')) throw error
}
export async function unlinkStudent(teacherId: string, studentId: string) {
  await supabase.from('teacher_students').delete().eq('teacher_id', teacherId).eq('student_id', studentId)
}

/* ---------- assignments ---------- */

export async function assignLesson(teacherId: string, studentId: string, lessonId: string) {
  const { error } = await supabase
    .from('lesson_assignments')
    .insert({ teacher_id: teacherId, student_id: studentId, lesson_id: lessonId })
  if (error && !error.message.includes('duplicate')) throw error
}
export async function unassignLesson(lessonId: string, studentId: string) {
  await supabase.from('lesson_assignments').delete().eq('lesson_id', lessonId).eq('student_id', studentId)
}
export async function lessonAssignees(lessonId: string): Promise<string[]> {
  const { data } = await supabase.from('lesson_assignments').select('student_id').eq('lesson_id', lessonId)
  return (data ?? []).map((r) => r.student_id)
}

export async function assignSet(teacherId: string, studentId: string, setId: string) {
  const { error } = await supabase
    .from('flashcard_set_assignments')
    .insert({ teacher_id: teacherId, student_id: studentId, flashcard_set_id: setId })
  if (error && !error.message.includes('duplicate')) throw error
}

/* ---------- flashcards ---------- */

export type FlashcardSet = {
  id: string
  title: string
  description: string
  owner_id: string
  is_personal: boolean
  lesson_id: string | null
}
export type Flashcard = {
  id: string
  set_id: string
  word_id: string | null
  /** the word's meaning this card was made from (null = the main meaning) */
  meaning_key: string | null
  front: string
  back: string
  example: string
  image_url: string
  audio_url: string
  position: number
}

export async function listSets(): Promise<FlashcardSet[]> {
  const { data } = await supabase.from('flashcard_sets').select('*').order('created_at')
  return (data ?? []) as FlashcardSet[]
}
export async function listCards(setId: string): Promise<Flashcard[]> {
  const { data } = await supabase.from('flashcards').select('*').eq('set_id', setId).order('position')
  return (data ?? []) as Flashcard[]
}
export async function createSet(ownerId: string, s: { title: string; description?: string; is_personal?: boolean; lesson_id?: string | null }) {
  const { data, error } = await supabase
    .from('flashcard_sets')
    .insert({ owner_id: ownerId, title: s.title, description: s.description ?? '', is_personal: s.is_personal ?? false, lesson_id: s.lesson_id ?? null })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
export async function addCard(setId: string, c: Partial<Flashcard> & { front: string }, position: number) {
  const { error } = await supabase.from('flashcards').insert({
    set_id: setId,
    word_id: c.word_id ?? null,
    front: c.front,
    back: c.back ?? '',
    example: c.example ?? '',
    image_url: c.image_url ?? '',
    audio_url: c.audio_url ?? '',
    position,
  })
  if (error) throw error
}
export async function deleteCard(id: string) {
  await supabase.from('flashcards').delete().eq('id', id)
}

/* ---------- teacher sets: build, correct, assign ---------- */

export type TeacherSet = FlashcardSet & { card_count: number; student_ids: string[] }

/** A teacher's own (non-personal) sets with card counts and who they are assigned to. */
export async function teacherSets(ownerId: string): Promise<TeacherSet[]> {
  const { data: sets, error } = await supabase
    .from('flashcard_sets')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_personal', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  const ids = (sets ?? []).map((s) => s.id as string)
  if (!ids.length) return []
  const [cards, assigned] = await Promise.all([
    fetchAllPages<{ set_id: string }>((from, to) => supabase.from('flashcards').select('set_id').in('set_id', ids).range(from, to)),
    fetchAllPages<{ flashcard_set_id: string; student_id: string }>((from, to) =>
      supabase.from('flashcard_set_assignments').select('flashcard_set_id, student_id').in('flashcard_set_id', ids).range(from, to),
    ),
  ])
  return (sets as FlashcardSet[]).map((s) => ({
    ...s,
    card_count: cards.filter((c) => c.set_id === s.id).length,
    student_ids: assigned.filter((a) => a.flashcard_set_id === s.id).map((a) => a.student_id),
  }))
}

export type CardDraft = { id?: string; word_id: string | null; meaning_key: string | null; front: string; back: string; example: string }

/** Save a teacher set: title, cards (kept / changed / added / removed, in this order) and
 *  its students (assigned / unassigned). Returns the set id. */
export async function saveTeacherSet(
  ownerId: string,
  setId: string | null,
  title: string,
  cards: CardDraft[],
  studentIds: string[],
): Promise<string> {
  let id = setId
  if (id) {
    const { error } = await supabase.from('flashcard_sets').update({ title }).eq('id', id)
    if (error) throw error
  } else {
    id = await createSet(ownerId, { title, is_personal: false })
  }

  const current = await listCards(id)
  const keep = new Set(cards.map((c) => c.id).filter(Boolean))
  const removed = current.filter((c) => !keep.has(c.id)).map((c) => c.id)
  if (removed.length) {
    const { error } = await supabase.from('flashcards').delete().in('id', removed)
    if (error) throw error
  }
  const byId = new Map(current.map((c) => [c.id, c]))
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const row = { front: c.front.trim(), back: c.back.trim(), example: c.example.trim(), position: i }
    const old = c.id ? byId.get(c.id) : undefined
    if (old) {
      if (old.front !== row.front || old.back !== row.back || old.example !== row.example || old.position !== i) {
        const { error } = await supabase.from('flashcards').update(row).eq('id', old.id)
        if (error) throw error
      }
    } else {
      const { error } = await supabase.from('flashcards').insert({ ...row, set_id: id, word_id: c.word_id, meaning_key: c.meaning_key })
      if (error) throw error
    }
  }

  const { data: assigned } = await supabase.from('flashcard_set_assignments').select('student_id').eq('flashcard_set_id', id)
  const had = new Set((assigned ?? []).map((a) => a.student_id as string))
  const want = new Set(studentIds)
  for (const sid of want) if (!had.has(sid)) await assignSet(ownerId, sid, id)
  const drop = [...had].filter((sid) => !want.has(sid))
  if (drop.length) {
    const { error } = await supabase.from('flashcard_set_assignments').delete().eq('flashcard_set_id', id).in('student_id', drop)
    if (error) throw error
  }
  return id
}
export async function deleteSet(id: string) {
  await supabase.from('flashcard_sets').delete().eq('id', id)
}

/* ---------- progress ---------- */

export type LessonProgress = {
  lesson_id: string
  status: string
  score: number
  completed_at: string | null
  started_at: string | null
  time_spent_sec: number
}
export async function myProgress(studentId: string): Promise<LessonProgress[]> {
  const { data } = await supabase
    .from('lesson_progress')
    .select('lesson_id, status, score, completed_at, started_at, time_spent_sec')
    .eq('student_id', studentId)
  return (data ?? []) as LessonProgress[]
}

export async function studentAttempts(studentId: string, lessonId: string) {
  const { data } = await supabase
    .from('exercise_attempts')
    .select('exercise_id, attempt_number, given_answer, is_correct, answered_at')
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
    .order('answered_at')
  return data ?? []
}

/* ---------- lesson passes + saved answers ----------
   A "pass" is one run through a lesson. Answers are saved per pass as the
   student types (checked or not); "Check" additionally logs an attempt.
   Scoring happens on the server in complete_lesson_pass(). */

export type LessonPass = {
  id: string
  student_id: string
  lesson_id: string
  pass_number: number
  status: 'in_progress' | 'completed'
  current_index: number
  correct_count: number | null
  total_count: number | null
  time_spent_sec: number
  started_at: string
  completed_at: string | null
}

export type SavedAnswer = {
  pass_id: string
  exercise_id: string
  response: Response
  given_answer: string
  is_correct: boolean
  checked: boolean
  first_check_correct: boolean | null
  attempts_count: number
  last_checked_response: Response | null
}

/** Does this saved answer count as correct in the pass score? (same rule as the server) */
export function countsAsCorrect(a: Pick<SavedAnswer, 'checked' | 'first_check_correct' | 'is_correct'> | undefined): boolean {
  if (!a) return false
  return a.checked ? a.first_check_correct === true : a.is_correct
}

/** All passes of one student (optionally for one lesson), oldest first. */
export async function studentPasses(studentId: string, lessonId?: string): Promise<LessonPass[]> {
  let query = supabase.from('lesson_passes').select('*').eq('student_id', studentId)
  if (lessonId) query = query.eq('lesson_id', lessonId)
  const { data, error } = await query.order('pass_number')
  if (error) throw error
  return (data ?? []) as LessonPass[]
}

export async function passAnswers(passIds: string[]): Promise<SavedAnswer[]> {
  if (!passIds.length) return []
  const { data, error } = await supabase.from('exercise_answers').select('*').in('pass_id', passIds)
  if (error) throw error
  return (data ?? []) as SavedAnswer[]
}

/** Resume the open pass for this lesson, or start a new one. */
export async function startPass(lessonId: string): Promise<LessonPass> {
  const { data, error } = await supabase.rpc('start_lesson_pass', { p_lesson_id: lessonId })
  if (error) throw error
  return data as LessonPass
}

/** Autosave the current answer (does not count as a check). is_correct is set by the server. */
export async function saveAnswer(pass: LessonPass, exerciseId: string, response: Response, given: string) {
  const isCorrect = false
  const { error } = await supabase.from('exercise_answers').upsert(
    {
      pass_id: pass.id,
      student_id: pass.student_id,
      lesson_id: pass.lesson_id,
      exercise_id: exerciseId,
      response,
      given_answer: given,
      is_correct: isCorrect,
    },
    { onConflict: 'pass_id,exercise_id' },
  )
  if (error) throw error
}

/** "Check": save the answer and log one attempt (a repeated identical check is ignored). */
/** "Check": the server saves, grades and logs the attempt, and returns the correct answer. */
export async function checkExercise(passId: string, exerciseId: string, response: Response, given: string): Promise<{ answer: SavedAnswer } & Verdict> {
  const { data, error } = await supabase.rpc('check_exercise', {
    p_pass_id: passId,
    p_exercise_id: exerciseId,
    p_response: response,
    p_given: given,
  })
  if (error) throw error
  const r = data as { answer: SavedAnswer; correct: boolean; correct_answer: string }
  return { answer: r.answer, correct: r.correct, correctAnswer: r.correct_answer ?? '' }
}

export async function savePassPosition(passId: string, index: number) {
  const { error } = await supabase.from('lesson_passes').update({ current_index: index }).eq('id', passId)
  if (error) throw error
}

/** Finish the pass: the server scores it and stores it as the lesson's last result. */
export async function completePass(passId: string, timeSpentSec: number): Promise<LessonPass> {
  const { data, error } = await supabase.rpc('complete_lesson_pass', { p_pass_id: passId, p_time_spent_sec: timeSpentSec })
  if (error) throw error
  return data as LessonPass
}

export type PassSummary = {
  last: LessonPass | null // latest completed pass — the main result
  best: LessonPass | null // completed pass with the highest score
  completed: number // number of completed passes
  open: LessonPass | null // pass in progress, if any
}

export function summarizePasses(passes: LessonPass[]): Record<string, PassSummary> {
  const out: Record<string, PassSummary> = {}
  for (const p of passes) {
    const s = (out[p.lesson_id] ??= { last: null, best: null, completed: 0, open: null })
    if (p.status === 'in_progress') {
      s.open = p
      continue
    }
    s.completed++
    if (!s.last || p.pass_number > s.last.pass_number) s.last = p
    if (!s.best || ratio(p) > ratio(s.best)) s.best = p
  }
  return out
}

function ratio(p: LessonPass) {
  return p.total_count ? (p.correct_count ?? 0) / p.total_count : 0
}

/* ---------- flashcard progress ---------- */

/** One flashcard answer. Counted on the server: a card is known after 2 correct
 *  answers in total; a card linked to a dictionary word also updates that word. */
export async function recordCard(cardId: string, known: boolean) {
  const { error } = await supabase.rpc('record_flashcard_review', { p_card_id: cardId, p_known: known })
  if (error) throw error
}

/** Distinct known words: dictionary words (library + linked cards) plus own cards without a word. */
export async function knownWordsCount(studentId: string): Promise<number> {
  const [words, cards] = await Promise.all([
    supabase.from('student_word_progress').select('word_id').eq('student_id', studentId).eq('status', 'known'),
    supabase.from('flashcard_progress').select('flashcard_id, flashcards(word_id, meaning_key)').eq('student_id', studentId).eq('state', 'known'),
  ])
  if (words.error) throw words.error
  if (cards.error) throw cards.error
  const known = new Set((words.data ?? []).map((w) => `w:${w.word_id}`))
  for (const c of cards.data ?? []) {
    // many-to-one embed: an object at runtime (typed as an array without generated DB types)
    const card = (Array.isArray(c.flashcards) ? c.flashcards[0] : c.flashcards) as { word_id: string | null; meaning_key: string | null } | null
    // each meaning of a word counts once; the main meaning shares its key with library progress
    known.add(card?.word_id ? `w:${card.word_id}${card.meaning_key ? `#${card.meaning_key}` : ''}` : `c:${c.flashcard_id}`)
  }
  return known.size
}

export async function cardProgress(studentId: string) {
  const { data } = await supabase
    .from('flashcard_progress')
    .select('flashcard_id, state, repetitions, correct_count, incorrect_count')
    .eq('student_id', studentId)
  return data ?? []
}

/* ---------- progress through a flashcard set ----------
   One row per student and set, created on first open. `items` are flashcard ids
   (own/teacher sets) or dictionary word ids (library sets, snapshotted at start). */

export type SetProgressStatus = 'in_progress' | 'practice_available' | 'completed'
export type SetProgress = {
  id: string
  student_id: string
  set_id: string | null
  library_key: string | null
  title: string
  item_kind: 'card' | 'word'
  items: string[]
  statuses: Record<string, 'known' | 'review'>
  queue: string[]
  position: number
  round: number
  known_count: number
  total_count: number
  status: SetProgressStatus
  practice: Exercise[] | null
  practice_correct: number | null
  practice_total: number | null
  started_at: string
  flashcards_completed_at: string | null
  practice_completed_at: string | null
  updated_at: string
}
export type SetRef = { setId: string; libraryKey?: undefined } | { libraryKey: string; setId?: undefined }

export async function mySetProgress(studentId: string): Promise<SetProgress[]> {
  const { data, error } = await supabase
    .from('flashcard_set_progress')
    .select('*')
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SetProgress[]
}

export async function getSetProgress(studentId: string, ref: SetRef): Promise<SetProgress | null> {
  let query = supabase.from('flashcard_set_progress').select('*').eq('student_id', studentId)
  query = ref.setId ? query.eq('set_id', ref.setId) : query.eq('library_key', ref.libraryKey!)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as SetProgress | null
}

/** First open of a set: create its progress row (or return the existing one). */
export async function startSetProgress(
  studentId: string,
  ref: SetRef,
  title: string,
  itemKind: 'card' | 'word',
  items: string[],
): Promise<SetProgress> {
  const { data, error } = await supabase
    .from('flashcard_set_progress')
    .insert({
      student_id: studentId,
      set_id: ref.setId ?? null,
      library_key: ref.libraryKey ?? null,
      title,
      item_kind: itemKind,
      items,
      queue: items,
      total_count: items.length,
    })
    .select('*')
    .single()
  if (error?.code === '23505') {
    // opened concurrently (e.g. two tabs): use the row that won
    const existing = await getSetProgress(studentId, ref)
    if (existing) return existing
  }
  if (error) throw error
  return data as SetProgress
}

export async function saveSetProgress(id: string, patch: Partial<SetProgress>) {
  const { error } = await supabase.from('flashcard_set_progress').update(patch).eq('id', id)
  if (error) throw error
}

export async function getSet(id: string): Promise<FlashcardSet | null> {
  const { data, error } = await supabase.from('flashcard_sets').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as FlashcardSet | null
}

/** Dictionary words by id, in the given order. */
export async function wordsByIds(ids: string[], lang: string = translationLanguage()): Promise<Word[]> {
  if (!ids.length) return []
  const { data, error } = await supabase.from('dictionary_words').select(WORD_SELECT).eq('word_translations.lang', lang).in('id', ids)
  if (error) throw error
  const byId = new Map(((data ?? []) as WordRow[]).map((row) => [row.id, toWord(row)]))
  return ids.map((id) => byId.get(id)).filter((w): w is Word => !!w)
}

/* ---------- dictionary-word progress (library flashcards) ----------
   Auto-generated library sets are built from dictionary words (not physical
   flashcards rows), so their progress lives in student_word_progress. */

export type WordProgress = { word_id: string; status: 'learning' | 'known' | 'weak'; last_seen?: string }

export async function wordProgress(studentId: string): Promise<WordProgress[]> {
  const { data } = await supabase
    .from('student_word_progress')
    .select('word_id, status, last_seen')
    .eq('student_id', studentId)
  return (data ?? []) as WordProgress[]
}

export async function recordWord(studentId: string, wordId: string, known: boolean) {
  await supabase.from('student_word_progress').upsert(
    {
      student_id: studentId,
      word_id: wordId,
      status: known ? 'known' : 'weak',
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'student_id,word_id' },
  )
}

/** Is this meaning of the word already a card in the set? */
export const hasWordCard = (cards: Flashcard[], wordId: string, meaningKey: string | null) =>
  cards.some((c) => c.word_id === wordId && (c.meaning_key ?? null) === meaningKey)

/** Add one meaning of a dictionary word to one of the user's own sets.
 *  The back of the card is that meaning's translation in the student's language (or its definition). */
/* ---------- "My words": the personal set filled from lesson hints ---------- */

/** Marks the auto-created "My words" set (its title is in the user's language). */
export const MY_WORDS_MARK = '#my-words'

async function myWordsSetId(ownerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('description', MY_WORDS_MARK)
    .order('created_at')
    .limit(1)
  return data?.[0]?.id ?? null
}

/** Is this word (main meaning) already in the "My words" set? */
export async function inMyWords(ownerId: string, wordId: string): Promise<boolean> {
  const setId = await myWordsSetId(ownerId)
  if (!setId) return false
  const { count } = await supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('set_id', setId).eq('word_id', wordId)
  return (count ?? 0) > 0
}

/** Adds a word (main meaning) to "My words"; creates the set on first use. */
export async function addToMyWords(ownerId: string, wordId: string, setTitle: string): Promise<'added' | 'exists'> {
  const [word] = await wordsByIds([wordId])
  if (!word) throw new Error('word not found')
  let setId = await myWordsSetId(ownerId)
  if (!setId) setId = await createSet(ownerId, { title: setTitle, description: MY_WORDS_MARK, is_personal: true })
  const cards = await listCards(setId)
  if (hasWordCard(cards, wordId, null)) return 'exists'
  await addWordToSet(setId, word, cards.length, null)
  return 'added'
}

export async function addWordToSet(setId: string, w: Word, position: number, meaningKey: string | null = null) {
  const sense = wordSense(w, meaningKey)
  const { error } = await supabase.from('flashcards').insert({
    set_id: setId,
    word_id: w.id,
    meaning_key: sense.key,
    front: w.word,
    back: sense.translation || sense.definition || '',
    example: sense.examples[0] ?? '',
    position,
  })
  if (error) throw error
}

/* ---------- admin ----------
   The admin has RLS permission to read every profile and to change roles
   (the protect_role trigger allows role changes only when is_admin()).
   So these are plain client calls — no privileged server needed. */

export async function adminListUsers(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at')
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function adminSetRole(userId: string, role: Role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role, teacher_request: 'none' })
    .eq('id', userId)
  if (error) throw error
}

/** Approve a pending teacher request. */
export async function adminApproveTeacher(userId: string) {
  return adminSetRole(userId, 'teacher')
}

/* ---------- coins, streak, shop ---------- */

export type Wallet = {
  balance: number
  earned_today: number
  earned_day: string | null
  streak: number
  best_streak: number
  last_active_day: string | null
  freezes: number
}
export const EMPTY_WALLET: Wallet = { balance: 0, earned_today: 0, earned_day: null, streak: 0, best_streak: 0, last_active_day: null, freezes: 0 }
/** Coins earned by learning per day (the same limit as in the database). */
export const DAILY_EARN_LIMIT = 60

/** The signed-in user's wallet (an empty one until the first coins). */
export async function myWallet(userId: string): Promise<Wallet> {
  const { data, error } = await supabase.from('wallets').select('balance, earned_today, earned_day, streak, best_streak, last_active_day, freezes').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return (data as Wallet | null) ?? EMPTY_WALLET
}

/** The streak as it stands today: a streak whose last day is older than yesterday is already over
 *  (unless freezes cover the gap — the server applies them on the next learning day). */
export function liveStreak(w: Wallet): number {
  if (!w.last_active_day || !w.streak) return 0
  const today = new Date().toISOString().slice(0, 10)
  const days = Math.round((Date.parse(today) - Date.parse(w.last_active_day)) / 86400000)
  return days - 1 <= w.freezes ? w.streak : 0
}
/** Did the user already learn today (UTC, like the server)? */
export const learnedToday = (w: Wallet) => w.last_active_day === new Date().toISOString().slice(0, 10)

export type CoinEntry = { id: number; amount: number; kind: string; source: string; ref_id: string | null; meta: Record<string, unknown>; created_at: string }
export async function coinHistory(userId: string, limit = 50): Promise<CoinEntry[]> {
  const { data, error } = await supabase
    .from('coin_ledger')
    .select('id, amount, kind, source, ref_id, meta, created_at')
    .eq('user_id', userId)
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CoinEntry[]
}

export type ShopItem = { code: string; kind: 'streak_freeze' | 'avatar' | 'frame'; price: number; position: number }
export async function shopItems(): Promise<ShopItem[]> {
  const { data, error } = await supabase.from('shop_items').select('code, kind, price, position').eq('active', true).order('position')
  if (error) throw error
  return (data ?? []) as ShopItem[]
}
export async function myItems(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('user_items').select('item_code').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((r) => r.item_code as string)
}
/** Buy an item for coins; returns the new wallet. Errors carry a hint: not_enough_coins | max_freezes | owned. */
export async function buyItem(code: string): Promise<Wallet> {
  const { data, error } = await supabase.rpc('buy_item', { p_code: code })
  if (error) throw error
  return data as Wallet
}

export type StoreProduct = { code: string; kind: 'coins' | 'subscription'; coins: number; price_cents: number; currency: string; interval: 'month' | 'year' | null; data: Record<string, unknown> }
/** Coin packs and subscriptions for real money (payments are connected separately). */
export async function storeProducts(): Promise<StoreProduct[]> {
  const { data, error } = await supabase.from('store_products').select('code, kind, coins, price_cents, currency, interval, data').eq('active', true).order('position')
  if (error) throw error
  return (data ?? []) as StoreProduct[]
}
