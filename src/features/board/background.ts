/* Paper backgrounds for the whiteboard: plain, dots, squares, lines.
   Drawn with CSS behind a transparent Excalidraw canvas and moved with its scroll and zoom. */

export const BACKGROUNDS = ['plain', 'dots', 'grid', 'lines'] as const
export type Background = (typeof BACKGROUNDS)[number]

const STEP = 28 // board units between dots / lines
const INK = 'rgba(122, 91, 191, 0.22)'

export function backgroundStyle(bg: Background, scrollX: number, scrollY: number, zoom: number): React.CSSProperties {
  const s = STEP * zoom
  const pos = `${scrollX * zoom}px ${scrollY * zoom}px`
  switch (bg) {
    case 'dots':
      return { backgroundColor: '#ffffff', backgroundImage: `radial-gradient(circle, ${INK} ${Math.max(1, 1.4 * zoom)}px, transparent ${Math.max(1.2, 1.6 * zoom)}px)`, backgroundSize: `${s}px ${s}px`, backgroundPosition: pos }
    case 'grid':
      return {
        backgroundColor: '#ffffff',
        backgroundImage: `linear-gradient(${INK} 1px, transparent 1px), linear-gradient(90deg, ${INK} 1px, transparent 1px)`,
        backgroundSize: `${s}px ${s}px`,
        backgroundPosition: pos,
      }
    case 'lines':
      return { backgroundColor: '#ffffff', backgroundImage: `linear-gradient(${INK} 1px, transparent 1px)`, backgroundSize: `${s}px ${s * 1.3}px`, backgroundPosition: pos }
    default:
      return { backgroundColor: '#ffffff' }
  }
}
