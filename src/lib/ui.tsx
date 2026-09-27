import i18n from '../i18n'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { speak } from './supabase'
import * as api from './api'
import type { WordHint } from './api'
import { useAuth } from './auth'

/* ---------- buttons / inputs ---------- */

export function Button({
  children,
  onClick,
  variant = 'solid',
  className = '',
  type = 'button',
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'solid' | 'soft' | 'ghost' | 'danger'
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const styles =
    variant === 'solid'
      ? 'bg-plum text-paper hover:bg-plum-deep'
      : variant === 'soft'
        ? 'bg-lilac text-plum-deep hover:bg-lavender/40'
        : variant === 'danger'
          ? 'bg-paper text-warn border border-warn/40 hover:bg-warn/10'
          : 'text-mute hover:text-ink'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-plum/20 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export const inputCls =
  'rounded-xl border border-line bg-paper px-3 py-2 font-body text-ink outline-none focus:border-plum focus:ring-4 focus:ring-plum/15'

export function SpeakerButton({ text, className = '' }: { text: string; className?: string }) {
  const [playing, setPlaying] = useState(false)

  function play(e: React.MouseEvent) {
    // Audio only: never bubble to a parent card's flip/click handler.
    e.stopPropagation()
    e.preventDefault()
    setPlaying(true)
    speak(text, () => setPlaying(false))
    // safety net in case a browser never reports the end of speech
    window.setTimeout(() => setPlaying(false), 8000)
  }

  // Pointer/touch events must not reach a parent card either (it starts swipes on them).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <button
      type="button"
      onClick={play}
      onPointerDown={stop}
      onPointerUp={stop}
      onTouchStart={stop}
      aria-label={i18n.t('player.listenTo', { text })}
      aria-pressed={playing}
      className={`inline-grid h-8 w-8 place-items-center rounded-full transition-colors ${
        playing ? 'bg-plum text-paper ring-4 ring-plum/20' : 'bg-lilac text-plum-deep hover:bg-lavender/40'
      } ${className}`}
    >
      <span className={playing ? 'animate-pulse' : ''}>🔊</span>
    </button>
  )
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-lilac px-3 py-1 font-body text-xs font-semibold uppercase tracking-wide text-plum-deep">
      {children}
    </span>
  )
}

/* ============================================================
   Word translation tooltip.
   Wraps English text; each word can be hovered (desktop) or
   tapped (mobile) to show a small translation popup.
   ============================================================ */

function cleanToken(raw: string) {
  return raw.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, '')
}

export function TranslatableText({
  text,
  dict,
  enabled,
}: {
  text: string
  dict: Map<string, WordHint>
  enabled: boolean
}) {
  const [active, setActive] = useState<{ word: WordHint; x: number; y: number } | null>(null)
  // leaving the word closes the popup after a short delay, so the mouse can reach it
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keepOpen = () => clearTimeout(closeTimer.current)
  const closeSoon = (id?: string) => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setActive((a) => (!id || a?.word.id === id ? null : a)), 250)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!active) return
    const close = () => setActive(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [active])

  if (!enabled) return <>{text}</>

  const tokens = text.split(/(\s+)/)
  return (
    <>
      {tokens.map((tok, i) => {
        if (/^\s+$/.test(tok) || !tok) return <span key={i}>{tok}</span>
        const key = cleanToken(tok).toLowerCase()
        const word = key ? dict.get(key) : undefined
        if (!word) return <span key={i}>{tok}</span>
        const show = (e: React.MouseEvent | React.FocusEvent) => {
          keepOpen()
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setActive({ word, x: r.left + r.width / 2, y: r.top })
        }
        return (
          <span
            key={i}
            tabIndex={0}
            onMouseEnter={show}
            onMouseLeave={() => closeSoon(word.id)}
            onFocus={show}
            onBlur={(e) => {
              // keep it open when focus moves into the popup (its button)
              if (!(e.relatedTarget as HTMLElement | null)?.closest('[data-word-popup]')) setActive(null)
            }}
            onClick={(e) => {
              e.stopPropagation()
              show(e)
            }}
            className="cursor-help rounded-sm underline decoration-dotted decoration-lavender underline-offset-4 hover:bg-lilac/60"
          >
            {tok}
          </span>
        )
      })}
      {active && (
        <WordPopup word={active.word} x={active.x} y={active.y} onClose={() => setActive(null)} onEnter={keepOpen} onLeave={() => closeSoon()} />
      )}
    </>
  )
}

function WordPopup({
  word,
  x,
  y,
  onClose,
  onEnter,
  onLeave,
}: {
  word: WordHint
  x: number
  y: number
  onClose: () => void
  onEnter: () => void
  onLeave: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y, placement: 'top' as 'top' | 'bottom' })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const margin = 8
    let left = x - w / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - w - margin))
    let placement: 'top' | 'bottom' = 'top'
    let top = y - h - 10
    if (top < margin) {
      top = y + 26
      placement = 'bottom'
    }
    setPos({ left, top, placement })
  }, [x, y, word.id])

  useEffect(() => {
    const onDoc = () => onClose()
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [onClose])

  return (
    <div
      ref={ref}
      data-word-popup
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 50 }}
      className="pointer-events-auto max-w-[240px] rounded-xl border border-line bg-paper px-3 py-2 shadow-[0_12px_30px_-14px_rgba(60,42,112,0.6)]"
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-base font-semibold text-ink">{word.word}</span>
        <SpeakerButton text={word.word} className="h-6 w-6 text-xs" />
      </div>
      <p className="font-body text-sm text-plum">{word.translation || word.definition || '—'}</p>
      {word.example && <p className="mt-1 font-body text-xs text-mute">{word.example}</p>}
      <MyWordsButton wordId={word.id} />
    </div>
  )
}

/** Small "add to my cards" button: puts the word into the personal "My words" set. */
function MyWordsButton({ wordId }: { wordId: string }) {
  const { userId } = useAuth()
  const [state, setState] = useState<'unknown' | 'no' | 'saving' | 'yes'>('unknown')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setState('unknown')
    api.inMyWords(userId, wordId).then((yes) => { if (!cancelled) setState(yes ? 'yes' : 'no') }).catch(() => { if (!cancelled) setState('no') })
    return () => { cancelled = true }
  }, [userId, wordId])

  if (!userId) return null
  const t = i18n.t.bind(i18n)
  async function add() {
    if (!userId || state !== 'no') return
    setState('saving')
    try {
      await api.addToMyWords(userId, wordId, t('flashcards.myWordsSet'))
      setState('yes')
    } catch {
      setState('no')
    }
  }
  const done = state === 'yes'
  return (
    <button
      onClick={add}
      disabled={state !== 'no'}
      className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-body text-xs font-semibold transition-colors ${
        done ? 'border-transparent bg-[rgba(63,143,107,.12)] text-[var(--color-good)]' : 'border-line text-plum hover:border-lavender hover:bg-lilac/50 disabled:opacity-50'
      }`}
    >
      {done ? `✓ ${t('flashcards.inMyCards')}` : `+ ${t('flashcards.addToMyCards')}`}
    </button>
  )
}
