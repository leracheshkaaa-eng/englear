// Speech recognition in the browser (Web Speech API): Chrome, Edge and Safari support it, Firefox does not.
// Free and on-device or via the browser's own service; we only get the recognised text.

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const canListen = () => !!ctor()

/** Start listening to English. Returns `stop` (finishes and delivers the text via onEnd). */
export function listen(o: { onText: (text: string) => void; onEnd: (text: string) => void; onError: (code: string) => void }) {
  const C = ctor()
  if (!C) {
    o.onError('not-supported')
    return () => {}
  }
  const r = new C()
  r.lang = 'en-US'
  r.continuous = true
  r.interimResults = true
  r.maxAlternatives = 1
  let finalText = ''
  let latest = ''
  r.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      if (res.isFinal) finalText += res[0].transcript + ' '
      else interim += res[0].transcript
    }
    latest = (finalText + interim).replace(/\s+/g, ' ').trim()
    o.onText(latest)
  }
  r.onerror = (e) => o.onError(e.error)
  r.onend = () => o.onEnd(latest)
  try {
    r.start()
  } catch {
    o.onError('start-failed')
  }
  return () => r.stop()
}
