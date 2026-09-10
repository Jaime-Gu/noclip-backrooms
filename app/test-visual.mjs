import puppeteer from 'puppeteer-core'
const DIST = '/mnt/agents/output/app/dist/index.html'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--window-size=1280,720'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
await page.goto(`file://${DIST}?debug#/level`, { waitUntil: 'networkidle0' })
await sleep(2000)

// --- photosafety: measure max per-frame luminance delta on Level 0 ---
const flashL0 = await page.evaluate(async () => {
  const e = window.__meg
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const ctx = e.canvas.getContext('2d')
  let prev = null
  let maxDelta = 0
  let maxLum = 0
  for (let i = 0; i < 90; i++) {
    await sleep(33) // ~30fps sampling
    const img = ctx.getImageData(0, 0, e.canvas.width, e.canvas.height).data
    let sum = 0
    for (let p = 0; p < img.length; p += 4 * 13) sum += 0.299 * img[p] + 0.587 * img[p + 1] + 0.114 * img[p + 2]
    const lum = sum / (img.length / (4 * 13)) / 255
    if (prev !== null) maxDelta = Math.max(maxDelta, Math.abs(lum - prev))
    maxLum = Math.max(maxLum, lum)
    prev = lum
  }
  return { maxDelta, maxLum }
})
console.log('L0 photosafety: max frame-to-frame luminance delta =', flashL0.maxDelta.toFixed(4), 'max lum =', flashL0.maxLum.toFixed(3))

// --- enter party ---
await page.evaluate(() => {
  const e = window.__meg
  e.transientSprites.push({
    kind: 'poster', x: e.posX + e.dirX * 0.7, y: e.posY + e.dirY * 0.7,
    scale: 0.62, floor: false, alive: true, vx: 0, vy: 0, ttl: -1, born: 0,
  })
})
await sleep(4000)
console.log('theme:', await page.evaluate(() => window.__meg?.theme?.id))

// photosafety on party (includes hue drift + ceiling tint + balloons)
const flashParty = await page.evaluate(async () => {
  const e = window.__meg
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const ctx = e.canvas.getContext('2d')
  let prev = null
  let maxDelta = 0
  for (let i = 0; i < 90; i++) {
    await sleep(33)
    const img = ctx.getImageData(0, 0, e.canvas.width, e.canvas.height).data
    let sum = 0
    for (let p = 0; p < img.length; p += 4 * 13) sum += 0.299 * img[p] + 0.587 * img[p + 1] + 0.114 * img[p + 2]
    const lum = sum / (img.length / (4 * 13)) / 255
    if (prev !== null) maxDelta = Math.max(maxDelta, Math.abs(lum - prev))
    prev = lum
  }
  return { maxDelta }
})
console.log('Party photosafety: max frame-to-frame luminance delta =', flashParty.maxDelta.toFixed(4))

// --- screenshots: wander the party a bit and shoot ---
async function shot(name) {
  const buf = await page.evaluate(() => {
    const e = window.__meg
    return e.canvas.toDataURL('image/png')
  })
  const b64 = buf.split(',')[1]
  const fs = await import('fs')
  fs.writeFileSync(`/mnt/agents/output/app/${name}`, Buffer.from(b64, 'base64'))
}

// look around: rotate and capture 4 views
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    const e = window.__meg
    // rotate ~90°
    const ang = Math.PI / 2
    const c = Math.cos(ang), s = Math.sin(ang)
    const ndx = e.dirX * c - e.dirY * s
    const ndy = e.dirX * s + e.dirY * c
    e.dirX = ndx; e.dirY = ndy
    const npx = e.planeX * c - e.planeY * s
    const npy = e.planeX * s + e.planeY * c
    e.planeX = npx; e.planeY = npy
  })
  await sleep(300)
  await shot(`party-view-${i}.png`)
}

// walk forward into the party to find set dressing
await page.evaluate(async () => {
  const e = window.__meg
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // press W via keys set
  e.keys.add('w')
  await sleep(4500)
  e.keys.delete('w')
})
await sleep(300)
await shot('party-walk.png')

// count visible party set dressing in nearby chunks
const dressing = await page.evaluate(() => {
  const e = window.__meg
  const chunkKey = (cx, cy) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0
  const counts = {}
  const pcx = Math.floor(e.posX / 16), pcy = Math.floor(e.posY / 16)
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -3; dy <= 3; dy++) {
      e.getChunk(pcx + dx, pcy + dy)
      for (const s of e.chunkSprites.get(chunkKey(pcx + dx, pcy + dy)) || []) {
        counts[s.kind] = (counts[s.kind] || 0) + 1
      }
    }
  return counts
})
console.log('party dressing around player:', JSON.stringify(dressing))

await browser.close()
