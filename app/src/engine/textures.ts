/* ============================================================================
 * Procedural textures — drawn once into offscreen canvases, then read back
 * into Uint32Array pixel buffers for the ray loop. Zero external assets.
 * Each level owns a LevelTexSet (wall variants + floor + ceiling); sprite
 * textures are shared across levels.
 * ==========================================================================*/

export const TEX = 64

export interface PixTex {
  w: number
  h: number
  px: Uint32Array // 0xAABBGGRR (canvas ImageData order as uint32 LE)
}

export interface LevelTexSet {
  walls: PixTex[] // index = chunk.wallVar value
  floor: PixTex
  ceiling: PixTex
}

export interface SpriteTexSet {
  door: PixTex
  stairwell: PixTex
  almond: PixTex
  document: PixTex
  crate: PixTex
  silhouette: PixTex
  poster: PixTex
  steam: PixTex
  chairs: PixTex
  cooler: PixTex
  sign: PixTex
  chair: PixTex
  sadPoster: PixTex
  balloons: PixTex
  ptable: PixTex
  balloon: PixTex
  partier: PixTex
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  return [c, ctx]
}

function readTex(c: HTMLCanvasElement): PixTex {
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const px = new Uint32Array(img.data.buffer.slice(0))
  return { w: c.width, h: c.height, px }
}

/** tiny seeded rng so stains/blotches are identical every run */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function grain(ctx: CanvasRenderingContext2D, seed: number, amp: number, tintG = 1, tintB = 1) {
  const img = ctx.getImageData(0, 0, TEX, TEX)
  const d = img.data
  const r = rng(seed)
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp
    d[i] += n
    d[i + 1] += n * tintG
    d[i + 2] += n * tintB
  }
  ctx.putImageData(img, 0, 0)
}

function blotches(ctx: CanvasRenderingContext2D, seed: number, count: number, color: string, aMin: number, aMax: number, rMin: number, rMax: number) {
  const r = rng(seed)
  for (let i = 0; i < count; i++) {
    const cx = r() * TEX
    const cy = r() * TEX
    const rad = rMin + r() * (rMax - rMin)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
    g.addColorStop(0, color.replace('A', String(aMin + r() * (aMax - aMin))))
    g.addColorStop(1, color.replace('A', '0'))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ============================ LEVEL 0 — yellow rooms ===================== */

/** (1) base wallpaper: mustard stripes, stains, wainscot line */
function l0WallBase(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#B8A356'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#C9B464'
    ctx.fillRect(x, 0, 4, TEX)
  }
  ctx.fillStyle = 'rgba(90,78,30,0.16)'
  for (let x = 4; x < TEX; x += 8) ctx.fillRect(x, 0, 1, TEX)
  blotches(ctx, 1337, 10, 'rgba(72,62,26,A)', 0.1, 0.24, 4, 15)
  ctx.fillStyle = 'rgba(60,52,22,0.55)'
  ctx.fillRect(0, TEX - 13, TEX, 2)
  ctx.fillStyle = 'rgba(214,198,120,0.25)'
  ctx.fillRect(0, TEX - 11, TEX, 1)
  grain(ctx, 99, 10)
  return readTex(c)
}

/** (2) heavier damp-stain variant */
function l0WallDamp(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#A89248'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#B7A257'
    ctx.fillRect(x, 0, 4, TEX)
  }
  ctx.fillStyle = 'rgba(60,50,20,0.22)'
  for (let x = 4; x < TEX; x += 8) ctx.fillRect(x, 0, 1, TEX)
  blotches(ctx, 777, 16, 'rgba(48,40,14,A)', 0.16, 0.34, 5, 18)
  // water damage creeping up from the bottom
  const g = ctx.createLinearGradient(0, TEX - 26, 0, TEX)
  g.addColorStop(0, 'rgba(44,36,14,0)')
  g.addColorStop(1, 'rgba(44,36,14,0.5)')
  ctx.fillStyle = g
  ctx.fillRect(0, TEX - 26, TEX, 26)
  ctx.fillStyle = 'rgba(40,34,12,0.6)'
  ctx.fillRect(0, TEX - 13, TEX, 2)
  grain(ctx, 555, 12)
  return readTex(c)
}

/** (3) closed fake door — yellowish office door, no handle, never opens */
function l0WallFakeDoor(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  // wallpaper surround
  ctx.fillStyle = '#B8A356'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#C9B464'
    ctx.fillRect(x, 0, 4, TEX)
  }
  // door slab — slightly off-yellow, flat
  ctx.fillStyle = '#C4AF63'
  ctx.fillRect(10, 6, 44, 58)
  ctx.strokeStyle = '#8A7738'
  ctx.lineWidth = 2
  ctx.strokeRect(10, 6, 44, 58)
  ctx.strokeStyle = '#A08C45'
  ctx.lineWidth = 1
  ctx.strokeRect(16, 12, 32, 20)
  ctx.strokeRect(16, 36, 32, 22)
  // deliberately NO handle
  blotches(ctx, 31, 5, 'rgba(70,58,24,A)', 0.08, 0.16, 3, 9)
  grain(ctx, 32, 7)
  return readTex(c)
}

