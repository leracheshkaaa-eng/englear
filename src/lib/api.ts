import { supabase } from './supabase'
import { exerciseToRow, rowToExercise, type Exercise, type ExerciseRow } from './exercises'

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

export type Settings = { translations_enabled: boolean; translation_mode: string }
export async function getSettings(userId: string): Promise<Settings> {
  const { data } = await supabase
    .from('user_settings')
    .select('translations_enabled, translation_mode')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? { translations_enabled: true, translation_mode: 'on' }
}
export async function saveSettings(userId: string, s: Partial<Settings>) {
  await supabase.from('user_settings').upsert({ user_id: userId, ...s })
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
  await replaceExercises(lesson.id, input.exercises)
  return lesson.id
}

export async function updateLesson(id: string, patch: Partial<NewLesson>) {
  const { exercises, ...rest } = patch
  if (Object.keys(rest).length) {
    const { error } = await supabase.from('lessons').update(rest).eq('id', id)
    if (error) throw error
  }
  if (exercises) await replaceExercises(id, exercises)
}

export async function replaceExercises(lessonId: string, exercises: Exercise[]) {
  await supabase.from('exercises').delete().eq('lesson_id', lessonId)
  if (!exercises.length) return
  const rows = exercises.map((ex, i) => ({ lesson_id: lessonId, ...exerciseToRow(ex, i) }))
  const { error } = await supabase.from('exercises').insert(rows)
  if (error) throw error
}

export async function deleteLesson(id: string) {
  const { error } = await supabase.from('lessons').delete().eq('id', id)
  if (error) throw error
}

export async function reorderLessons(ordered: { id: string; position: number }[]) {
  for (const { id, position } of ordered) await supabase.from('lessons').update({ position }).eq('id', id)
}

/** Fetch a lesson's exercise rows WITH their DB ids (for attempt logging). */
export async function getExerciseRows(lessonId: string) {
  const { data } = await supabase.from('exercises').select('id, position, type').eq('lesson_id', lessonId).order('position')
  return (data ?? []) as { id: string; position: number; type: string }[]
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

export type Word = {
  id: string
  word: string
  translation: string
  part_of_speech: string
  example: string
  pronunciation: string
  cefr_level: string
}

export async function listWords(): Promise<Word[]> {
  const { data } = await supabase.from('dictionary_words').select('*').order('word')
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

export async function startLesson(studentId: string, lessonId: string) {
  await supabase
    .from('lesson_progress')
    .upsert(
      { student_id: studentId, lesson_id: lessonId, status: 'in_progress', started_at: new Date().toISOString() },
      { onConflict: 'student_id,lesson_id', ignoreDuplicates: true },
    )
}

export async function recordAttempt(a: {
  studentId: string
  lessonId: string
  exerciseId: string
  attemptNumber: number
  givenAnswer: string
  isCorrect: boolean
}) {
  await supabase.from('exercise_attempts').insert({
    student_id: a.studentId,
    lesson_id: a.lessonId,
    exercise_id: a.exerciseId,
    attempt_number: a.attemptNumber,
    given_answer: a.givenAnswer,
    is_correct: a.isCorrect,
  })
}

export async function completeLesson(studentId: string, lessonId: string, score: number, timeSpentSec: number) {
  await supabase.from('lesson_progress').upsert(
    {
      student_id: studentId,
      lesson_id: lessonId,
      status: 'completed',
      score,
      completed_at: new Date().toISOString(),
      time_spent_sec: timeSpentSec,
    },
    { onConflict: 'student_id,lesson_id' },
  )
}

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

/* ---------- flashcard progress ---------- */

export async function recordCard(studentId: string, cardId: string, known: boolean, prev?: { repetitions: number; correct_count: number; incorrect_count: number }) {
  const repetitions = (prev?.repetitions ?? 0) + 1
  const correct = (prev?.correct_count ?? 0) + (known ? 1 : 0)
  const incorrect = (prev?.incorrect_count ?? 0) + (known ? 0 : 1)
  const state = known ? (correct >= 2 ? 'known' : 'learning') : 'learning'
  await supabase.from('flashcard_progress').upsert(
    {
      student_id: studentId,
      flashcard_id: cardId,
      state,
      repetitions,
      correct_count: correct,
      incorrect_count: incorrect,
      last_reviewed: new Date().toISOString(),
    },
    { onConflict: 'student_id,flashcard_id' },
  )
}

export async function cardProgress(studentId: string) {
  const { data } = await supabase
    .from('flashcard_progress')
    .select('flashcard_id, state, repetitions, correct_count, incorrect_count')
    .eq('student_id', studentId)
  return data ?? []
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
