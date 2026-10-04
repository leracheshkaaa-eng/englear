// Cut Lean's poses out of the reference sheet with a transparent background.
// Usage (needs the sharp package): node extract-poses.js <output folder> [sheet]
// The background is a flat colour: it is removed by a flood fill from the edges of each box
// (so similar colours INSIDE the drawing stay), with soft edges and the background tint taken off.
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const OUT = process.argv[2]
const BG = [164, 152, 165]
const LO = 18 // closer than this to the background: fully transparent
const HI = 62 // farther than this: fully opaque (between: soft edge)
const PAD = 8

const POSES = {
  front: [44, 47, 406, 554],
  side: [425, 76, 795, 554],
  back: [817, 88, 1186, 565],
  neutral: [30, 592, 274, 835],
  sly: [289, 592, 517, 838],
  happy: [536, 578, 785, 829],
  surprised: [800, 584, 1039, 829],
  angry: [1059, 596, 1288, 838],
  lying: [17, 940, 469, 1129],
  curious: [529, 860, 786, 1139],
  ear: [796, 909, 907, 1137],
  tail: [940, 985, 1121, 1120],
  paw: [1172, 1022, 1263, 1120],
}

;(async () => {
  const { data: src, info } = await sharp(process.argv[3] || path.join(__dirname, 'lean-reference-sheet.webp')).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const SW = info.width
  fs.mkdirSync(OUT, { recursive: true })
  for (const [name, [x0, y0, x1, y1]] of Object.entries(POSES)) {
    const left = Math.max(0, x0 - PAD), top = Math.max(0, y0 - PAD)
    const W = Math.min(SW, x1 + PAD + 1) - left, H = Math.min(info.height, y1 + PAD + 1) - top
    const rgb = (x, y) => { const i = ((top + y) * SW + left + x) * 3; return [src[i], src[i + 1], src[i + 2]] }
    const dist = (p) => Math.hypot(p[0] - BG[0], p[1] - BG[1], p[2] - BG[2])
    // flood fill the background from the box edges through pixels near the background colour
    const bgRegion = new Uint8Array(W * H)
    const stack = []
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return
      const k = y * W + x
      if (bgRegion[k] || dist(rgb(x, y)) >= HI) return
      bgRegion[k] = 1
      stack.push(k)
    }
    for (let x = 0; x < W; x++) push(x, 0), push(x, H - 1)
    for (let y = 0; y < H; y++) push(0, y), push(W - 1, y)
    while (stack.length) {
      const k = stack.pop()
      const x = k % W, y = (k / W) | 0
      push(x + 1, y), push(x - 1, y), push(x, y + 1), push(x, y - 1)
    }
    const out = Buffer.alloc(W * H * 4)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x
        const p = rgb(x, y)
        let a = 1
        if (bgRegion[k]) a = Math.min(1, Math.max(0, (dist(p) - LO) / (HI - LO)))
        // take the background tint off semi-transparent edge pixels: c = (p - (1-a)·bg) / a
        const c = a > 0 && a < 1 ? p.map((v, i) => Math.round(Math.min(255, Math.max(0, (v - (1 - a) * BG[i]) / a)))) : p
        out[k * 4] = c[0]
        out[k * 4 + 1] = c[1]
        out[k * 4 + 2] = c[2]
        out[k * 4 + 3] = Math.round(a * 255)
      }
    // keep only the drawing itself: the biggest connected piece (drops labels, arrows, marks, swatches)
    const comp = new Int32Array(W * H).fill(-1)
    const sizes = []
    for (let k0 = 0; k0 < W * H; k0++) {
      if (out[k0 * 4 + 3] === 0 || comp[k0] >= 0) continue
      const id = sizes.length
      let n = 0
      const st = [k0]
      comp[k0] = id
      while (st.length) {
        const k = st.pop()
        n++
        const x = k % W, y = (k / W) | 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const j = ny * W + nx
            if (comp[j] < 0 && out[j * 4 + 3] > 0) { comp[j] = id; st.push(j) }
          }
      }
      sizes.push(n)
    }
    const main = sizes.indexOf(Math.max(...sizes))
    for (let k = 0; k < W * H; k++) if (comp[k] !== main) out[k * 4 + 3] = 0
    const file = path.join(OUT, `lean-${name}.png`)
    await sharp(out, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toFile(file)
    const meta = await sharp(file).metadata()
    console.log(name, `${meta.width}x${meta.height}`, Math.round(fs.statSync(file).size / 1024) + ' KB')
  }
})()