/** (4) metal elevator door — closed, hairline gap, faint scuffs */
function l0WallElevator(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  const g = ctx.createLinearGradient(0, 0, TEX, 0)
  g.addColorStop(0, '#8d8a80')
  g.addColorStop(0.5, '#a3a094')
  g.addColorStop(1, '#86837a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, TEX, TEX)
  // hairline center gap
  ctx.fillStyle = '#2c2b27'
  ctx.fillRect(31, 0, 2, TEX)
  // frame
  ctx.strokeStyle = '#5c5a52'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, TEX - 2, TEX - 2)
  // brushed streaks
  const r = rng(909)
  ctx.strokeStyle = 'rgba(70,68,60,0.25)'
  ctx.lineWidth = 1
  for (let i = 0; i < 10; i++) {
    const x = r() * TEX
    ctx.beginPath()
    ctx.moveTo(x, r() * 20)
    ctx.lineTo(x + (r() - 0.5) * 4, TEX - r() * 20)
    ctx.stroke()
  }
  blotches(ctx, 910, 6, 'rgba(40,38,32,A)', 0.1, 0.2, 3, 8)
  grain(ctx, 911, 6)
  return readTex(c)
}

/** (5) scratched-arrow graffiti — arrows that contradict each other */
function l0WallGraffiti(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#B8A356'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#C9B464'
    ctx.fillRect(x, 0, 4, TEX)
  }
  blotches(ctx, 1337, 6, 'rgba(72,62,26,A)', 0.08, 0.16, 4, 12)
  // scratched arrows — pale gouges pointing different ways
  const arrows: [number, number, number][] = [
    [18, 26, 0], // pointing right
    [44, 22, Math.PI], // pointing left — contradicting
    [30, 44, -Math.PI / 2.3], // pointing up-ish
  ]
  ctx.strokeStyle = 'rgba(232,224,190,0.75)'
  ctx.lineWidth = 1.4
  for (const [ax, ay, ang] of arrows) {
    ctx.save()
    ctx.translate(ax, ay)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.moveTo(-10, 0)
    ctx.lineTo(8, 0)
    ctx.moveTo(2, -5)
    ctx.lineTo(8, 0)
    ctx.lineTo(2, 5)
    ctx.stroke()
    ctx.restore()
  }
  // tally marks
  ctx.strokeStyle = 'rgba(60,50,22,0.6)'
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(48 + i * 2.5, 46)
    ctx.lineTo(48 + i * 2.5, 56)
    ctx.stroke()
  }
  grain(ctx, 99, 9)
  return readTex(c)
}

/** (6) whiteboard wall — conference room payoff, wording is exact */
function l0WallWhiteboard(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#B8A356'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#C9B464'
    ctx.fillRect(x, 0, 4, TEX)
  }
  // board
  ctx.fillStyle = '#e8e6dc'
  ctx.fillRect(6, 10, 52, 36)
  ctx.strokeStyle = '#7a756a'
  ctx.lineWidth = 2
  ctx.strokeRect(6, 10, 52, 36)
  // marker tray
  ctx.fillStyle = '#9a958a'
  ctx.fillRect(16, 46, 32, 3)
  // "SEE YOU SOON" in dark marker, two lines, slightly shaky
  ctx.fillStyle = '#33352e'
  ctx.font = 'bold 9px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.save()
  ctx.translate(32, 26)
  ctx.rotate(-0.02)
  ctx.fillText('SEE YOU', 0, 0)
  ctx.fillText('SOON', 1, 12)
  ctx.restore()
  // faint erased ghost text
  ctx.fillStyle = 'rgba(51,53,46,0.16)'
  ctx.fillText('SEE YOU', -1, 1)
  blotches(ctx, 44, 3, 'rgba(72,62,26,A)', 0.06, 0.12, 3, 7)
  grain(ctx, 45, 5)
  return readTex(c)
}

function l0Carpet(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#8A7A42'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 42, 34, 0.95, 0.7)
  blotches(ctx, 43, 5, 'rgba(42,36,16,A)', 0.18, 0.33, 5, 14)
  return readTex(c)
}

function l0Ceiling(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#cfc9b6'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 7, 12)
  ctx.fillStyle = '#8f8a76'
  ctx.fillRect(0, 0, TEX, 3)
  ctx.fillRect(0, 0, 3, TEX)
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fillRect(3, 3, TEX - 3, 1)
  ctx.fillRect(3, 3, 1, TEX - 3)
  return readTex(c)
}

/* ======================== LEVEL 1 — the dark warehouse =================== */

function l1WallConcrete(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#6b655c'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 201, 22, 0.98, 0.92)
  blotches(ctx, 202, 9, 'rgba(38,35,29,A)', 0.12, 0.26, 4, 14)
  blotches(ctx, 203, 4, 'rgba(120,114,100,A)', 0.06, 0.12, 3, 9)
  // a faded painted line
  ctx.fillStyle = 'rgba(150,138,80,0.28)'
  ctx.fillRect(0, 21, TEX, 3)
  ctx.fillStyle = 'rgba(30,28,23,0.35)'
  ctx.fillRect(0, 24, TEX, 1)
  // form-board seams
  ctx.fillStyle = 'rgba(40,37,31,0.4)'
  ctx.fillRect(0, 42, TEX, 1)
  ctx.fillRect(31, 0, 1, TEX)
  return readTex(c)
}

