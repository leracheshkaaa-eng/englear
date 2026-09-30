// 12 cute animal avatars, drawn as inline SVG so they scale crisply and need no assets.
// Each avatar is keyed by a stable id stored in profiles.avatar; names live in the translations.
import { tKey } from '../i18n'

/** Translated animal name for an avatar id. */
export const avatarLabel = (id: string | null | undefined) => tKey(`avatars.${id ?? 'cat'}`, id ?? '')

export type AvatarDef = { id: string; bg: string; draw: () => React.ReactNode }

const eyes = (
  <>
    <circle cx="38" cy="52" r="4.5" fill="#3a2b4d" />
    <circle cx="62" cy="52" r="4.5" fill="#3a2b4d" />
    <circle cx="39.5" cy="50.5" r="1.4" fill="#fff" />
    <circle cx="63.5" cy="50.5" r="1.4" fill="#fff" />
  </>
)
const blush = (
  <>
    <circle cx="30" cy="62" r="5" fill="#ff9db0" opacity="0.55" />
    <circle cx="70" cy="62" r="5" fill="#ff9db0" opacity="0.55" />
  </>
)
const smile = (
  <path d="M42 62 Q50 70 58 62" fill="none" stroke="#3a2b4d" strokeWidth="3" strokeLinecap="round" />
)

