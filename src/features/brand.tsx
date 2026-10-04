import { useEffect, useRef, useState } from 'react'
import neutral from '../assets/mascot/lean-neutral.png'
import { EARS_SVG, LeanLogo } from '../lib/lean'

/* ============================================================
   /brand — the EngLean logo as downloadable PNGs (app icons and the wordmark).
   Everything is drawn on a canvas with the site's own font, so the files match the site.
   ============================================================ */

const C = { graphite: '#2f2a33', ear: '#3a3237', inner: '#cdb1b3', cream: '#f6efe6', plum: '#5b3fa0', paper: '#fbf7f0', white: '#ffffff' }

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, face: HTMLImageElement) => void

function roundRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, r)
  ctx.fill()
}

/** Lean's ears with their top-left corner at (x, y), `width` wide. */
function drawEars(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, outline = C.graphite) {
  const s = width / 140
  const half = () => {
    ctx.lineJoin = 'round'
    const ear = new Path2D(EARS_SVG.ear)
    ctx.fillStyle = C.ear
    ctx.fill(ear)
    ctx.strokeStyle = outline
    ctx.lineWidth = outline === C.graphite ? 2 : 3
    ctx.stroke(ear)
    const inner = new Path2D(EARS_SVG.inner)
    ctx.fillStyle = C.inner
    ctx.fill(inner)
    ctx.strokeStyle = 'rgba(47,42,51,.35)'
    ctx.lineWidth = 1.2
    ctx.stroke(inner)
    const fur = new Path2D(EARS_SVG.fur)
    ctx.fillStyle = C.cream
    ctx.fill(fur)
    ctx.strokeStyle = 'rgba(47,42,51,.45)'
    ctx.stroke(fur)
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  half()
  ctx.translate(140, 0)
  ctx.scale(-1, 1)
  half()
  ctx.restore()
}

/* Fraunces picks its optical size from the pixel size: big canvas text would come out thin and
   contrasty. Text is drawn at the header's size (34px) and scaled up, so it looks like the site logo. */
const TEXT_PX = 34
function measure(ctx: CanvasRenderingContext2D, str: string, size: number) {
  ctx.font = `600 ${TEXT_PX}px Fraunces`
  const m = ctx.measureText(str)
  const k = size / TEXT_PX
  return { width: m.width * k, ascent: m.actualBoundingBoxAscent * k }
}
function text(ctx: CanvasRenderingContext2D, str: string, x: number, base: number, size: number, color: string) {
  ctx.save()
  ctx.translate(x, base)
  ctx.scale(size / TEXT_PX, size / TEXT_PX)
  ctx.font = `600 ${TEXT_PX}px Fraunces`
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color
  ctx.fillText(str, 0, 0)
  ctx.restore()
}

/** The wordmark "EngLean" with ears over "Lean", centred in the canvas. */
function drawWordmark(ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean) {
  const size = h * 0.4
  const eng = measure(ctx, 'Eng', size).width
  const lean = measure(ctx, 'Lean', size).width
  const cap = measure(ctx, 'L', size).ascent
  const x = (w - eng - lean) / 2
  const base = h * 0.82
  text(ctx, 'Eng', x, base, size, dark ? C.paper : C.graphite)
  text(ctx, 'Lean', x + eng, base, size, dark ? '#c9b8f0' : C.plum)
  // ears: 1.5em wide, standing just above the top of "L"
  const earW = size * 1.5
  const earH = (earW * 92) / 140
  drawEars(ctx, x + eng + lean / 2 - earW / 2, base - cap - earH - size * 0.03, earW, dark ? C.cream : C.graphite)
}

const ITEMS: { id: string; title: string; w: number; h: number; draw: Draw }[] = [
  {
    id: 'englean-app-icon-cream',
    title: 'Иконка приложения — светлая',
    w: 1024,
    h: 1024,
    draw: (ctx, w, h, face) => {
      roundRect(ctx, w, h, w * 0.22, C.cream)
      const fh = h * 0.84
      const fw = (face.width / face.height) * fh
      ctx.drawImage(face, (w - fw) / 2, (h - fh) / 2 + h * 0.02, fw, fh)
    },
  },
  {
    id: 'englean-app-icon-plum',
    title: 'Иконка приложения — сливовая',
    w: 1024,
    h: 1024,
    draw: (ctx, w, h, face) => {
      roundRect(ctx, w, h, w * 0.22, C.plum)
      const fh = h * 0.78
      const fw = (face.width / face.height) * fh
      ctx.drawImage(face, (w - fw) / 2, (h - fh) / 2 + h * 0.02, fw, fh)
    },
  },
  {
    id: 'englean-app-icon-ears',
    title: 'Иконка — уши и EL',
    w: 1024,
    h: 1024,
    draw: (ctx, w, h) => {
      roundRect(ctx, w, h, w * 0.22, C.cream)
      const size = h * 0.5
      const e = measure(ctx, 'E', size).width
      const tw = e + measure(ctx, 'L', size).width
      const cap = measure(ctx, 'L', size).ascent
      const base = h * 0.84
      text(ctx, 'E', (w - tw) / 2, base, size, C.graphite)
      text(ctx, 'L', (w - tw) / 2 + e, base, size, C.plum)
      const earW = w * 0.6
      drawEars(ctx, (w - earW) / 2, base - cap - (earW * 92) / 140 - size * 0.03, earW)
    },
  },
  { id: 'englean-logo', title: 'Логотип — на светлом', w: 2000, h: 700, draw: (ctx, w, h) => (roundRect(ctx, w, h, 0, C.paper), drawWordmark(ctx, w, h, false)) },
  { id: 'englean-logo-dark', title: 'Логотип — на тёмном', w: 2000, h: 700, draw: (ctx, w, h) => (roundRect(ctx, w, h, 0, C.graphite), drawWordmark(ctx, w, h, true)) },
  { id: 'englean-logo-transparent', title: 'Логотип — прозрачный фон', w: 2000, h: 700, draw: (ctx, w, h) => drawWordmark(ctx, w, h, false) },
]

export function BrandPage() {
  const [ready, setReady] = useState(false)
  const face = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = new Image()
    img.src = neutral
    Promise.all([new Promise((r) => (img.onload = r)), document.fonts.load('600 100px Fraunces')]).then(() => {
      face.current = img
      setReady(true)
    })
  }, [])

  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <LeanLogo className="text-6xl" />
        <p className="max-w-md text-sm text-mute">Логотипы EngLean в PNG. Нажми «Скачать» под нужным вариантом.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ready && face.current && ITEMS.map((it) => <BrandItem key={it.id} item={it} face={face.current!} />)}
      </div>
    </section>
  )
}

function BrandItem({ item, face }: { item: (typeof ITEMS)[number]; face: HTMLImageElement }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, item.w, item.h)
    item.draw(ctx, item.w, item.h, face)
  }, [item, face])
  const download = () => {
    const a = document.createElement('a')
    a.href = ref.current!.toDataURL('image/png')
    a.download = `${item.id}.png`
    a.click()
  }
  return (
    <figure className="rounded-2xl border border-line bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-3">
      <canvas ref={ref} width={item.w} height={item.h} className="h-auto w-full" data-brand={item.id} />
      <figcaption className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
        <span>
          {item.title}
          <span className="block text-xs text-mute">
            {item.w}×{item.h}
          </span>
        </span>
        <button onClick={download} className="rounded-full bg-plum px-3 py-1.5 font-semibold text-paper">
          Скачать
        </button>
      </figcaption>
    </figure>
  )
}