function l1WallStencil(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#6b655c'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 301, 20, 0.98, 0.92)
  blotches(ctx, 302, 7, 'rgba(38,35,29,A)', 0.1, 0.22, 4, 13)
  // stenciled bay number — worn paint
  ctx.fillStyle = 'rgba(210,205,185,0.8)'
  ctx.font = 'bold 22px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('B-07', 32, 36)
  // stencil wear: punch holes in the paint with concrete-colored flecks
  const r = rng(303)
  ctx.fillStyle = '#6b655c'
  for (let i = 0; i < 26; i++) {
    ctx.fillRect(12 + r() * 40, 16 + r() * 24, 1 + (r() * 2) | 0, 1 + (r() * 2) | 0)
  }
  ctx.fillStyle = 'rgba(30,28,23,0.35)'
  ctx.fillRect(0, 46, TEX, 1)
  return readTex(c)
}

function l1WallChainlink(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  // dark gap behind the mesh
  ctx.fillStyle = '#23211c'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 401, 16)
  // concrete posts at the edges
  ctx.fillStyle = '#615b51'
  ctx.fillRect(0, 0, 5, TEX)
  ctx.fillRect(TEX - 5, 0, 5, TEX)
  ctx.fillRect(0, 0, TEX, 4)
  // diamond mesh
  ctx.strokeStyle = 'rgba(150,146,134,0.75)'
  ctx.lineWidth = 1
  const step = 8
  for (let i = -TEX; i < TEX * 2; i += step) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + TEX, TEX)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(i + TEX, 0)
    ctx.lineTo(i, TEX)
    ctx.stroke()
  }
  // rust at the joints
  blotches(ctx, 402, 8, 'rgba(110,70,30,A)', 0.1, 0.22, 2, 5)
  return readTex(c)
}

function l1FloorConcrete(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#3f3d38'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 501, 20, 0.98, 0.95)
  // dust patches (lighter)
  blotches(ctx, 502, 5, 'rgba(120,116,104,A)', 0.1, 0.2, 6, 16)
  // faint tire marks
  ctx.strokeStyle = 'rgba(20,19,16,0.4)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(20, 70, 48, Math.PI * 1.1, Math.PI * 1.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(30, 72, 48, Math.PI * 1.1, Math.PI * 1.6)
  ctx.stroke()
  return readTex(c)
}

function l1Ceiling(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#232220'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 601, 14)
  // beam grid
  ctx.fillStyle = '#14130f'
  ctx.fillRect(0, 0, TEX, 4)
  ctx.fillRect(0, 0, 4, TEX)
  // hanging cable hint
  ctx.strokeStyle = 'rgba(10,9,7,0.8)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(40, 0)
  ctx.lineTo(43, TEX)
  ctx.stroke()
  return readTex(c)
}

/* ========================= LEVEL 2 — the steam pipes ===================== */

function pipeBands(ctx: CanvasRenderingContext2D) {
  // horizontal pipe runs with highlight/shadow
  const rows = [10, 30, 48]
  for (const y of rows) {
    ctx.fillStyle = '#3a4238'
    ctx.fillRect(0, y, TEX, 9)
    ctx.fillStyle = '#586250'
    ctx.fillRect(0, y + 1, TEX, 2)
    ctx.fillStyle = '#1d221b'
    ctx.fillRect(0, y + 7, TEX, 2)
    // flange bolts
    ctx.fillStyle = '#22271f'
    for (let x = 6; x < TEX; x += 16) {
      ctx.fillRect(x, y - 1, 2, 11)
    }
  }
}

