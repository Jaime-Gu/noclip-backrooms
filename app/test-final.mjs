import puppeteer from 'puppeteer-core'
const DIST = '/mnt/agents/output/app/dist/index.html'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--window-size=1280,720'],
})

/* --- reduced-motion: full party in/out --- */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
  await page.goto(`file://${DIST}?debug#/level`, { waitUntil: 'networkidle0' })
  await sleep(2000)
  await page.evaluate(() => {
    const e = window.__meg
    e.transientSprites.push({
      kind: 'poster', x: e.posX + e.dirX * 0.7, y: e.posY + e.dirY * 0.7,
      scale: 0.62, floor: false, alive: true, vx: 0, vy: 0, ttl: -1, born: 0,
    })
  })
  await sleep(4000)
  const t = await page.evaluate(() => window.__meg?.theme?.id)
  console.log('reduced-motion: party mounts —', t === 3 ? 'PASS' : 'FAIL (' + t + ')')

  // leave via sad poster
  const left = await page.evaluate(async () => {
    const e = window.__meg
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const chunkKey = (cx, cy) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0
    let s = null
    for (let ring = 0; ring <= 3 && !s; ring++)
      for (let dx = -ring; dx <= ring && !s; dx++)
        for (let dy = -ring; dy <= ring && !s; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
          e.getChunk(dx, dy)
          s = e.chunkSprites.get(chunkKey(dx, dy))?.find((x) => x.kind === 'sadposter' && x.alive)
        }
    if (!s) return 'no-poster'
    const ddx = s.x - e.posX, ddy = s.y - e.posY
    const len = Math.hypot(ddx, ddy) || 1
    e.posX = s.x - (ddx / len) * 0.55
    e.posY = s.y - (ddy / len) * 0.55
    e.dirX = ddx / len
    e.dirY = ddy / len
    const t0 = Date.now()
    while (Date.now() - t0 < 3000 && e.state === 'play') await sleep(40)
    return e.state
  })
  console.log('reduced-motion: sad poster warps out —', left === 'warping' ? 'PASS' : 'FAIL (' + left + ')')
  await sleep(4000)
  const back = await page.evaluate(() => window.__meg?.theme?.id)
  console.log('reduced-motion: returns to Level 0 —', back === 0 ? 'PASS' : 'FAIL (' + back + ')')
  await page.close()
}

/* --- mobile viewport + archive glyph screenshot --- */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
  await page.goto(`file://${DIST}?debug#/level`, { waitUntil: 'networkidle0' })
  await sleep(2500)
  const mobileOk = await page.evaluate(() => {
    const e = window.__meg
    const canvas = e.canvas
    const rect = canvas.getBoundingClientRect()
    // touch controls visible?
    const touch = [...document.querySelectorAll('div')].some((d) => /pointer/i.test(d.style.touchAction || ''))
    return { w: canvas.width, h: canvas.height, dispW: rect.width, dispH: rect.height }
  })
  console.log('mobile: engine sized —', JSON.stringify(mobileOk))
  await page.screenshot({ path: '/mnt/agents/output/app/mobile-wander.png' })

  // set deepest and visit archive for the glyph shot
  await page.evaluate(() => localStorage.setItem('noclip_deepest', '2'))
  await page.evaluate(() => (location.hash = '#/archive'))
  await sleep(1000)
  await page.screenshot({ path: '/mnt/agents/output/app/archive-glyph.png' })
  // zoom into the glyph corner: check the button's rendered opacity
  const glyphStyle = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /▼/.test(x.textContent || ''))
    if (!b) return null
    const cs = getComputedStyle(b)
    return { color: cs.color, fontSize: cs.fontSize, text: b.textContent }
  })
  console.log('glyph style:', JSON.stringify(glyphStyle))
  await page.close()
}

await browser.close()
