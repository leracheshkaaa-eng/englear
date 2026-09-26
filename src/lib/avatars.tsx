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

export const DEFAULT_AVATAR = 'cat'
const byId = new Map(AVATARS.map((a) => [a.id, a]))

export function Avatar({ id, size = 44, ring = false }: { id?: string | null; size?: number; ring?: boolean }) {
  const a = byId.get(id ?? '') ?? AVATARS[0]
  return (
    <span
      className={`inline-grid place-items-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-plum ring-offset-2 ring-offset-paper' : ''}`}
      style={{ width: size, height: size, background: a.bg }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label={avatarLabel(a.id)} role="img">
        {a.draw()}
      </svg>
    </span>
  )
}

export function AvatarPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {AVATARS.map((a) => (
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
