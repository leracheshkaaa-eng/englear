/* Decorative stickers for the whiteboard: small SVGs in the mascot's soft palette.
   They are inserted as pictures (and saved to storage like any picture). */

const P = { ink: '#3b3340', cream: '#f6efe6', lilac: '#d9d2e9', plum: '#7a5bbf', rose: '#f2c6c2', mint: '#cfeadb', sun: '#ffd77a', sky: '#cfe3f7' }

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

export const STICKERS: { id: string; label: string; svg: string }[] = [
  { id: 'star', label: '★', svg: svg(120, 120, `<path d="M60 8l15 33 36 4-27 24 8 35-32-18-32 18 8-35L9 45l36-4z" fill="${P.sun}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>`) },
  { id: 'heart', label: '❤', svg: svg(120, 110, `<path d="M60 100S10 70 10 38C10 20 24 8 40 8c10 0 16 6 20 12 4-6 10-12 20-12 16 0 30 12 30 30 0 32-50 62-50 62z" fill="${P.rose}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>`) },
  { id: 'bubble', label: '💬', svg: svg(220, 150, `<path d="M30 10h160a20 20 0 0 1 20 20v70a20 20 0 0 1-20 20H90l-40 26 8-26H30a20 20 0 0 1-20-20V30a20 20 0 0 1 20-20z" fill="${P.cream}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>`) },
  { id: 'cloud', label: '💭', svg: svg(220, 160, `<path d="M60 110c-26 0-44-16-44-38s18-36 40-34c6-20 26-30 46-26 16 3 26 12 30 24 26-6 50 10 50 34 0 24-20 40-46 40z" fill="${P.sky}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="54" cy="130" r="9" fill="${P.sky}" stroke="${P.ink}" stroke-width="4"/><circle cx="36" cy="148" r="5" fill="${P.sky}" stroke="${P.ink}" stroke-width="3"/>`) },
  { id: 'ribbon', label: '🎀', svg: svg(320, 90, `<path d="M10 22h40v50H10l16-25z" fill="${P.plum}" opacity=".75"/><path d="M310 22h-40v50h40l-16-25z" fill="${P.plum}" opacity=".75"/><rect x="40" y="10" width="240" height="58" rx="6" fill="${P.lilac}" stroke="${P.ink}" stroke-width="4"/>`) },
  { id: 'badge', label: '🏅', svg: svg(130, 150, `<path d="M40 90l-14 52 24-12 14 20 10-50zM90 90l14 52-24-12-14 20-10-50z" fill="${P.rose}" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round"/><circle cx="65" cy="60" r="50" fill="${P.sun}" stroke="${P.ink}" stroke-width="4"/><circle cx="65" cy="60" r="36" fill="none" stroke="${P.ink}" stroke-width="2" stroke-dasharray="6 6"/>`) },
  { id: 'check', label: '✓', svg: svg(110, 110, `<circle cx="55" cy="55" r="48" fill="${P.mint}" stroke="${P.ink}" stroke-width="4"/><path d="M32 57l15 15 32-34" fill="none" stroke="${P.ink}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`) },
  { id: 'cross', label: '✗', svg: svg(110, 110, `<circle cx="55" cy="55" r="48" fill="${P.rose}" stroke="${P.ink}" stroke-width="4"/><path d="M37 37l36 36M73 37L37 73" stroke="${P.ink}" stroke-width="8" stroke-linecap="round"/>`) },
  { id: 'bulb', label: '💡', svg: svg(100, 140, `<path d="M50 8a38 38 0 0 0-22 69c6 5 8 11 8 17h28c0-6 2-12 8-17A38 38 0 0 0 50 8z" fill="${P.sun}" stroke="${P.ink}" stroke-width="4"/><rect x="34" y="98" width="32" height="12" rx="4" fill="${P.lilac}" stroke="${P.ink}" stroke-width="3"/><rect x="38" y="114" width="24" height="12" rx="4" fill="${P.lilac}" stroke="${P.ink}" stroke-width="3"/>`) },
  { id: 'sun', label: '☀', svg: svg(130, 130, `<g stroke="${P.ink}" stroke-width="5" stroke-linecap="round"><path d="M65 6v16M65 108v16M6 65h16M108 65h16M23 23l11 11M96 96l11 11M23 107l11-11M96 34l11-11"/></g><circle cx="65" cy="65" r="30" fill="${P.sun}" stroke="${P.ink}" stroke-width="4"/>`) },
  { id: 'flag', label: '🚩', svg: svg(110, 140, `<path d="M20 10v124" stroke="${P.ink}" stroke-width="6" stroke-linecap="round"/><path d="M22 14c26-10 40 10 70 0v52c-30 10-44-10-70 0z" fill="${P.rose}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>`) },
  { id: 'paw', label: '🐾', svg: svg(110, 110, `<g fill="${P.ink}"><ellipse cx="55" cy="70" rx="26" ry="22"/><ellipse cx="24" cy="44" rx="10" ry="13"/><ellipse cx="44" cy="26" rx="10" ry="13"/><ellipse cx="66" cy="26" rx="10" ry="13"/><ellipse cx="86" cy="44" rx="10" ry="13"/></g><ellipse cx="55" cy="72" rx="15" ry="12" fill="${P.rose}"/>`) },
]

/** Coloured, labelled blocks that stay editable (double-click to change the text). */
export const LABELS: { text: string; bg: string }[] = [
  { text: 'Rule', bg: P.lilac },
  { text: 'New words', bg: P.sun },
  { text: 'Example', bg: P.sky },
  { text: 'Remember!', bg: P.rose },
  { text: 'Practice', bg: P.mint },
  { text: 'Homework', bg: P.cream },
]
export const NOTE_COLORS = [P.sun, P.rose, P.mint, P.sky, P.lilac, P.cream]

export const SYMBOLS = ['✓', '✗', '★', '❤', '→', '←', '↑', '↓', '!', '?', '❗', '❓', '✏️', '📖', '🎧', '🗣️', '👍', '👏', '🎉', '⭐', '🔥', '💡', '🌞', '🌧️', '🐾', '🦊', '🍎', '🏠', '⚽', '🎵']

export const svgDataURL = (s: string) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(s)))}`
