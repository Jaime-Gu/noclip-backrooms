/* NOCLIP v3 verification — drives the single-file build via file:// */
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'fs'

const DIST = '/mnt/agents/output/app/dist/index.html'
const URL = `file://${DIST}?debug`
const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader', '--window-size=1280,720'],
})

// helper injected into pages: find a sprite kind within the eviction-safe window
// (rings <= 3 = 49 chunks, inside the 4-chunk keep radius), teleport onto it,
// RE-FETCH it after regeneration, then wait for a target engine state.
const FIND_AND_TRIGGER = async (kind, maxWait = 3000) => {
  const e = window.__meg
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const chunkKey = (cx, cy) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0
  const find = () => {
    for (let ring = 0; ring <= 3; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
          e.getChunk(dx, dy)
          const s = e.chunkSprites.get(chunkKey(dx, dy))?.find((x) => x.kind === kind && x.alive)
          if (s) return s
        }
      }
    }
    return null
  }
  let s = find()
  if (!s) return 'not-found'
  // teleport next to it, facing it
  const ddx = s.x - e.posX
  const ddy = s.y - e.posY
  const len = Math.hypot(ddx, ddy) || 1
  e.posX = s.x - (ddx / len) * 0.55
  e.posY = s.y - (ddy / len) * 0.55
  e.dirX = ddx / len
  e.dirY = ddy / len
  // re-fetch after any regeneration, and keep re-fetching while waiting
  const t0 = Date.now()
  while (Date.now() - t0 < maxWait) {
    await sleep(40)
    if (e.state !== 'play') return e.state
    s = find()
    if (s) {
      const d2 = s.x - e.posX
      const d3 = s.y - e.posY
      const l2 = Math.hypot(d2, d3) || 1
      e.posX = s.x - (d2 / l2) * 0.55
      e.posY = s.y - (d3 / l2) * 0.55
      e.dirX = d2 / l2
      e.dirY = d3 / l2
    }
  }
  return e.state
}

async function newPage(reduced = false) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  page.on('pageerror', (e) => log('PAGEERROR:', e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') log('CONSOLE-ERR:', m.text())
  })
  return { page, requests }
}

/* ---------------- 1. boot + single-file integrity ---------------- */
{
  const { page, requests } = await newPage()
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(800)
  const external = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'))
  check('single-file: zero external requests', external.length === 0, external.join(','))
  const title = await page.title()
  check('corporate page boots', title.includes('Meridian'), title)
  await page.close()
}

/* ---------------- 2. full loop: corporate -> fall -> Level 0 ---------------- */
{
  const { page } = await newPage()
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(500)

  const fax = await page.evaluateHandle(() => {
    const els = [...document.querySelectorAll('a,button,div,span')]
    return els.find((e) => /414/.test(e.textContent || '') && e.getAttribute('href')?.includes('tel'))
  })
  const faxEl = fax.asElement()
  if (faxEl) await faxEl.click()
  else await page.evaluate(() => (location.hash = '#/fall'))
  await sleep(7500) // full fall sequence is ~6s
  const onLevel = await page.evaluate(() => location.hash.includes('/level'))
  check('fall leads to the wander', onLevel, await page.evaluate(() => location.hash))

  await sleep(1500)
  const eng = await page.evaluate(() => {
    const e = window.__meg
    if (!e) return null
    return { state: e.state, w: e.canvas.width, h: e.canvas.height }
  })
  check('engine mounted on Level 0', !!eng, JSON.stringify(eng))

  const fps = await page.evaluate(async () => {
    const t0 = performance.now()
    let frames = 0
    await new Promise((res) => {
      const step = () => {
        frames++
        if (performance.now() - t0 < 2000) requestAnimationFrame(step)
        else res()
      }
      requestAnimationFrame(step)
    })
    return frames / 2
  })
  check('Level 0 runs >= 55fps', fps >= 55, `${fps.toFixed(1)} fps`)

  const stats = await page.evaluate(() => {
    const e = window.__meg
    const ctx = e.canvas.getContext('2d')
    const img = ctx.getImageData(0, 0, e.canvas.width, e.canvas.height).data
    let sum = 0
    let nonblack = 0
    for (let i = 0; i < img.length; i += 4 * 97) {
      const v = img[i] + img[i + 1] + img[i + 2]
      sum += v
      if (v > 30) nonblack++
    }
    return { avg: sum / (img.length / (4 * 97)) / 3, nonblack }
  })
  check('Level 0 frame is lit', stats.avg > 40, `avg=${stats.avg.toFixed(0)} nonblack=${stats.nonblack}`)
  await page.close()
}