function l2WallPipes(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#242a22'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 701, 16, 1, 0.9)
  pipeBands(ctx)
  // rust streaks running down from the pipes
  const r = rng(702)
  for (let i = 0; i < 8; i++) {
    const x = r() * TEX
    const y = [10, 30, 48][(r() * 3) | 0] + 9
    const len = 6 + r() * 14
    const g = ctx.createLinearGradient(x, y, x, y + len)
    g.addColorStop(0, 'rgba(120,52,26,0.4)')
    g.addColorStop(1, 'rgba(120,52,26,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, 2, len)
  }
  blotches(ctx, 703, 6, 'rgba(10,12,9,A)', 0.14, 0.3, 3, 10)
  return readTex(c)
}

function l2WallValve(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#242a22'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 801, 14, 1, 0.9)
  pipeBands(ctx)
  // valve wheels
  const wheels: [number, number, number][] = [
    [20, 34, 11],
    [46, 22, 8],
  ]
  for (const [wx, wy, wr] of wheels) {
    ctx.strokeStyle = '#7a2e22'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(wx, wy, wr, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 1.5
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI * 2 + 0.4
      ctx.beginPath()
      ctx.moveTo(wx, wy)
      ctx.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr)
      ctx.stroke()
    }
    ctx.fillStyle = '#4a1d16'
    ctx.beginPath()
    ctx.arc(wx, wy, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  blotches(ctx, 802, 5, 'rgba(10,12,9,A)', 0.12, 0.24, 3, 9)
  return readTex(c)
}

function l2WallWarning(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#2a2118'
  ctx.fillRect(0, 0, TEX, TEX)
  // diagonal deep-red / off-white hazard stripes
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 14, TEX, 36)
  ctx.clip()
  for (let i = -TEX; i < TEX * 2; i += 14) {
    ctx.fillStyle = '#8a2e22'
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + 7, 0)
    ctx.lineTo(i + 7 - 36, TEX)
    ctx.lineTo(i - 36, TEX)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#b9ad8e'
    ctx.beginPath()
    ctx.moveTo(i + 7, 0)
    ctx.lineTo(i + 14, 0)
    ctx.lineTo(i + 14 - 36, TEX)
    ctx.lineTo(i + 7 - 36, TEX)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  grain(ctx, 901, 12)
  // grime over the stripes
  blotches(ctx, 902, 8, 'rgba(10,10,8,A)', 0.14, 0.3, 3, 11)
  ctx.strokeStyle = 'rgba(20,16,12,0.7)'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 14, TEX, 36)
  return readTex(c)
}

function l2FloorGrate(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#1c1f1b'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 1001, 14, 1, 0.9)
  // grate bars
  ctx.fillStyle = '#101210'
  for (let y = 0; y < TEX; y += 6) ctx.fillRect(0, y, TEX, 2)
  ctx.fillStyle = 'rgba(70,78,66,0.35)'
  for (let y = 2; y < TEX; y += 6) ctx.fillRect(0, y, TEX, 1)
  // damp sheen
  blotches(ctx, 1002, 4, 'rgba(90,100,86,A)', 0.05, 0.1, 4, 10)
  return readTex(c)
}

function l2Ceiling(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#181a16'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 1101, 12)
  // cluttered pipe silhouette across the top
  ctx.fillStyle = '#0f110e'
  ctx.fillRect(0, 0, TEX, 6)
  ctx.fillRect(0, 12, TEX, 5)
  ctx.fillStyle = '#22271f'
  ctx.fillRect(0, 6, TEX, 1)
  ctx.fillRect(0, 17, TEX, 1)
  return readTex(c)
}

/* ===================== LEVEL FUN — the party that waits ================= */

/** brighter wallpaper with a painted bunting string along the top */
function lFunWallBase(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#C8B862'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#D9C873'
    ctx.fillRect(x, 0, 4, TEX)
  }
  ctx.fillStyle = 'rgba(100,88,34,0.14)'
  for (let x = 4; x < TEX; x += 8) ctx.fillRect(x, 0, 1, TEX)
  // bunting string
  ctx.strokeStyle = 'rgba(60,50,20,0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, 3)
  ctx.quadraticCurveTo(32, 7, 64, 3)
  ctx.stroke()
  const flags = ['#b85c6e', '#5e9e94', '#c9a227', '#7a6ea8']
  for (let i = 0; i < 8; i++) {
    const fx = i * 8 + 4
    const fy = 3.5 + Math.sin((i / 8) * Math.PI) * 3
    ctx.fillStyle = flags[i % flags.length]
    ctx.beginPath()
    ctx.moveTo(fx - 3, fy)
    ctx.lineTo(fx + 3, fy)
    ctx.lineTo(fx, fy + 8)
    ctx.closePath()
    ctx.fill()
  }
  blotches(ctx, 611, 7, 'rgba(80,68,28,A)', 0.08, 0.18, 4, 13)
  ctx.fillStyle = 'rgba(70,60,26,0.5)'
  ctx.fillRect(0, TEX - 13, TEX, 2)
  grain(ctx, 612, 9)
  return readTex(c)
}

/** wallpaper with crude crayon =) faces, all the same, all watching */
function lFunWallFaces(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#C8B862'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#D9C873'
    ctx.fillRect(x, 0, 4, TEX)
  }
  blotches(ctx, 611, 4, 'rgba(80,68,28,A)', 0.06, 0.14, 4, 12)
  const faces: [number, number, number][] = [
    [20, 24, 8],
    [46, 42, 7],
    [44, 16, 4.5],
  ]
  ctx.strokeStyle = 'rgba(42,36,16,0.85)'
  ctx.lineWidth = 1.6
  for (const [fx, fy, fr] of faces) {
    ctx.beginPath()
    ctx.arc(fx, fy, fr, 0, Math.PI * 2)
    ctx.stroke()
    // eyes
    ctx.beginPath()
    ctx.moveTo(fx - fr * 0.42, fy - fr * 0.3)
    ctx.lineTo(fx - fr * 0.42, fy - fr * 0.02)
    ctx.moveTo(fx + fr * 0.42, fy - fr * 0.3)
    ctx.lineTo(fx + fr * 0.42, fy - fr * 0.02)
    ctx.stroke()
    // smile
    ctx.beginPath()
    ctx.arc(fx, fy + fr * 0.12, fr * 0.52, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }
  grain(ctx, 613, 8)
  return readTex(c)
}

