// Learners' interests: Lean asks one short question at a time (at most one a day, skippable).
// Answers are stored as item keys in user_interests.interests; a learner's own answer as "custom:<text>".
// Proper names (shows, artists, games) are shown as they are; general items are translated (interests.items.*).

export type InterestItem = { key: string; emoji: string; name?: string }
export type InterestQuestion = { key: string; items: InterestItem[] }

export const INTEREST_QUESTIONS: InterestQuestion[] = [
  {
    key: 'watch',
    items: [
      { key: 'twilight', emoji: '🧛', name: 'Twilight' },
      { key: 'wednesday', emoji: '🖤', name: 'Wednesday' },
      { key: 'stranger_things', emoji: '🚲', name: 'Stranger Things' },
      { key: 'harry_potter', emoji: '⚡', name: 'Harry Potter' },
      { key: 'marvel', emoji: '🦸', name: 'Marvel' },
      { key: 'bridgerton', emoji: '👑', name: 'Bridgerton' },
      { key: 'hunger_games', emoji: '🏹', name: 'The Hunger Games' },
      { key: 'the_last_of_us', emoji: '🍄', name: 'The Last of Us' },
      { key: 'squid_game', emoji: '🦑', name: 'Squid Game' },
      { key: 'friends', emoji: '☕', name: 'Friends' },
      { key: 'sherlock', emoji: '🔍', name: 'Sherlock' },
      { key: 'star_wars', emoji: '🌌', name: 'Star Wars' },
    ],
  },
  {
    key: 'music',
    items: [
      { key: 'kpop', emoji: '💜', name: 'K-pop' },
      { key: 'taylor_swift', emoji: '🩷', name: 'Taylor Swift' },
      { key: 'billie_eilish', emoji: '💚', name: 'Billie Eilish' },
      { key: 'sabrina_carpenter', emoji: '💋', name: 'Sabrina Carpenter' },
      { key: 'olivia_rodrigo', emoji: '🦋', name: 'Olivia Rodrigo' },
      { key: 'the_weeknd', emoji: '🌙', name: 'The Weeknd' },
      { key: 'ariana_grande', emoji: '🎀', name: 'Ariana Grande' },
      { key: 'harry_styles', emoji: '🍉', name: 'Harry Styles' },
      { key: 'rap', emoji: '🎤' },
      { key: 'rock', emoji: '🎸' },
      { key: 'indie', emoji: '🎧' },
    ],
  },
  {
    key: 'play',
    items: [
      { key: 'anime', emoji: '🍥' },
      { key: 'minecraft', emoji: '⛏️', name: 'Minecraft' },
      { key: 'genshin', emoji: '✨', name: 'Genshin Impact' },
      { key: 'fortnite', emoji: '🪂', name: 'Fortnite' },
      { key: 'roblox', emoji: '🧱', name: 'Roblox' },
      { key: 'valorant', emoji: '🎯', name: 'Valorant' },
      { key: 'the_sims', emoji: '🏡', name: 'The Sims' },
      { key: 'pokemon', emoji: '⚡', name: 'Pokémon' },
      { key: 'zelda', emoji: '🗡️', name: 'Zelda' },
    ],
  },
  {
    key: 'read',
    items: [
      { key: 'fantasy', emoji: '🐉' },
      { key: 'romance', emoji: '💌' },
      { key: 'horror', emoji: '👻' },
      { key: 'detectives', emoji: '🕵️' },
      { key: 'manga', emoji: '📚' },
      { key: 'comics', emoji: '💥' },
      { key: 'self_dev', emoji: '🌱' },
    ],
  },
  {
    key: 'life',
    items: [
      { key: 'fashion', emoji: '👗' },
      { key: 'makeup', emoji: '💄' },
      { key: 'sport', emoji: '🏃' },
      { key: 'football', emoji: '⚽' },
      { key: 'gym', emoji: '🏋️' },
      { key: 'travel', emoji: '✈️' },
      { key: 'cooking', emoji: '🍳' },
      { key: 'cats', emoji: '🐈' },
      { key: 'dogs', emoji: '🐕' },
      { key: 'tech', emoji: '💻' },
      { key: 'memes', emoji: '😂' },
      { key: 'art', emoji: '🎨' },
      { key: 'photo', emoji: '📸' },
      { key: 'cars', emoji: '🏎️' },
      { key: 'space', emoji: '🚀' },
    ],
  },
]

/** Items whose labels come from translations (interests.items.<key>). */
export const GENERIC_INTERESTS = INTEREST_QUESTIONS.flatMap((q) => q.items).filter((i) => !i.name).map((i) => i.key)

const SKIP_AGAIN_DAYS = 14
export const today = () => new Date().toISOString().slice(0, 10)

/** The question Lean asks now, or null: one question a day; skipped ones come back after two weeks. */
export function nextQuestion(asked: Record<string, string>): InterestQuestion | null {
  const t = today()
  if (Object.values(asked).some((v) => v.replace('skip:', '') === t)) return null
  for (const q of INTEREST_QUESTIONS) {
    const a = asked[q.key]
    if (!a) return q
    if (a.startsWith('skip:')) {
      const days = (Date.parse(t) - Date.parse(a.slice(5))) / 86_400_000
      if (days >= SKIP_AGAIN_DAYS) return q
    }
  }
  return null
}