/* ---------------- 3. poster warp -> Level Fun -> sad poster exit ---------------- */
{
  const { page } = await newPage()
  await page.goto(`${URL}#/level`, { waitUntil: 'networkidle0' })
  await sleep(2500)

  const warped = await page.evaluate(async () => {
    const e = window.__meg
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    e.transientSprites.push({
      kind: 'poster', x: e.posX + e.dirX * 0.7, y: e.posY + e.dirY * 0.7,
      scale: 0.62, floor: false, alive: true, vx: 0, vy: 0, ttl: -1, born: 0,
    })
    const t0 = Date.now()
    while (Date.now() - t0 < 3000) {
      await sleep(50)
      if (e.state === 'warping') return true
    }
    return false
  })
  check('=) poster triggers party warp', warped)

  await sleep(3500)
  const onParty = await page.evaluate(() => ({
    label: document.body.textContent.includes('LEVEL FUN'),
    theme: window.__meg?.theme?.id,
  }))
  check('Level Fun mounts (theme id 3)', onParty.theme === 3, JSON.stringify(onParty))
  check('HUD shows LEVEL FUN label', onParty.label)

  const pstats = await page.evaluate(() => {
    const e = window.__meg
    const ctx = e.canvas.getContext('2d')
    const img = ctx.getImageData(0, 0, e.canvas.width, e.canvas.height).data
    let sum = 0
    for (let i = 0; i < img.length; i += 4 * 97) sum += img[i] + img[i + 1] + img[i + 2]
    return sum / (img.length / (4 * 97)) / 3
  })
  check('Level Fun frame is lit', pstats > 40, `avg=${pstats.toFixed(0)}`)

  const pfps = await page.evaluate(async () => {
    const t0 = performance.now()
    let frames = 0
    await new Promise((res) => {
      const step = () => {
        frames++
        if (performance.now() - t0 < 2000) requestAnimationFrame(step)
        else res()
      }
      requestAnimationFrame(step)
    })
    return frames / 2
  })
  check('Level Fun runs >= 55fps', pfps >= 55, `${pfps.toFixed(1)} fps`)

  const noExits = await page.evaluate(() => {
    const e = window.__meg
    const chunkKey = (cx, cy) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0
    for (let dx = -3; dx <= 3; dx++)
      for (let dy = -3; dy <= 3; dy++) {
        e.getChunk(dx, dy)
        const list = e.chunkSprites.get(chunkKey(dx, dy))
        if (list?.some((s) => s.alive && (s.kind === 'exit' || s.kind === 'stairwell'))) return false
      }
    return true
  })
  check('Level Fun has no exit door / stairwell', noExits)

  // sad poster: guaranteed within a few chunks — find in the safe window, walk in
  const sadState = await page.evaluate(FIND_AND_TRIGGER, 'sadposter', 4000)
  check('=( poster triggers leave warp', sadState === 'warping', sadState)

  await sleep(3500)
  const backHome = await page.evaluate(() => window.__meg?.theme?.id)
  check('leaving party returns to Level 0', backHome === 0, `theme=${backHome}`)
  await page.close()
}