export const AVATARS: AvatarDef[] = [
  {
    id: 'cat', bg: '#ffd8a8',
    draw: () => (
      <>
        <path d="M28 30 L36 46 L22 46 Z" fill="#f6b26b" />
        <path d="M72 30 L64 46 L78 46 Z" fill="#f6b26b" />
        <circle cx="50" cy="56" r="26" fill="#ffcc80" />
        {eyes}{blush}
        <path d="M50 58 l-3 4 h6 z" fill="#ff8a9b" />
        <path d="M50 62 v3" stroke="#3a2b4d" strokeWidth="2" />
        <path d="M28 58 h12 M28 62 h12 M60 58 h12 M60 62 h12" stroke="#3a2b4d" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      </>
    ),
  },
  {
    id: 'dog', bg: '#ffe0b2',
    draw: () => (
      <>
        <ellipse cx="26" cy="44" rx="10" ry="16" fill="#a97c50" />
        <ellipse cx="74" cy="44" rx="10" ry="16" fill="#a97c50" />
        <circle cx="50" cy="54" r="26" fill="#d9a56a" />
        {eyes}
        <ellipse cx="50" cy="62" rx="8" ry="6" fill="#f3e4d3" />
        <circle cx="50" cy="60" r="3.5" fill="#3a2b4d" />
        {smile}
      </>
    ),
  },
  {
    id: 'fox', bg: '#ffd0b5',
    draw: () => (
      <>
        <path d="M24 26 L40 46 L20 44 Z" fill="#e8743b" />
        <path d="M76 26 L60 46 L80 44 Z" fill="#e8743b" />
        <circle cx="50" cy="54" r="26" fill="#f28c4d" />
        <path d="M50 80 a26 26 0 0 1 -26 -26 h52 a26 26 0 0 1 -26 26 z" fill="#fff3ea" opacity="0.9" />
        {eyes}
        <path d="M50 58 l-3.5 4 h7 z" fill="#3a2b4d" />
        {smile}
      </>
    ),
  },
  {
    id: 'bear', bg: '#e7d3b3',
    draw: () => (
      <>
        <circle cx="30" cy="34" r="11" fill="#b98a5e" />
        <circle cx="70" cy="34" r="11" fill="#b98a5e" />
        <circle cx="30" cy="34" r="5" fill="#8a6440" />
        <circle cx="70" cy="34" r="5" fill="#8a6440" />
        <circle cx="50" cy="56" r="26" fill="#c69c6d" />
        {eyes}
        <ellipse cx="50" cy="62" rx="9" ry="7" fill="#eaddc7" />
        <circle cx="50" cy="60" r="3.5" fill="#3a2b4d" />
        {smile}
      </>
    ),
  },
  {
    id: 'panda', bg: '#e9e9ef',
    draw: () => (
      <>
        <circle cx="28" cy="32" r="10" fill="#2f2b33" />
        <circle cx="72" cy="32" r="10" fill="#2f2b33" />
        <circle cx="50" cy="56" r="26" fill="#fff" />
        <ellipse cx="38" cy="54" rx="7" ry="9" fill="#2f2b33" transform="rotate(-15 38 54)" />
        <ellipse cx="62" cy="54" rx="7" ry="9" fill="#2f2b33" transform="rotate(15 62 54)" />
        <circle cx="38" cy="53" r="3" fill="#fff" />
        <circle cx="62" cy="53" r="3" fill="#fff" />
        <path d="M50 62 l-2.5 3 h5 z" fill="#2f2b33" />
        {smile}
      </>
    ),
  },
  {
    id: 'rabbit', bg: '#f4d7e6',
    draw: () => (
      <>
        <ellipse cx="40" cy="24" rx="7" ry="18" fill="#fbeef4" />
        <ellipse cx="60" cy="24" rx="7" ry="18" fill="#fbeef4" />
        <ellipse cx="40" cy="24" rx="3" ry="12" fill="#f6b8d0" />
        <ellipse cx="60" cy="24" rx="3" ry="12" fill="#f6b8d0" />
        <circle cx="50" cy="58" r="24" fill="#fbeef4" />
        {eyes}{blush}
        <path d="M50 60 l-2.5 3 h5 z" fill="#ff8a9b" />
        {smile}
      </>
    ),
  },
  {
    id: 'koala', bg: '#d7dde3',
    draw: () => (
      <>
        <circle cx="26" cy="42" r="14" fill="#9aa7b0" />
        <circle cx="74" cy="42" r="14" fill="#9aa7b0" />
        <circle cx="26" cy="42" r="8" fill="#c3ccd3" />
        <circle cx="74" cy="42" r="8" fill="#c3ccd3" />
        <circle cx="50" cy="56" r="25" fill="#aab6bf" />
        {eyes}
        <ellipse cx="50" cy="63" rx="8" ry="10" fill="#4b4b55" />
        {smile}
      </>
    ),
  },
  {
    id: 'lion', bg: '#ffe6a7',
    draw: () => (
      <>
        <g fill="#e2953b">
          {Array.from({ length: 12 }).map((_, k) => {
            const a = (k / 12) * Math.PI * 2
            return <circle key={k} cx={50 + Math.cos(a) * 30} cy={56 + Math.sin(a) * 30} r="9" />
          })}
        </g>
        <circle cx="50" cy="56" r="24" fill="#f7c873" />
        {eyes}
        <path d="M50 60 l-3 4 h6 z" fill="#8a5a2b" />
        {smile}
      </>
    ),
  },
  {
    id: 'frog', bg: '#cdeecb',
    draw: () => (
      <>
        <circle cx="34" cy="34" r="13" fill="#8fce7f" />
        <circle cx="66" cy="34" r="13" fill="#8fce7f" />
        <circle cx="34" cy="34" r="6" fill="#fff" />
        <circle cx="66" cy="34" r="6" fill="#fff" />
        <circle cx="34" cy="35" r="3" fill="#3a2b4d" />
        <circle cx="66" cy="35" r="3" fill="#3a2b4d" />
        <circle cx="50" cy="60" r="24" fill="#7cc26b" />
        <path d="M36 62 Q50 74 64 62" fill="none" stroke="#3a2b4d" strokeWidth="3" strokeLinecap="round" />
        {blush}
      </>
    ),
  },
  {
    id: 'penguin', bg: '#cfe3f2',
    draw: () => (
      <>
        <circle cx="50" cy="54" r="27" fill="#3a3f4a" />
        <ellipse cx="50" cy="60" rx="18" ry="21" fill="#fdfdfd" />
        {eyes}
        <path d="M50 56 l-6 5 12 0 z" fill="#f5a623" />
        <path d="M44 60 l12 0 -6 5 z" fill="#e0891a" />
        {blush}
      </>
    ),
  },
  {
    id: 'owl', bg: '#e5d8f0',
    draw: () => (
      <>
        <path d="M28 30 L38 44 L26 44 Z" fill="#9b7bbd" />
        <path d="M72 30 L62 44 L74 44 Z" fill="#9b7bbd" />
        <circle cx="50" cy="56" r="26" fill="#b198cf" />
        <circle cx="38" cy="52" r="11" fill="#fff" />
        <circle cx="62" cy="52" r="11" fill="#fff" />
        <circle cx="38" cy="52" r="5" fill="#3a2b4d" />
        <circle cx="62" cy="52" r="5" fill="#3a2b4d" />
        <path d="M50 58 l-5 5 10 0 z" fill="#f5a623" />
      </>
    ),
  },
  {
    id: 'hamster', bg: '#ffe9cf',
    draw: () => (
      <>
        <circle cx="32" cy="38" r="8" fill="#e6b98a" />
        <circle cx="68" cy="38" r="8" fill="#e6b98a" />
        <circle cx="50" cy="56" r="26" fill="#f3d6a9" />
        <ellipse cx="34" cy="64" rx="9" ry="7" fill="#fff" opacity="0.7" />
        <ellipse cx="66" cy="64" rx="9" ry="7" fill="#fff" opacity="0.7" />
        {eyes}
        <path d="M50 60 l-2.5 3 h5 z" fill="#8a5a2b" />
        {smile}
      </>
    ),
  },
]

