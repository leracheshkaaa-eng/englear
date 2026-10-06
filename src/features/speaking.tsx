import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { AiKindStatus, SpeakingFeedback, SpeakingFix, SpeakingScenario } from '../lib/api'
import { Lean, LeanSays, type LeanPose } from '../lib/lean'
import { canListen, listen } from '../lib/listen'
import { speak, stopSpeaking } from '../lib/supabase'
import { Button, inputCls } from '../lib/ui'
import { CostLine, ErrorLine } from './ai'

/* ============================================================
   Speaking practice: a voice role-play with Lean, then a short report.
   The learner talks (browser speech recognition) or types; Lean answers aloud.
   ============================================================ */

const EMOJI: Record<SpeakingScenario, string> = { free: '💬', cafe: '☕', friend: '🎉', interview: '💼', airport: '✈️', fandom: '🍿' }
type Line = { role: 'lean' | 'learner'; text: string; fix?: SpeakingFix | null }
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

export function Speaking({ status, plus, onSpent, onShop }: { status: AiKindStatus | null; plus: boolean; onSpent: () => void; onShop: () => void }) {
  const { t } = useTranslation()
  const [scenario, setScenario] = useState<SpeakingScenario>('free')
  const [session, setSession] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [left, setLeft] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [typed, setTyped] = useState('')
  const [typing, setTyping] = useState(!canListen())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<SpeakingFeedback | null | undefined>(undefined)
  const stopRef = useRef<(() => void) | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  // braces matter: newer browsers return a promise from scrollIntoView, and React must not get it back
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [lines, phase])
  useEffect(() => () => (stopRef.current?.(), stopSpeaking()), [])

  const say = (text: string) => {
    setPhase('speaking')
    speak(text, () => setPhase((p) => (p === 'speaking' ? 'idle' : p)))
  }

  async function start() {
    setErr('')
    setBusy(true)
    try {
      const res = await api.aiSpeakingStart(scenario)
      setSession(res.session_id)
      setLines([{ role: 'lean', text: res.reply }])
      setLeft(res.turns_left)
      setFeedback(undefined)
      onSpent()
      say(res.reply)
    } catch (e) {
      setErr(e instanceof api.AiError ? e.code : 'ai_failed')
    } finally {
      setBusy(false)
    }
  }

  async function send(text: string) {
    const said = text.trim()
    if (!said || !session) return
    setErr('')
    setHeard('')
    setTyped('')
    setLines((l) => [...l, { role: 'learner', text: said }])
    setPhase('thinking')
    try {
      const res = await api.aiSpeakingTurn(session, said)
      setLines((l) => {
        const next = [...l]
        next[next.length - 1] = { ...next[next.length - 1], fix: res.fix }
        return [...next, { role: 'lean', text: res.reply }]
      })
      setLeft(res.turns_left)
      say(res.reply)
    } catch (e) {
      setPhase('idle')
      setLines((l) => l.slice(0, -1))
      setErr(e instanceof api.AiError ? e.code : 'ai_failed')
    }
  }

  function toggleMic() {
    if (phase === 'listening') {
      stopRef.current?.()
      return
    }
    stopSpeaking()
    setErr('')
    setHeard('')
    setPhase('listening')
    stopRef.current = listen({
      onText: setHeard,
      onEnd: (text) => {
        stopRef.current = null
        if (text) send(text)
        else {
          setPhase('idle')
          setErr('not_heard')
        }
      },
      onError: (code) => {
        if (code === 'no-speech' || code === 'aborted') return
        setPhase('idle')
        setErr(code === 'not-allowed' || code === 'service-not-allowed' ? 'mic_denied' : 'mic_failed')
        if (code === 'not-supported') setTyping(true)
      },
    })
  }

  async function finish() {
    if (!session) return
    stopRef.current?.()
    stopSpeaking()
    setBusy(true)
    try {
      const res = await api.aiSpeakingEnd(session)
      setFeedback(res.feedback)
    } catch (e) {
      setErr(e instanceof api.AiError ? e.code : 'ai_failed')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setSession(null)
    setLines([])
    setFeedback(undefined)
    setErr('')
    setPhase('idle')
  }

  /* ---------- pick a scene ---------- */
  if (!session)
    return (
      <div className="mt-5 space-y-4">
        <LeanSays pose="sly" size={80}>
          {t('ai.speaking.intro')}
        </LeanSays>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {api.SPEAKING_SCENARIOS.map((s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={`rounded-2xl border p-4 text-left transition ${scenario === s ? 'border-plum bg-lilac/50' : 'border-line bg-paper hover:border-lavender'}`}
            >
              <span className="text-2xl">{EMOJI[s]}</span>
              <span className="mt-1 block font-display text-lg font-semibold">{t(`ai.speaking.scenarios.${s}.title`)}</span>
              <span className="text-sm text-mute">{t(`ai.speaking.scenarios.${s}.desc`)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={start} disabled={busy} className="px-6 py-3">
            {busy ? t('ai.speaking.starting') : `🎙️ ${t('ai.speaking.start')}`}
          </Button>
          <CostLine s={status} plus={plus} kind="speaking" />
        </div>
        {!canListen() && <p className="text-sm text-mute">{t('ai.speaking.noMic')}</p>}
        {err && <SpeakErr code={err} onShop={onShop} />}
      </div>
    )

  /* ---------- the report ---------- */
  if (feedback !== undefined)
    return (
      <div className="mt-5 space-y-4">
        {feedback ? <Report f={feedback} /> : <p className="text-mute">{t('ai.speaking.noReport')}</p>}
        <Button onClick={reset}>{t('ai.speaking.again')}</Button>
      </div>
    )

  /* ---------- the conversation ---------- */
  const pose: LeanPose = phase === 'listening' ? 'curious' : phase === 'thinking' ? 'sly' : phase === 'speaking' ? 'happy' : 'neutral'
  return (
    <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="flex flex-row items-center gap-4 rounded-3xl border border-line bg-gradient-to-b from-cream to-mist/50 p-4 md:flex-col md:justify-center">
        <Lean pose={pose} size={120} motion={phase === 'idle' ? 'breathe' : 'pop'} key={pose} />
        <div className="text-sm md:text-center">
          <p className="font-semibold">{t(`ai.speaking.phase.${phase}`)}</p>
          <p className="text-mute">
            {EMOJI[scenario]} {t(`ai.speaking.scenarios.${scenario}.title`)} · {t('ai.speaking.turnsLeft', { n: left })}
          </p>
        </div>
      </aside>

      <div className="flex min-h-[50vh] flex-col rounded-2xl border border-line bg-paper">
        <div className="flex-1 space-y-3 overflow-y-auto p-4 md:max-h-[55vh]">
          {lines.map((l, i) => (
            <div key={i} className={`flex flex-col ${l.role === 'learner' ? 'items-end' : 'items-start'}`}>
              <div className={`flex max-w-[85%] items-start gap-2 rounded-2xl px-4 py-2 text-[15px] leading-relaxed ${l.role === 'learner' ? 'bg-plum text-paper' : 'bg-lilac/60 text-ink'}`}>
                <span>{l.text}</span>
                {l.role === 'lean' && (
                  <button onClick={() => say(l.text)} title={t('ai.speaking.replay')} className="shrink-0 opacity-60 hover:opacity-100">
                    🔊
                  </button>
                )}
              </div>
              {l.fix && (
                <p className="mt-1 max-w-[85%] rounded-xl bg-honey/30 px-3 py-1.5 text-sm">
                  ✏️ <b>{l.fix.better}</b> <span className="text-mute">— {l.fix.why}</span>
                </p>
              )}
            </div>
          ))}
          {phase === 'listening' && <p className="text-right text-sm italic text-mute">{heard || '…'}</p>}
          {phase === 'thinking' && <p className="text-sm text-mute">{t('ai.thinking')}</p>}
          <div ref={bottom} />
        </div>

        <div className="space-y-2 border-t border-line p-3">
          {err && <SpeakErr code={err} onShop={onShop} />}
          {left <= 0 ? (
            <p className="text-sm text-mute">{t('ai.speaking.over')}</p>
          ) : typing ? (
            <div className="flex gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value.slice(0, 400))}
                onKeyDown={(e) => e.key === 'Enter' && phase !== 'thinking' && send(typed)}
                placeholder={t('ai.speaking.typePlaceholder')}
                className={`${inputCls} min-w-0 flex-1`}
              />
              <Button onClick={() => send(typed)} disabled={phase === 'thinking' || !typed.trim()}>
                {t('ai.send')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={toggleMic}
                disabled={phase === 'thinking'}
                className={`grid h-16 w-16 place-items-center rounded-full text-2xl text-paper shadow-lg transition ${phase === 'listening' ? 'animate-pulse bg-warn' : 'bg-plum hover:scale-105'} disabled:opacity-50`}
                aria-label={t('ai.speaking.mic')}
              >
                {phase === 'listening' ? '■' : '🎙️'}
              </button>
              <p className="text-xs text-mute">{phase === 'listening' ? t('ai.speaking.tapToSend') : t('ai.speaking.tapToTalk')}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {canListen() && (
              <button onClick={() => setTyping((v) => !v)} className="text-mute hover:text-ink">
                {typing ? `🎙️ ${t('ai.speaking.useMic')}` : `⌨️ ${t('ai.speaking.typeInstead')}`}
              </button>
            )}
            <Button variant="soft" onClick={finish} disabled={busy || phase === 'thinking'}>
              {busy ? t('ai.speaking.reporting') : t('ai.speaking.finish')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpeakErr({ code, onShop }: { code: string; onShop: () => void }) {
  const { t } = useTranslation()
  if (code === 'not_heard' || code === 'mic_denied' || code === 'mic_failed' || code === 'session_over')
    return <p className="text-sm text-warn">{t(`ai.speaking.errors.${code}`)}</p>
  return <ErrorLine code={code} onShop={onShop} />
}

function Report({ f }: { f: SpeakingFeedback }) {
  const { t } = useTranslation()
  const card = 'rounded-2xl border border-line bg-paper p-5'
  return (
    <>
      <div className={card}>
        <LeanSays pose="happy" size={80}>
          {f.summary}
        </LeanSays>
      </div>
      {f.strengths.length > 0 && (
        <div className={card}>
          <h3 className="mb-2 font-display text-xl font-semibold">💪 {t('ai.speaking.strengths')}</h3>
          <ul className="list-disc space-y-1 pl-5">
            {f.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {f.fixes.length > 0 && (
        <div className={card}>
          <h3 className="mb-2 font-display text-xl font-semibold">✏️ {t('ai.speaking.fixes')}</h3>
          <div className="space-y-3">
            {f.fixes.map((x, i) => (
              <div key={i}>
                <p className="text-sm text-mute line-through">{x.said}</p>
                <p className="font-semibold">
                  {x.better}{' '}
                  <button onClick={() => speak(x.better)} className="text-sm opacity-60 hover:opacity-100">
                    🔊
                  </button>
                </p>
                <p className="text-sm text-mute">{x.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {f.phrases.length > 0 && (
        <div className={card}>
          <h3 className="mb-2 font-display text-xl font-semibold">🗣️ {t('ai.speaking.phrases')}</h3>
          <div className="space-y-2">
            {f.phrases.map((p, i) => (
              <button key={i} onClick={() => speak(p.phrase)} className="block w-full rounded-xl bg-lilac/40 px-3 py-2 text-left hover:bg-lilac/70">
                <b>{p.phrase}</b> <span className="text-sm text-mute">— {p.meaning}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {f.next && <p className="rounded-2xl bg-cream px-4 py-3">🎯 {f.next}</p>}
    </>
  )
}