/** streamers and a shaky crayon scrawl — the handwriting of the invitations */
function lFunWallStreamers(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#C8B862'
  ctx.fillRect(0, 0, TEX, TEX)
  for (let x = 0; x < TEX; x += 8) {
    ctx.fillStyle = '#D9C873'
    ctx.fillRect(x, 0, 4, TEX)
  }
  // diagonal streamers
  const streamers = ['rgba(184,92,110,0.55)', 'rgba(94,158,148,0.55)', 'rgba(201,162,39,0.5)']
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = streamers[i]
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-10, 14 + i * 20)
    ctx.lineTo(TEX + 10, 2 + i * 20)
    ctx.stroke()
  }
  blotches(ctx, 614, 4, 'rgba(80,68,28,A)', 0.06, 0.14, 4, 11)
  // shaky crayon text
  ctx.fillStyle = 'rgba(58,40,60,0.9)'
  ctx.font = 'bold 8px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.save()
  ctx.translate(32, 46)
  ctx.rotate(-0.03)
  ctx.fillText('HAPPY BIRTHDAY', 0, 0)
  ctx.restore()
  ctx.fillStyle = 'rgba(58,40,60,0.4)'
  ctx.fillText('HAPPY BIRTHDAY', 1, 47)
  grain(ctx, 615, 8)
  return readTex(c)
}

/** brighter carpet littered with confetti */
function lFunCarpet(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#9a8a4c'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 716, 26, 0.98, 0.8)
  const confetti = ['#b85c6e', '#5e9e94', '#c9a227', '#7a6ea8', '#d8d2b8']
  const r = rng(717)
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = confetti[(r() * confetti.length) | 0]
    ctx.globalAlpha = 0.5 + r() * 0.4
    ctx.fillRect(r() * TEX, r() * TEX, 1 + ((r() * 2) | 0), 1)
  }
  ctx.globalAlpha = 1
  blotches(ctx, 718, 3, 'rgba(48,42,18,A)', 0.12, 0.22, 5, 13)
  return readTex(c)
}

/** brighter ceiling tile so the tinted panels read */
function lFunCeiling(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#ddd6be'
  ctx.fillRect(0, 0, TEX, TEX)
  grain(ctx, 816, 10)
  ctx.fillStyle = '#9a947e'
  ctx.fillRect(0, 0, TEX, 3)
  ctx.fillRect(0, 0, 3, TEX)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(3, 3, TEX - 3, 1)
  ctx.fillRect(3, 3, 1, TEX - 3)
  return readTex(c)
}

/* ============================== SPRITES (shared) ======================== */

function doorTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.fillStyle = '#9d9d9d'
  ctx.fillRect(8, 2, 48, 60)
  ctx.strokeStyle = '#6f6f6f'
  ctx.lineWidth = 2
  ctx.strokeRect(8, 2, 48, 60)
  ctx.strokeStyle = '#858585'
  ctx.lineWidth = 1
  ctx.strokeRect(14, 8, 36, 22)
  ctx.strokeRect(14, 34, 36, 22)
  ctx.fillStyle = '#d8d8d8'
  ctx.beginPath()
  ctx.arc(46, 33, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#777'
  ctx.stroke()
  return readTex(c)
}

