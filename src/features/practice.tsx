import { useEffect, useRef, useState } from 'react'
import i18n, { tKey } from '../i18n'
import { useTranslation } from 'react-i18next'
import { Button, TranslatableText } from '../lib/ui'
import { speak, stopSpeaking } from '../lib/supabase'
import * as api from '../lib/api'
import type { Material, WordHint } from '../lib/api'

/* ============================================================
   Practice: a reading text or a listening script, shown before the questions
   and kept at hand while answering them.
   ============================================================ */

/** "Article", "Podcast", … */
export const materialTypeLabel = (type: string | null | undefined) => (type ? tKey(`practice.types.${type}`, type) : '')

/** "≈ 3 min · 250 words" */
export function materialLength(l: Pick<api.CatalogLesson, 'skill' | 'word_count' | 'duration_sec'>) {
  const parts: string[] = []
  if (l.skill === 'listening' && l.duration_sec) parts.push(i18n.t('practice.minutes', { count: Math.max(1, Math.round(l.duration_sec / 60)) }))
  if (l.word_count) parts.push(i18n.t('practice.words', { count: l.word_count }))
  return parts.join(' · ')
}

export function MaterialView({
  material,
  skill,
  dict,
  translations,
  compact,
}: {
  material: Material
  skill: string
  dict: Map<string, WordHint>
  translations: boolean
  /** while answering: the text is folded, the audio stays playable */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const listening = skill === 'listening'
  const [open, setOpen] = useState(!compact)
  const [showScript, setShowScript] = useState(false)
  const T = (s: string) => <TranslatableText text={s} dict={dict} enabled={translations} />

  const paragraphs = material.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const script = material.segments.length ? material.segments : paragraphs.map((text) => ({ speaker: '', text }))

  return (
    <div className="rounded-3xl border border-line bg-paper p-6 sm:p-8">
      {listening ? (
        <>
          <AudioPlayer segments={script} />
          <button onClick={() => setShowScript((v) => !v)} className="mt-4 font-body text-sm font-semibold text-plum">
            {showScript ? t('practice.hideScript') : t('practice.showScript')}
          </button>
          {showScript && (
            <div className="mt-3 space-y-2">
              {script.map((s, i) => (
                <p key={i} className="font-body leading-relaxed">
                  {s.speaker && <b className="mr-2 text-plum">{s.speaker}:</b>}
                  {T(s.text)}
                </p>
              ))}
            </div>
          )}
        </>
      ) : compact && !open ? (
        <button onClick={() => setOpen(true)} className="font-body text-sm font-semibold text-plum">
          {t('practice.showText')}
        </button>
      ) : (
        <>
          <div className="space-y-4">
            {paragraphs.map((p, i) => (
              <p key={i} className="font-body text-lg leading-relaxed">
                {T(p)}
              </p>
            ))}
          </div>
          {compact && (
            <button onClick={() => setOpen(false)} className="mt-4 font-body text-sm font-semibold text-plum">
              {t('practice.hideText')}
            </button>
          )}
        </>
      )}
    </div>
  )
}

const SPEEDS = [0.75, 1, 1.25]
/** Spoken characters per second at normal speed — only to move the bar smoothly inside a line. */
const CHARS_PER_SEC = 13

/** Plays the script line by line: pause / resume, a seek bar (by lines), previous / next line, speed. */
function AudioPlayer({ segments }: { segments: { speaker: string; text: string }[] }) {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0) // the current line
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [within, setWithin] = useState(0) // 0..1 inside the current line (estimated)
  const run = useRef(0) // a new play / pause / seek cancels the running sequence
  const lineStart = useRef(0)

  // the bar is measured in characters, so long lines take more of it
  const lengths = segments.map((s) => Math.max(1, s.text.length))
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0))
  const total = lengths.reduce((a, b) => a + b, 0)
  const position = segments.length ? starts[Math.min(idx, segments.length - 1)] + within * lengths[Math.min(idx, segments.length - 1)] : 0

  useEffect(() => {
    return () => {
      run.current++
      stopSpeaking()
    }
  }, [])

  // smooth movement inside the playing line
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const secs = (performance.now() - lineStart.current) / 1000
      setWithin(Math.min(0.97, (secs * CHARS_PER_SEC * rate) / lengths[idx]))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, idx, rate])

  function playFrom(i: number, id: number, r: number) {
    if (id !== run.current) return
    if (i >= segments.length) {
      setPlaying(false)
      setIdx(0)
      setWithin(0)
      return
    }
    setIdx(i)
    setWithin(0)
    setPlaying(true)
    lineStart.current = performance.now()
    speak(
      segments[i].text,
      () => {
        if (id !== run.current) return
        setWithin(1)
        // a short pause between lines, as in a real recording
        setTimeout(() => playFrom(i + 1, id, r), 350)
      },
      r,
    )
  }

  const start = (i: number, r = rate) => playFrom(i, ++run.current, r)
  function pause() {
    run.current++
    stopSpeaking()
    setPlaying(false)
    setWithin(0) // resume starts the line again
  }
  function go(i: number) {
    const next = Math.max(0, Math.min(segments.length - 1, i))
    if (playing) start(next)
    else {
      setIdx(next)
      setWithin(0)
    }
  }
  function seek(pos: number) {
    let i = 0
    while (i < segments.length - 1 && starts[i + 1] <= pos) i++
    go(i)
  }
  function changeRate(r: number) {
    setRate(r)
    if (playing) start(idx, r)
  }

  const round = 'grid h-10 w-10 place-items-center rounded-full border border-line text-lg leading-none hover:border-lavender disabled:opacity-40'
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className={round} onClick={() => go(idx - 1)} disabled={idx === 0} title={t('practice.prevLine')} aria-label={t('practice.prevLine')}>
          ⏮
        </button>
        <button
          className="grid h-12 w-12 place-items-center rounded-full bg-plum text-xl text-white shadow-sm hover:opacity-90"
          onClick={() => (playing ? pause() : start(idx))}
          title={playing ? t('practice.pause') : t('practice.listen')}
          aria-label={playing ? t('practice.pause') : t('practice.listen')}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button className={round} onClick={() => go(idx + 1)} disabled={idx >= segments.length - 1} title={t('practice.nextLine')} aria-label={t('practice.nextLine')}>
          ⏭
        </button>
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={Math.round(position)}
          onChange={(e) => seek(Number(e.target.value))}
          className="mx-2 min-w-0 flex-1 accent-plum"
          aria-label={t('practice.seek')}
        />
        <div className="flex overflow-hidden rounded-full border border-line text-xs font-semibold" title={t('practice.speed')}>
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => changeRate(s)} className={`px-2 py-1.5 ${s === rate ? 'bg-lilac text-plum' : 'text-mute hover:bg-lilac/40'}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-mute">
        {playing || idx > 0 ? t('practice.playing', { n: idx + 1, total: segments.length }) : t('practice.listenHint')}
      </p>
    </div>
  )
}
