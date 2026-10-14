// Records every listening line (and "listen and write" texts) with Piper (LJSpeech voice, public domain).
// Speed depends on the level. Output: out/<sha256(text)>.mp3 + out/index.json (the list of recorded hashes).
// Upload: the files go to the public bucket tts-audio under rec/ (index.json last). The site plays
// rec/<sha256(text)>.mp3 before any other voice (see playRecorded in src/lib/supabase.ts).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
// lamejs's CommonJS build is broken under Node; its single-file build works in a plain context
const lameCtx = { console }
vm.createContext(lameCtx)
// Paths come from the environment: PIPER (piper.exe), PIPER_MODEL (en_US-ljspeech-high.onnx), LAMEJS (lame.all.js), ANON_KEY, OUT_DIR
vm.runInContext(fs.readFileSync(process.env.LAMEJS, 'utf8'), lameCtx)
const lamejs = lameCtx.lamejs
const PIPER = process.env.PIPER
const MODEL = process.env.PIPER_MODEL
const OUT = process.env.OUT_DIR ?? "audio-out"
const API = 'https://glmgczyiwmxquftztkdd.supabase.co/rest/v1'
const KEY = process.env.ANON_KEY

// length_scale: >1 slower, <1 faster
const SPEED = { A1: 1.05, A2: 1.0, B1: 0.95, B2: 0.92, C1: 0.88, C2: 0.86 }

const clean = (t) => t.trim().replace(/\s+/g, ' ')
const hash = (t) => crypto.createHash('sha256').update(clean(t)).digest('hex')

async function get(q) {
  const r = await fetch(`${API}/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

const items = []
for (const l of await get('lessons?select=cefr,lesson_materials(segments,body)&skill=eq.listening&status=eq.published&scope=eq.library')) {
  const m = l.lesson_materials
  if (!m) continue
  const segs = m.segments?.length ? m.segments.map((s) => s.text) : (m.body ?? '').split(/\n\s*\n/)
  for (const t of segs) if (clean(t)) items.push({ cefr: l.cefr, text: clean(t) })
}
for (const e of await get('exercises?select=data,lessons!inner(cefr,status,scope)&type=eq.listen&lessons.status=eq.published&lessons.scope=eq.library')) {
  if (e.data?.text) items.push({ cefr: e.lessons.cefr, text: clean(e.data.text) })
}

fs.mkdirSync(OUT, { recursive: true })
const done = new Map()
for (const it of items) {
  const h = hash(it.text)
  if (done.has(h)) continue
  const wav = path.join(OUT, `${h}.wav`)
  execFileSync(PIPER, ['--model', MODEL, '--length_scale', String(SPEED[it.cefr] ?? 1), '--sentence_silence', '0.3', '--output_file', wav], { input: it.text + '\n', stdio: ['pipe', 'ignore', 'ignore'] })
  // WAV (16-bit mono) → MP3 64 kbps
  const buf = fs.readFileSync(wav)
  const rate = buf.readUInt32LE(24)
  let off = 12
  while (buf.toString('ascii', off, off + 4) !== 'data') off += 8 + buf.readUInt32LE(off + 4)
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + off + 8, buf.readUInt32LE(off + 4) / 2)
  const enc = new lamejs.Mp3Encoder(1, rate, 64)
  const parts = []
  for (let i = 0; i < pcm.length; i += 1152) parts.push(Buffer.from(enc.encodeBuffer(pcm.subarray(i, i + 1152))))
  parts.push(Buffer.from(enc.flush()))
  fs.writeFileSync(path.join(OUT, `${h}.mp3`), Buffer.concat(parts))
  fs.unlinkSync(wav)
  done.set(h, { cefr: it.cefr, text: it.text })
  process.stdout.write('.')
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ voice: 'piper-ljspeech-high', hashes: [...done.keys()] }))
console.log(`\n${done.size} recordings, ${items.length} lines`)