/** stairwell — dark doorway with descending steps and a cool glow */
function stairwellTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  // cool glow halo
  const halo = ctx.createRadialGradient(32, 24, 2, 32, 24, 30)
  halo.addColorStop(0, 'rgba(150,175,210,0.5)')
  halo.addColorStop(1, 'rgba(150,175,210,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, TEX, TEX)
  // dark portal
  ctx.fillStyle = '#0c0e14'
  ctx.fillRect(12, 4, 40, 58)
  // descending steps — lighter trapezoids receding downward
  for (let i = 0; i < 5; i++) {
    const t = i / 5
    const y = 16 + i * 9
    const inset = 4 + t * 10
    const shade = Math.floor(60 - t * 42)
    ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 12})`
    ctx.beginPath()
    ctx.moveTo(12 + inset, y)
    ctx.lineTo(52 - inset, y)
    ctx.lineTo(52 - inset - 3, y + 7)
    ctx.lineTo(12 + inset + 3, y + 7)
    ctx.closePath()
    ctx.fill()
  }
  // frame
  ctx.strokeStyle = '#3a3f4c'
  ctx.lineWidth = 2
  ctx.strokeRect(12, 4, 40, 58)
  return readTex(c)
}

function almondTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  const g = ctx.createRadialGradient(32, 36, 2, 32, 36, 26)
  g.addColorStop(0, 'rgba(255,255,245,0.5)')
  g.addColorStop(1, 'rgba(255,255,245,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, TEX, TEX)
  ctx.fillStyle = '#f3f1e8'
  ctx.beginPath()
  ctx.moveTo(26, 18)
  ctx.lineTo(26, 24)
  ctx.quadraticCurveTo(22, 28, 22, 32)
  ctx.lineTo(22, 52)
  ctx.quadraticCurveTo(22, 56, 26, 56)
  ctx.lineTo(38, 56)
  ctx.quadraticCurveTo(42, 56, 42, 52)
  ctx.lineTo(42, 32)
  ctx.quadraticCurveTo(42, 28, 38, 24)
  ctx.lineTo(38, 18)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(26, 12, 12, 7)
  ctx.fillStyle = '#d9d6c8'
  ctx.fillRect(26, 18, 12, 1)
  ctx.fillStyle = '#e4e1d2'
  ctx.fillRect(24, 36, 16, 12)
  ctx.fillStyle = '#a89a6a'
  ctx.fillRect(26, 39, 12, 1)
  ctx.fillRect(26, 42, 9, 1)
  ctx.fillRect(26, 45, 11, 1)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(25, 28, 2, 22)
  return readTex(c)
}

function documentTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  const g = ctx.createRadialGradient(32, 34, 2, 32, 34, 30)
  g.addColorStop(0, 'rgba(255,250,220,0.55)')
  g.addColorStop(1, 'rgba(255,250,220,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, TEX, TEX)
  ctx.save()
  ctx.translate(32, 34)
  ctx.rotate(-0.14)
  ctx.fillStyle = '#efe9d4'
  ctx.fillRect(-13, -16, 26, 32)
  ctx.strokeStyle = '#b9af8e'
  ctx.lineWidth = 1
  ctx.strokeRect(-13, -16, 26, 32)
  ctx.fillStyle = '#7d7357'
  for (let i = 0; i < 6; i++) ctx.fillRect(-9, -10 + i * 5, 18, 1)
  ctx.fillStyle = '#9c2f2f'
  ctx.fillRect(-9, 12, 8, 2)
  ctx.restore()
  return readTex(c)
}

/** wooden supply crate */
function crateTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(32, 57, 20, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  // crate body
  ctx.fillStyle = '#8a6a3a'
  ctx.fillRect(14, 22, 36, 34)
  // planks
  ctx.strokeStyle = '#5e4522'
  ctx.lineWidth = 1.5
  for (let y = 30; y < 56; y += 8) {
    ctx.beginPath()
    ctx.moveTo(14, y)
    ctx.lineTo(50, y)
    ctx.stroke()
  }
  // cross braces
  ctx.strokeStyle = '#6e5230'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(15, 23)
  ctx.lineTo(49, 55)
  ctx.moveTo(49, 23)
  ctx.lineTo(15, 55)
  ctx.stroke()
  // frame
  ctx.strokeStyle = '#4a3619'
  ctx.lineWidth = 2
  ctx.strokeRect(14, 22, 36, 34)
  // nails
  ctx.fillStyle = '#2e2210'
  for (const [nx, ny] of [
    [17, 25],
    [47, 25],
    [17, 53],
    [47, 53],
  ]) {
    ctx.beginPath()
    ctx.arc(nx, ny, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }
  // top highlight
  ctx.fillStyle = 'rgba(190,160,110,0.35)'
  ctx.fillRect(15, 23, 34, 3)
  return readTex(c)
}

function silhouetteTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  const g = ctx.createLinearGradient(0, 8, 0, TEX)
  g.addColorStop(0, 'rgba(6,6,7,0.05)')
  g.addColorStop(0.25, 'rgba(4,4,5,0.92)')
  g.addColorStop(1, 'rgba(4,4,5,0.65)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(32, 10)
  ctx.bezierCurveTo(24, 10, 23, 20, 25, 24)
  ctx.bezierCurveTo(20, 28, 19, 40, 21, 58)
  ctx.lineTo(27, 62)
  ctx.lineTo(30, 44)
  ctx.lineTo(34, 44)
  ctx.lineTo(37, 62)
  ctx.lineTo(43, 58)
  ctx.bezierCurveTo(45, 40, 44, 28, 39, 24)
  ctx.bezierCurveTo(41, 20, 40, 10, 32, 10)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(4,4,5,0.25)'
  ctx.lineWidth = 2
  ctx.stroke()
  return readTex(c)
}

function posterTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#d8c84f'
  ctx.fillRect(0, 0, TEX, TEX)
  ctx.fillStyle = '#c3b23f'
  ctx.fillRect(0, 0, TEX, 6)
  ctx.fillRect(0, TEX - 6, TEX, 6)
  ctx.fillStyle = '#1c1a10'
  ctx.font = 'bold 30px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('=)', 32, 28)
  ctx.font = 'bold 9px ui-monospace, monospace'
  ctx.fillText('PARTY AT', 32, 44)
  ctx.fillText('LEVEL FUN', 32, 54)
  blotches(ctx, 555, 4, 'rgba(60,50,15,A)', 0.12, 0.25, 4, 14)
  return readTex(c)
}

/** steam plume — white puffs, animated by scale/alpha at draw time */
function steamTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  const r = rng(1234)
  for (let i = 0; i < 6; i++) {
    const cx = 22 + r() * 20
    const cy = 14 + r() * 36
    const rad = 8 + r() * 10
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
    g.addColorStop(0, `rgba(235,235,230,${0.4 + r() * 0.3})`)
    g.addColorStop(1, 'rgba(235,235,230,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  return readTex(c)
}

/** stack of office chairs (Level 0 set dressing) */
function chairsTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(32, 58, 16, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  // three stacked chair silhouettes, dark blue-grey
  for (let i = 0; i < 3; i++) {
    const y = 44 - i * 13
    ctx.fillStyle = ['#3c4250', '#454c5c', '#505868'][i]
    // seat
    ctx.fillRect(20, y, 24, 4)
    // backrest
    ctx.fillRect(20, y - 10, 4, 14)
    // legs
    ctx.fillRect(22, y + 4, 2, 8)
    ctx.fillRect(40, y + 4, 2, 8)
  }
  ctx.strokeStyle = 'rgba(20,22,28,0.8)'
  ctx.lineWidth = 1
  ctx.strokeRect(20, 4, 24, 52)
  return readTex(c)
}

/** water cooler */
function coolerTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(32, 58, 12, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // dispenser body
  ctx.fillStyle = '#d8d6cc'
  ctx.fillRect(24, 30, 16, 28)
  ctx.fillStyle = '#c2c0b6'
  ctx.fillRect(24, 30, 16, 3)
  // bottle — desaturated blue
  ctx.fillStyle = 'rgba(150,170,190,0.85)'
  ctx.beginPath()
  ctx.moveTo(28, 30)
  ctx.lineTo(28, 14)
  ctx.quadraticCurveTo(28, 8, 32, 8)
  ctx.quadraticCurveTo(36, 8, 36, 14)
  ctx.lineTo(36, 30)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(120,145,170,0.6)'
  ctx.fillRect(28, 20, 8, 10)
  // taps
  ctx.fillStyle = '#a33'
  ctx.fillRect(27, 36, 3, 2)
  ctx.fillStyle = '#36a'
  ctx.fillRect(34, 36, 3, 2)
  return readTex(c)
}

/** fallen wet-floor sign */
function signTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(34, 54, 16, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  // fallen A-frame, lying at an angle
  ctx.save()
  ctx.translate(32, 40)
  ctx.rotate(0.5)
  ctx.fillStyle = '#c9a227'
  ctx.beginPath()
  ctx.moveTo(-6, -14)
  ctx.lineTo(6, -14)
  ctx.lineTo(12, 14)
  ctx.lineTo(-12, 14)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#7a621a'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#3a2f0d'
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('!', 0, 6)
  ctx.restore()
  return readTex(c)
}

/** single office chair (conference room rows) */
function chairTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(32, 56, 12, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#454c5c'
  // backrest
  ctx.fillRect(24, 16, 16, 22)
  ctx.fillStyle = '#505868'
  // seat
  ctx.fillRect(22, 38, 20, 5)
  // legs
  ctx.fillStyle = '#333844'
  ctx.fillRect(25, 43, 3, 12)
  ctx.fillRect(36, 43, 3, 12)
  ctx.fillStyle = '#3c4250'
  ctx.fillRect(24, 16, 16, 3)
  return readTex(c)
}

/** =( — the only honest object on Level Fun. walk into it to leave. */
function sadPosterTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.fillStyle = '#b4af9f'
  ctx.fillRect(0, 0, TEX, TEX)
  ctx.fillStyle = '#9d988a'
  ctx.fillRect(0, 0, TEX, 6)
  ctx.fillRect(0, TEX - 6, TEX, 6)
  ctx.fillStyle = '#25220f'
  ctx.font = 'bold 30px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('=(', 32, 30)
  ctx.font = 'bold 8px ui-monospace, monospace'
  ctx.fillText('SORRY YOU', 32, 46)
  ctx.fillText('HAVE TO GO', 32, 55)
  blotches(ctx, 556, 4, 'rgba(50,44,20,A)', 0.1, 0.2, 4, 12)
  grain(ctx, 557, 5)
  return readTex(c)
}

/** balloon cluster — three balloons, strings converging to the floor */
function balloonsTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(32, 60, 12, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  const balloons: [number, number, number, string][] = [
    [22, 18, 9, '#b85c6e'],
    [40, 14, 10, '#5e9e94'],
    [33, 26, 8, '#c9a227'],
  ]
  // strings
  ctx.strokeStyle = 'rgba(230,225,205,0.6)'
  ctx.lineWidth = 0.8
  for (const [bx, by, br] of balloons) {
    ctx.beginPath()
    ctx.moveTo(bx, by + br)
    ctx.quadraticCurveTo(bx + (32 - bx) * 0.5, (by + 58) / 2, 32, 58)
    ctx.stroke()
  }
  for (const [bx, by, br, col] of balloons) {
    const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 1, bx, by, br)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(20,18,10,0.9)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(bx, by, br * 0.85, br, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    ctx.ellipse(bx - br * 0.3, by - br * 0.35, br * 0.18, br * 0.3, -0.4, 0, Math.PI * 2)
    ctx.fill()
    // knot
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(bx - 1.5, by + br)
    ctx.lineTo(bx + 1.5, by + br)
    ctx.lineTo(bx, by + br + 2.5)
    ctx.closePath()
    ctx.fill()
  }
  return readTex(c)
}

/** party table — cloth, two-tier cake, three candles. do not eat it. */
function partyTableTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(32, 58, 24, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  // tablecloth
  ctx.fillStyle = '#c8bdb0'
  ctx.fillRect(8, 34, 48, 20)
  ctx.fillStyle = '#b3a89a'
  for (let x = 8; x < 56; x += 6) ctx.fillRect(x, 50, 3, 4)
  ctx.fillStyle = 'rgba(120,90,90,0.4)'
  ctx.fillRect(8, 34, 48, 2)
  // cake — two tiers
  ctx.fillStyle = '#e8ddc8'
  ctx.fillRect(22, 24, 20, 10)
  ctx.fillRect(25, 16, 14, 8)
  // frosting drips
  ctx.fillStyle = '#c98a9a'
  ctx.fillRect(22, 24, 20, 2)
  ctx.fillRect(25, 16, 14, 2)
  for (const dx of [24, 30, 37]) ctx.fillRect(dx, 26, 2, 3)
  // candles (unlit — the lights here do not hum)
  ctx.fillStyle = '#5e9e94'
  for (const dx of [28, 31.5, 35]) ctx.fillRect(dx, 11, 1.5, 5)
  // paper plate
  ctx.fillStyle = '#d8d2c0'
  ctx.beginPath()
  ctx.ellipse(47, 42, 6, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()
  return readTex(c)
}

/** a single balloon adrift — floats near the ceiling, no string held */
function balloonTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  const g = ctx.createRadialGradient(28, 20, 1, 32, 24, 13)
  g.addColorStop(0, '#b85c6e')
  g.addColorStop(1, 'rgba(20,12,14,0.92)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(32, 24, 11, 13, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath()
  ctx.ellipse(27, 18, 2.5, 4, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8a4654'
  ctx.beginPath()
  ctx.moveTo(30.5, 37)
  ctx.lineTo(33.5, 37)
  ctx.lineTo(32, 40)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(225,220,200,0.5)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(32, 40)
  ctx.quadraticCurveTo(34, 48, 31, 58)
  ctx.stroke()
  return readTex(c)
}

/** partygoer — round-headed, upright, watching. never approaches. */
function partierTexture(): PixTex {
  const [c, ctx] = makeCanvas(TEX, TEX)
  ctx.clearRect(0, 0, TEX, TEX)
  const g = ctx.createLinearGradient(0, 6, 0, TEX)
  g.addColorStop(0, 'rgba(208,196,140,0.06)')
  g.addColorStop(0.3, 'rgba(196,184,128,0.85)')
  g.addColorStop(1, 'rgba(150,140,92,0.55)')
  ctx.fillStyle = g
  // round head
  ctx.beginPath()
  ctx.arc(32, 16, 8, 0, Math.PI * 2)
  ctx.fill()
  // narrow body
  ctx.beginPath()
  ctx.moveTo(26, 24)
  ctx.quadraticCurveTo(24, 40, 26, 60)
  ctx.lineTo(38, 60)
  ctx.quadraticCurveTo(40, 40, 38, 24)
  ctx.closePath()
  ctx.fill()
  // the faintest =)
  ctx.strokeStyle = 'rgba(20,18,8,0.4)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(29, 14)
  ctx.lineTo(29, 16.5)
  ctx.moveTo(35, 14)
  ctx.lineTo(35, 16.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(32, 18, 2.6, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  return readTex(c)
}

/* ============================== set builders =========================== */

export function buildLevel0Set(): LevelTexSet {
  return {
    walls: [l0WallBase(), l0WallDamp(), l0WallFakeDoor(), l0WallElevator(), l0WallGraffiti(), l0WallWhiteboard()],
    floor: l0Carpet(),
    ceiling: l0Ceiling(),
  }
}

export function buildLevel1Set(): LevelTexSet {
  return {
    walls: [l1WallConcrete(), l1WallStencil(), l1WallChainlink()],
    floor: l1FloorConcrete(),
    ceiling: l1Ceiling(),
  }
}

export function buildLevel2Set(): LevelTexSet {
  return {
    walls: [l2WallPipes(), l2WallValve(), l2WallWarning()],
    floor: l2FloorGrate(),
    ceiling: l2Ceiling(),
  }
}

export function buildLevelFunSet(): LevelTexSet {
  return {
    walls: [lFunWallBase(), lFunWallFaces(), lFunWallStreamers()],
    floor: lFunCarpet(),
    ceiling: lFunCeiling(),
  }
}

export function buildSpriteTextures(): SpriteTexSet {
  return {
    door: doorTexture(),
    stairwell: stairwellTexture(),
    almond: almondTexture(),
    document: documentTexture(),
    crate: crateTexture(),
    silhouette: silhouetteTexture(),
    poster: posterTexture(),
    steam: steamTexture(),
    chairs: chairsTexture(),
    cooler: coolerTexture(),
    sign: signTexture(),
    chair: chairTexture(),
    sadPoster: sadPosterTexture(),
    balloons: balloonsTexture(),
    ptable: partyTableTexture(),
    balloon: balloonTexture(),
    partier: partierTexture(),
  }
}