/** Avatars from the shop (item code "avatar_<id>"); worn only by their owners (checked by the database). */
export const PREMIUM_AVATARS: AvatarDef[] = [
  {
    id: 'unicorn', bg: '#f3e1ff',
    draw: () => (
      <>
        <path d="M50 8 L56 32 L44 32 Z" fill="#ffd166" stroke="#e0a800" strokeWidth="1.5" />
        <path d="M46 16 L55 19 M45 23 L56 26" stroke="#e0a800" strokeWidth="1.5" />
        <path d="M24 34 Q18 60 28 76 Q24 56 34 44 Z" fill="#ff8fc8" />
        <path d="M30 30 Q24 48 30 60 Q30 46 40 38 Z" fill="#9be7ff" />
        <path d="M30 32 L36 46 L24 44 Z" fill="#fff" />
        <circle cx="52" cy="56" r="25" fill="#ffffff" stroke="#eadcf5" strokeWidth="2" />
        {eyes}{blush}
        {smile}
      </>
    ),
  },
  {
    id: 'dragon', bg: '#d7f5d2',
    draw: () => (
      <>
        <path d="M30 30 L36 44 L24 42 Z" fill="#ffd166" />
        <path d="M70 30 L64 44 L76 42 Z" fill="#ffd166" />
        <path d="M50 22 l5 10 h-10 z M40 26 l4 8 h-8 z M60 26 l4 8 h-8 z" fill="#2e9e5b" />
        <circle cx="50" cy="56" r="26" fill="#6fcf7f" />
        <ellipse cx="50" cy="66" rx="13" ry="8" fill="#a6e8b0" />
        <circle cx="45" cy="64" r="1.8" fill="#2c6b3f" />
        <circle cx="55" cy="64" r="1.8" fill="#2c6b3f" />
        {eyes}
        <path d="M42 70 Q50 75 58 70" fill="none" stroke="#2c6b3f" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'tiger', bg: '#ffe2b8',
    draw: () => (
      <>
        <circle cx="30" cy="34" r="9" fill="#f08a24" />
        <circle cx="70" cy="34" r="9" fill="#f08a24" />
        <circle cx="30" cy="34" r="4" fill="#ffd9b3" />
        <circle cx="70" cy="34" r="4" fill="#ffd9b3" />
        <circle cx="50" cy="56" r="26" fill="#f7a23b" />
        <path d="M50 30 v8 M42 32 l2 7 M58 32 l-2 7 M25 52 h8 M26 60 h7 M75 52 h-8 M74 60 h-7" stroke="#3a2b4d" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="50" cy="66" rx="11" ry="8" fill="#fff4e6" />
        {eyes}
        <path d="M50 61 l-3 3 h6 z" fill="#3a2b4d" />
        {smile}
      </>
    ),
  },
  {
    id: 'whale', bg: '#d4ecfb',
    draw: () => (
      <>
        <path d="M50 26 Q44 14 38 18 M50 26 Q56 14 62 18 M50 26 v-10" stroke="#5fb2e6" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="50" cy="58" rx="30" ry="24" fill="#5b9bd5" />
        <ellipse cx="50" cy="68" rx="20" ry="12" fill="#d9ecfb" />
        {eyes}{blush}
        {smile}
      </>
    ),
  },
]

export const DEFAULT_AVATAR = 'cat'
const byId = new Map([...AVATARS, ...PREMIUM_AVATARS].map((a) => [a.id, a]))

/** Frames from the shop (item codes), drawn around the avatar. */
export const FRAMES: Record<string, { background: string; badge?: string }> = {
  frame_gold: { background: 'linear-gradient(135deg, #f9e27d, #d4a017 45%, #fff3b0 70%, #c08a00)' },
  frame_rainbow: { background: 'conic-gradient(#ff6b6b, #ffd93d, #6bcb77, #4d96ff, #b06bff, #ff6b6b)' },
  frame_stars: { background: 'linear-gradient(135deg, #6b4fbb, #b89cf2)', badge: '★' },
}

export function Avatar({ id, size = 44, ring = false, frame }: { id?: string | null; size?: number; ring?: boolean; frame?: string | null }) {
  const a = byId.get(id ?? '') ?? AVATARS[0]
  const face = (
    <span
      className={`inline-grid place-items-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-plum ring-offset-2 ring-offset-paper' : ''}`}
      style={{ width: size, height: size, background: a.bg }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label={avatarLabel(a.id)} role="img">
        {a.draw()}
      </svg>
    </span>
  )
  const f = frame ? FRAMES[frame] : undefined
  if (!f) return face
  const pad = Math.max(2, Math.round(size / 14))
  return (
    <span className="relative inline-grid place-items-center rounded-full" style={{ padding: pad, background: f.background }}>
      {face}
      {f.badge && (
        <span
          className="absolute -top-1 -right-1 grid place-items-center rounded-full bg-paper text-plum"
          style={{ width: size / 2.6, height: size / 2.6, fontSize: size / 4 }}
        >
          {f.badge}
        </span>
      )}
    </span>
  )
}

export function AvatarPicker({ value, onChange, owned = [] }: { value: string; onChange: (id: string) => void; owned?: string[] }) {
  const mine = PREMIUM_AVATARS.filter((a) => owned.includes(`avatar_${a.id}`))
  return (
    <div className="grid grid-cols-6 gap-2">
      {[...AVATARS, ...mine].map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onChange(a.id)}
          title={avatarLabel(a.id)}
          className={`grid place-items-center rounded-2xl p-1 transition-transform hover:scale-105 ${
            value === a.id ? 'ring-2 ring-plum' : 'ring-1 ring-line'
          }`}
        >
          <Avatar id={a.id} size={40} />
        </button>
      ))}
    </div>
  )
}
