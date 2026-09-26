// ---- EngLear configuration ----
// The one and only bootstrap admin. Registering (or logging in) with this email
// auto-promotes the account to admin via the server-side claim_admin() RPC.
// NOTE: this must match public.admin_email() in the SQL migrations. To change the
// admin, update BOTH this constant and the admin_email() function.
import { tKey } from '../i18n'

export const ADMIN_EMAIL = 'leracheshkaaa@gmail.com'

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type CefrLevel = (typeof CEFR_LEVELS)[number]

// Levels at which the translation is shown up-front; higher levels hide it behind
// a "Show translation" toggle to encourage English-first learning.
export const TRANSLATION_UPFRONT_LEVELS: string[] = ['A1', 'A2']

export const SET_SIZES = [5, 10, 15, 20, 25, 30, 40, 50] as const

// Topic / category ids are stored in the database; only their labels are translated.
export const TOPICS = [
  'Daily Life', 'Home', 'People', 'Family', 'Food', 'Cooking', 'Travel', 'Transport',
  'Education', 'School', 'University', 'Work', 'Business', 'Technology', 'Internet',
  'Nature', 'Animals', 'Health', 'Body', 'Clothes', 'Shopping', 'Money', 'City',
  'Places', 'Weather', 'Time', 'Emotions', 'Relationships', 'Society', 'Science',
  'Culture', 'Media', 'Environment', 'Other',
] as const

export const IELTS_CATEGORIES = [
  'Education', 'Environment', 'Technology', 'Health', 'Society', 'Work', 'Economy',
  'Science', 'Culture', 'Travel', 'Global Issues', 'Media', 'Crime',
  'Academic Vocabulary', 'Academic Verbs', 'Academic Collocations',
  'Essay Vocabulary', 'Speaking Vocabulary',
] as const

export type WordType = 'word' | 'collocation' | 'phrasal_verb'

export const topicLabel = (topic: string) => tKey(`topics.${topic}`, topic)
export const ieltsLabel = (category: string) => tKey(`ielts.${category}`, category)
export const partOfSpeechLabel = (pos: string) => tKey(`partsOfSpeech.${pos}`, pos)

// Lesson difficulty. New lessons store the code; older lessons store a Russian label.
export const LESSON_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type LessonLevel = (typeof LESSON_LEVELS)[number]
const LEGACY_LESSON_LEVELS: Record<string, LessonLevel> = { Начальный: 'beginner', Средний: 'intermediate', Продвинутый: 'advanced' }

export function lessonLevelCode(level: string | null | undefined): LessonLevel {
  if (level && (LESSON_LEVELS as readonly string[]).includes(level)) return level as LessonLevel
  return LEGACY_LESSON_LEVELS[level ?? ''] ?? 'beginner'
}
export const lessonLevelLabel = (level: string | null | undefined) => tKey(`lessonLevels.${lessonLevelCode(level)}`)
