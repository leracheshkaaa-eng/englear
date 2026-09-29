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

/** Plays the script line by line; Stop interrupts. */
function AudioPlayer({ segments }: { segments: { speaker: string; text: string }[] }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState<number | null>(null)
  const run = useRef(0) // a new Play or Stop cancels the running sequence

  useEffect(() => () => {
    run.current++
    stopSpeaking()
  }, [])

  function playFrom(i: number, id: number) {
    if (id !== run.current) return
    if (i >= segments.length) return setPlaying(null)
    setPlaying(i)
    speak(segments[i].text, () => {
      // a short pause between lines, as in a real recording
      setTimeout(() => playFrom(i + 1, id), 350)
    })
  }

  function play() {
    const id = ++run.current
    playFrom(0, id)
  }
  function stop() {
    run.current++
    stopSpeaking()
    setPlaying(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {playing === null ? (
        <Button onClick={play}>▶ {t('practice.listen')}</Button>
      ) : (
        <Button variant="soft" onClick={stop}>
          ■ {t('practice.stop')}
        </Button>
      )}
      <span className="text-sm text-mute">
        {playing === null ? t('practice.listenHint') : t('practice.playing', { n: playing + 1, total: segments.length })}
      </span>
    </div>
  )
}
