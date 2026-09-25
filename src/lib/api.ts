import { supabase } from './supabase'
import { exerciseToRow, rowToExercise, type Exercise, type ExerciseRow, type Response } from './exercises'

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

export type Lesson = {
  id: string
  title: string
  description: string
  level: string
  position: number
  visibility: 'public' | 'private'
  is_published: boolean
  author_id: string | null
  exercises: Exercise[]
}

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

export type Settings = { translations_enabled: boolean; translation_mode: string; english_level: string }
const DEFAULT_SETTINGS: Settings = { translations_enabled: true, translation_mode: 'on', english_level: 'A1' }
export async function getSettings(userId: string): Promise<Settings> {
  const { data } = await supabase
    .from('user_settings')
    .select('translations_enabled, translation_mode, english_level')
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

export async function listLessons(): Promise<Lesson[]> {
  // RLS decides which rows are visible (public+published, own, assigned, admin).
  const { data: lessons, error } = await supabase.from('lessons').select('*').order('position')
  if (error) throw error
  if (!lessons?.length) return []
  const ids = lessons.map((l) => l.id)
  const { data: exs } = await supabase.from('exercises').select('*').in('lesson_id', ids).order('position')
  return lessons.map((l) => ({
    ...l,
    exercises: (exs ?? []).filter((e) => e.lesson_id === l.id).map((e) => rowToExercise(e as ExerciseRow)),
  })) as Lesson[]
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
  level: string
  visibility: 'public' | 'private'
  is_published: boolean
  exercises: Exercise[]
}

export async function createLesson(authorId: string, input: NewLesson): Promise<string> {
  const { data: lesson, error } = await supabase
    .from('lessons')
    .insert({
      title: input.title,
      description: input.description,
      level: input.level,
      visibility: input.visibility,
      is_published: input.is_published,
      author_id: authorId,
    })
    .select('id')
    .single()
  if (error) throw error
  await saveLessonExercises(lesson.id, input.exercises)
  return lesson.id
}

export async function updateLesson(id: string, patch: Partial<NewLesson>) {
  const { exercises, ...rest } = patch
  if (Object.keys(rest).length) {
    const { error } = await supabase.from('lessons').update(rest).eq('id', id)
    if (error) throw error
  }
  if (exercises) await saveLessonExercises(id, exercises)
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

/* ---------- dictionary ---------- */

export type WordType = 'word' | 'collocation' | 'phrasal_verb'
export type Word = {
  id: string
  word: string
  translation: string
  part_of_speech: string
  example: string
  pronunciation: string
  cefr_level: string
  definition: string
  examples: string[]
  meanings: { definition?: string; translation?: string; part_of_speech?: string }[]
  topic: string
  related: string[]
  word_type: WordType
  ielts_category: string | null
  updated_at?: string
}

export async function listWords(): Promise<Word[]> {
  const { data } = await supabase.from('dictionary_words').select('*').order('word')
  return (data ?? []) as Word[]
}

export async function getWord(id: string): Promise<Word | null> {
  const { data } = await supabase.from('dictionary_words').select('*').eq('id', id).maybeSingle()
  return (data as Word) ?? null
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

/** Search the dictionary in English OR the user's language (word + translation). */
export async function searchWords(f: WordFilters = {}): Promise<Word[]> {
  let query = supabase.from('dictionary_words').select('*')
  if (f.q && f.q.trim()) {
    const term = `%${f.q.trim()}%`
    query = query.or(`word.ilike.${term},translation.ilike.${term},definition.ilike.${term}`)
  }
  if (f.levels?.length) query = query.in('cefr_level', f.levels)
  if (f.topic) query = query.eq('topic', f.topic)
  if (f.part_of_speech) query = query.eq('part_of_speech', f.part_of_speech)
  if (f.word_type) query = query.eq('word_type', f.word_type)
  if (f.ielts_category) query = query.eq('ielts_category', f.ielts_category)
  query = query.order(f.sort === 'cefr' ? 'cefr_level' : 'word').limit(f.limit ?? 300)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Word[]
}

/** Look up ONE word by its exact spelling (used by quick flashcard creation). */
export async function findWordByText(text: string): Promise<Word | null> {
  const { data } = await supabase
    .from('dictionary_words')
    .select('*')
    .ilike('word', text.trim())
    .limit(1)
  return ((data ?? [])[0] as Word) ?? null
}

/** All dictionary words matching a topic + levels + type, ordered stably. */
export async function dictionaryPool(f: {
  topic?: string
  levels?: string[]
  word_type?: WordType
  ielts_category?: string
}): Promise<Word[]> {
  let query = supabase.from('dictionary_words').select('*')
  if (f.topic) query = query.eq('topic', f.topic)
  if (f.word_type) query = query.eq('word_type', f.word_type)
  if (f.ielts_category) query = query.eq('ielts_category', f.ielts_category)
  if (f.levels?.length) query = query.in('cefr_level', f.levels)
  const { data, error } = await query.order('word').limit(2000)
  if (error) throw error
  return (data ?? []) as Word[]
}

export async function upsertWord(w: Partial<Word> & { word: string }) {
  const { data, error } = await supabase
    .from('dictionary_words')
    .upsert({ ...w }, { onConflict: 'word' })
    .select()
    .single()
  if (error) throw error
  return data as Word
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
   student types (checked or not); "Проверить" additionally logs an attempt.
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

/** "Проверить": save the answer and log one attempt (a repeated identical check is ignored). */
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
    supabase.from('flashcard_progress').select('flashcard_id, flashcards(word_id)').eq('student_id', studentId).eq('state', 'known'),
  ])
  if (words.error) throw words.error
  if (cards.error) throw cards.error
  const known = new Set((words.data ?? []).map((w) => `w:${w.word_id}`))
  for (const c of cards.data ?? []) {
    // many-to-one embed: an object at runtime (typed as an array without generated DB types)
    const card = (Array.isArray(c.flashcards) ? c.flashcards[0] : c.flashcards) as { word_id: string | null } | null
    known.add(card?.word_id ? `w:${card.word_id}` : `c:${c.flashcard_id}`)
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

/** Add an existing dictionary word to one of the user's own sets (no duplicate word). */
export async function addWordToSet(setId: string, w: Word, position: number) {
  const { error } = await supabase.from('flashcards').insert({
    set_id: setId,
    word_id: w.id,
    front: w.word,
    back: w.translation,
    example: (w.examples?.[0] ?? w.example ?? ''),
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
