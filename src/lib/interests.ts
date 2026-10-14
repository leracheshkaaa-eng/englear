// Learners' interests: Lean asks one short question at a time (at most one a day, skippable).
// Answers are stored as item keys in user_interests.interests; a learner's own answer as "custom:<text>".
// Proper names (shows, artists, games) are shown as they are; general items are translated (interests.items.*).

export type InterestItem = { key: string; name?: string }
export type InterestQuestion = { key: string; items: InterestItem[] }

export const INTEREST_QUESTIONS: InterestQuestion[] = [
  {
    key: 'watch',
    items: [
      { key: 'twilight', name: 'Twilight' },
      { key: 'wednesday', name: 'Wednesday' },
      { key: 'stranger_things', name: 'Stranger Things' },
      { key: 'harry_potter', name: 'Harry Potter' },
      { key: 'marvel', name: 'Marvel' },
      { key: 'bridgerton', name: 'Bridgerton' },
      { key: 'hunger_games', name: 'The Hunger Games' },
      { key: 'the_last_of_us', name: 'The Last of Us' },
      { key: 'squid_game', name: 'Squid Game' },
      { key: 'friends', name: 'Friends' },
      { key: 'sherlock', name: 'Sherlock' },
      { key: 'star_wars', name: 'Star Wars' },
    ],
  },
  {
    key: 'music',
    items: [
      { key: 'kpop', name: 'K-pop' },
      { key: 'taylor_swift', name: 'Taylor Swift' },
      { key: 'billie_eilish', name: 'Billie Eilish' },
      { key: 'sabrina_carpenter', name: 'Sabrina Carpenter' },
      { key: 'olivia_rodrigo', name: 'Olivia Rodrigo' },
      { key: 'the_weeknd', name: 'The Weeknd' },
      { key: 'ariana_grande', name: 'Ariana Grande' },
      { key: 'harry_styles', name: 'Harry Styles' },
      { key: 'rap' },
      { key: 'rock' },
      { key: 'indie' },
    ],
  },
  {
    key: 'play',
    items: [
      { key: 'anime' },
      { key: 'minecraft', name: 'Minecraft' },
      { key: 'genshin', name: 'Genshin Impact' },
      { key: 'fortnite', name: 'Fortnite' },
      { key: 'roblox', name: 'Roblox' },
      { key: 'valorant', name: 'Valorant' },
      { key: 'the_sims', name: 'The Sims' },
      { key: 'pokemon', name: 'Pokémon' },
      { key: 'zelda', name: 'Zelda' },
    ],
  },
  {
    key: 'read',
    items: [
      { key: 'fantasy' },
      { key: 'romance' },
      { key: 'horror' },
      { key: 'detectives' },
      { key: 'manga' },
      { key: 'comics' },
      { key: 'self_dev' },
    ],
  },
  {
    key: 'life',
    items: [
      { key: 'fashion' },
      { key: 'makeup' },
      { key: 'sport' },
      { key: 'football' },
      { key: 'gym' },
      { key: 'travel' },
      { key: 'cooking' },
      { key: 'cats' },
      { key: 'dogs' },
      { key: 'tech' },
      { key: 'memes' },
      { key: 'art' },
      { key: 'photo' },
      { key: 'cars' },
      { key: 'space' },
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