/* ---------------- 4. descent chain + deepest persistence + continue glyph ---------------- */
{
  const { page } = await newPage()
  await page.goto(`${URL}#/level`, { waitUntil: 'networkidle0' })
  await sleep(2000)

  const d1 = await page.evaluate(FIND_AND_TRIGGER, 'stairwell', 4000)
  check('stairwell triggers descent', d1 === 'descending', d1)
  await sleep(3500)
  const lvl1 = await page.evaluate(() => window.__meg?.theme?.id)
  check('arrived on Level 1', lvl1 === 1, `theme=${lvl1}`)

  const d2 = await page.evaluate(FIND_AND_TRIGGER, 'stairwell', 4000)
  check('second stairwell triggers descent', d2 === 'descending', d2)
  await sleep(3500)
  const lvl2 = await page.evaluate(() => window.__meg?.theme?.id)
  check('arrived on Level 2', lvl2 === 2, `theme=${lvl2}`)

  const deepest = await page.evaluate(() => localStorage.getItem('noclip_deepest'))
  check('deepest persisted = 2', deepest === '2', deepest)

  const noStairs = await page.evaluate(() => {
    const e = window.__meg
    const chunkKey = (cx, cy) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0
    for (let dx = -3; dx <= 3; dx++)
      for (let dy = -3; dy <= 3; dy++) {
        e.getChunk(dx, dy)
        if (e.chunkSprites.get(chunkKey(dx, dy))?.some((s) => s.kind === 'stairwell' && s.alive)) return false
      }
    return true
  })
  check('Level 2 spawns no stairwells', noStairs)

  await page.evaluate(() => (location.hash = '#/archive'))
  await sleep(800)
  const glyph = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /▼/.test(x.textContent || ''))
    if (!b) return null
    return { text: b.textContent, focusable: b.tabIndex >= 0 }
  })
  check('archive shows ▼2 continue glyph', glyph?.text === '▼2', JSON.stringify(glyph))

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /▼/.test(x.textContent || ''))
    b?.click()
  })
  await sleep(2500)
  const continued = await page.evaluate(() => ({ hash: location.hash, theme: window.__meg?.theme?.id }))
  check('continue remounts at deepest (Level 2)', continued.hash.includes('/level') && continued.theme === 2, JSON.stringify(continued))
  await page.close()
}

/* ---------------- 5. reduced motion ---------------- */
{
  const { page } = await newPage(true)
  await page.goto(`${URL}#/level`, { waitUntil: 'networkidle0' })
  await sleep(2000)
  const reducedOk = await page.evaluate(() => window.__meg?.reduced === true)
  check('reduced-motion flag reaches engine', reducedOk)
  await page.close()
}

/* ---------------- 6. party doc + FILES counter ---------------- */
{
  const { page } = await newPage()
  await page.goto(`${URL}#/level`, { waitUntil: 'networkidle0' })
  await sleep(1500)

  await page.evaluate(async () => {
    const e = window.__meg
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    e.transientSprites.push({
      kind: 'poster', x: e.posX + e.dirX * 0.7, y: e.posY + e.dirY * 0.7,
      scale: 0.62, floor: false, alive: true, vx: 0, vy: 0, ttl: -1, born: 0,
    })
    const t0 = Date.now()
    while (Date.now() - t0 < 4000 && e.state !== 'warping') await sleep(50)
  })
  await sleep(3500)
  check('warped into party for doc test', (await page.evaluate(() => window.__meg?.theme?.id)) === 3)

  const docState = await page.evaluate(async () => {
    const e = window.__meg
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const chunkKey = (cx, cy) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0
    const find = () => {
      for (let ring = 0; ring <= 3; ring++)
        for (let dx = -ring; dx <= ring; dx++)
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
            e.getChunk(dx, dy)
            const s = e.chunkSprites.get(chunkKey(dx, dy))?.find((x) => x.kind === 'document' && x.alive)
            if (s) return s
          }
      return null
    }
    let s = find()
    if (!s) return 'no-doc'
    const t0 = Date.now()
    while (Date.now() - t0 < 4000) {
      await sleep(40)
      if (document.body.textContent.includes('LEVEL FILE FUN')) return 'level-fun-doc'
      if (e.state === 'play') {
        s = find()
        if (s) {
          e.posX = s.x
          e.posY = s.y
        }
      }
    }
    return 'doc-not-shown state=' + e.state
  })
  check('party document is LEVEL FILE FUN', docState === 'level-fun-doc', docState)
  await page.close()
}

await browser.close()

const failed = results.filter((r) => !r.ok)
writeFileSync('/mnt/agents/output/app/test-results.json', JSON.stringify(results, null, 2))
log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
