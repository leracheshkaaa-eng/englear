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
  position: number
}

export type Lesson = LessonSummary & {
  /** kept in sync with scope/status by the database */
  visibility: 'public' | 'private'
  is_published: boolean
  exercises: Exercise[]
}

const LESSON_SUMMARY =
  'id, title, description, level, cefr, scope, skill, topic, grammar_topic_id, sequence, status, author_id, exercise_count, position'

/** Legacy level for the old `level` column, derived from the CEFR level. */
const legacyLevel = (cefr: string | null | undefined) =>
  cefr?.startsWith('C') ? 'advanced' : cefr?.startsWith('B') ? 'intermediate' : 'beginner'

/* ---------- profiles / settings ---------- */

export async function getProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  return data as Profile | null
}

/** Update own nickname / avatar. (role is protected by a DB trigger.) */
export async function updateProfile(id: string, patch: { full_name?: string; avatar?: string }) {
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
}

/** One page of the lesson catalog (no exercises) and the total number of matches.
 *  RLS decides what is visible: published library lessons for everyone;
 *  teacher lessons for their author, assigned students and admins. */
export async function lessonCatalog(f: LessonFilters, from: number, pageSize: number): Promise<{ lessons: LessonSummary[]; total: number }> {
  const { data, error } = await supabase.rpc('lesson_catalog', {
    p_scope: f.scope,
    p_cefr: f.cefr?.length ? f.cefr : null,
    p_skill: f.skill || null,
    p_topic: f.topic || null,
    p_grammar: f.grammarTopicId || null,
    p_q: f.q ?? '',
    p_limit: pageSize,
    p_offset: from,
  })
  if (error) throw error
  const rows = (data ?? []) as (LessonSummary & { total: number })[]
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

export async function getLesson(id: string): Promise<Lesson | null> {
  const { data: l } = await supabase.from('lessons').select('*').eq('id', id).maybeSingle()
  if (!l) return null
  const { data: exs } = await supabase.from('exercises').select('*').eq('lesson_id', id).order('position')
  return { ...l, exercises: (exs ?? []).map((e) => rowToExercise(e as ExerciseRow)) } as Lesson
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

/** Autosave the current answer (does not count as a check). */
export async function saveAnswer(pass: LessonPass, exerciseId: string, response: Response, given: string, isCorrect: boolean) {
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
export async function recordCheck(passId: string, exerciseId: string, response: Response, given: string, isCorrect: boolean) {
  const { data, error } = await supabase.rpc('record_exercise_check', {
    p_pass_id: passId,
    p_exercise_id: exerciseId,
    p_response: response,
    p_given: given,
    p_is_correct: isCorrect,
  })
  if (error) throw error
  return data as SavedAnswer
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
