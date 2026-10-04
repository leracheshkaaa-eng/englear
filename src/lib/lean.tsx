import front from '../assets/mascot/lean-front.png'
import side from '../assets/mascot/lean-side.png'
import back from '../assets/mascot/lean-back.png'
import neutral from '../assets/mascot/lean-neutral.png'
import sly from '../assets/mascot/lean-sly.png'
import happy from '../assets/mascot/lean-happy.png'
import surprised from '../assets/mascot/lean-surprised.png'
import angry from '../assets/mascot/lean-angry.png'
import lying from '../assets/mascot/lean-lying.png'
import curious from '../assets/mascot/lean-curious.png'
import paw from '../assets/mascot/lean-paw.png'

/* ============================================================
   Lean (Лин), the fennec mascot. Friendly, a little sly, speaks to the learner on "ты".
   Poses: front / side / back (whole body), neutral, sly, happy, surprised, angry (faces),
   lying, curious (whole body), paw.
   ============================================================ */

const POSES = { front, side, back, neutral, sly, happy, surprised, angry, lying, curious, paw }
export type LeanPose = keyof typeof POSES

export function Lean({
  pose = 'neutral',
  size = 96,
  motion,
  className = '',
  alt = 'Lean',
}: {
  pose?: LeanPose
  /** height in px */
  size?: number
  motion?: 'breathe' | 'hop' | 'pop'
  className?: string
  alt?: string
}) {
  return (
    <img
      src={POSES[pose]}
      alt={alt}
      draggable={false}
      style={{ height: size, width: 'auto' }}
      className={`pointer-events-none select-none ${motion ? `lean-${motion}` : ''} ${className}`}
    />
  )
}

/** Lean with a speech bubble next to him. */
export function LeanSays({
  pose = 'neutral',
  size = 88,
  children,
  side = 'right',
  className = '',
  motion = 'breathe',
}: {
  pose?: LeanPose
  size?: number
  children: React.ReactNode
  side?: 'right' | 'top'
  className?: string
  motion?: 'breathe' | 'hop' | 'pop'
}) {
  const bubble = (
    <div className="lean-pop relative rounded-2xl border border-line bg-paper px-4 py-2.5 font-body text-[15px] leading-snug text-ink shadow-[0_8px_24px_-16px_rgba(47,42,51,0.5)]">
      {children}
      <span
        className={`absolute h-3 w-3 rotate-45 border-line bg-paper ${
          side === 'right' ? '-left-1.5 top-1/2 -translate-y-1/2 border-b border-l' : 'bottom-[-7px] left-8 border-r border-b'
        }`}
      />
    </div>
  )
  return side === 'right' ? (
    <div className={`flex items-center gap-3 ${className}`}>
      <Lean pose={pose} size={size} motion={motion} />
      {bubble}
    </div>
  ) : (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      {bubble}
      <Lean pose={pose} size={size} motion={motion} className="ml-4" />
    </div>
  )
}

/** A page-wide loading state: Lean napping. */
export function LeanLoading({ text }: { text?: string }) {
  return (
    <div className="grid place-items-center gap-3 py-20 text-mute">
      <Lean pose="lying" size={70} motion="breathe" />
      {text && <p className="font-body text-sm">{text}</p>}
    </div>
  )
}

/** An empty list: Lean looking curious, with a short line. */
export function LeanEmpty({ children, pose = 'curious' }: { children: React.ReactNode; pose?: LeanPose }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Lean pose={pose} size={110} motion="breathe" />
      <p className="max-w-sm text-mute">{children}</p>
    </div>
  )
}
