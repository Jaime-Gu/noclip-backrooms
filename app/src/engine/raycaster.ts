/* ============================================================================
 * NOCLIP raycaster — pure TS, one canvas, one rAF loop. No React in here.
 * DDA walls + row-based floor/ceiling casting + billboard sprites + VHS pass.
 * The engine is constructed with a LevelTheme; the wander page swaps themes
 * on descent. All buffers preallocated; the ray loop performs zero heap
 * allocations.
 * ==========================================================================*/

import { CONFIG, MEG_DOCS } from '@/config'
import { audio } from './audio'
import { buildSpriteTextures, TEX, type LevelTexSet, type PixTex, type SpriteTexSet } from './textures'
import { chunkKey, generateChunk, hash3, type Chunk, type DecalSpec } from './world'
import { EVENT_COST, type EventKind, type LevelTheme } from './levels'

export interface HudState {
  sanity: number
  almond: number
  seconds: number
  files: number
  paused: boolean
}

export interface EngineCallbacks {
  onHud: (h: HudState) => void
  onDocument: (docId: string) => void
  onExit: (seconds: number, depth: number) => void
  onDescend: (toLevel: number) => void
  onEnterParty: () => void // walked into a =) poster on Level 0
  onLeaveParty: () => void // walked into a =( poster on Level Fun
}

export interface EngineOptions {
  theme: LevelTheme
  runSeed: number
  foundDocs: string[]
  reducedMotion: boolean
  initialSanity?: number
  initialAlmond?: number
  graceSeconds?: number
  callbacks: EngineCallbacks
}

type SpriteKind =
  | 'almond'
  | 'document'
  | 'exit'
  | 'poster'
  | 'silhouette'
  | 'stairwell'
  | 'crate'
  | 'chairs'
  | 'cooler'
  | 'sign'
  | 'chair'
  | 'steam'
  | 'sadposter'
  | 'balloons'
  | 'ptable'
  | 'balloon'
  | 'partier'

interface Sprite {
  kind: SpriteKind
  x: number
  y: number
  scale: number
  floor: boolean // anchored to floor line vs centered at eye level
  alive: boolean
  vx: number
  vy: number
  ttl: number
  born: number // engine-seconds timestamp (steam animation)
}

const CS = CONFIG.CHUNK_SIZE

export class RaycasterEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cb: EngineCallbacks
  private theme: LevelTheme
  private seed: number
  private reduced: boolean

  // adaptive internal resolution
  private w: number = CONFIG.INTERNAL_WIDTH
  private h: number = CONFIG.INTERNAL_HEIGHT

  // frame buffers (allocated by allocBuffers)
  private image!: ImageData
  private frameBuf!: Uint32Array // raw render
  private outBuf!: Uint32Array // post-processed (written into image)
  private zbuf!: Float32Array
  private vignette!: Float32Array
  private grainTable: Uint8Array

  // camera
  private posX = CS / 2 + 0.5
  private posY = CS / 2 + 0.5
  private dirX = 1
  private dirY = 0
  private planeX: number = 0
  private planeY: number = CONFIG.PLANE

  // world
  private set: LevelTexSet
  private spriteTex: SpriteTexSet
  private chunks = new Map<number, Chunk>()
  private chunkSprites = new Map<number, Sprite[]>()
  private transientSprites: Sprite[] = []
  private collected = new Set<string>() // "cx,cy,kind" picked-up items
  private posterWalls = new Set<string>()
  private keepKeys = new Set<number>()
  private chunksGenerated = 0
  private exitSpawned = false
  private stairSpawned = false
  private foundAtStart: string[]
  private docsPickedThisRun = 0
  private pickedDocIds = new Set<string>()

  // gameplay state
  private sanity: number = CONFIG.SANITY_START
  private almond = 0
  private seconds = 0
  private state: 'play' | 'paused' | 'lost' | 'exiting' | 'descending' | 'warping' = 'play'
  private lostTimer = 0
  private descendTimer = 0
  private warpTimer = 0
  private warpTarget: 'party' | 'leave' = 'party'
  private descendFired = false
  private warpFired = false
  private bobPhase = 0
  private walkDistAccum = 0
  private frame = 0
  private lightLevel = 1 // multiplied into all shading (lights-off event)

  // stairwell guidance (breathe glow is draw-time; draft cue is proximity)
  private draftProx = 0 // 0..1 nearness to the nearest stairwell
  private draftPan = 0 // stereo direction of that stairwell
  private draftTimer: number = CONFIG.DRAFT_AUDIO_GAP

  // Level Fun bookkeeping
  private sadPosterSpawned = false

  // events
  private eventTimer = CONFIG.EVENT_MIN_GAP + 4
  private dimTimer = 0
  private silCooldown = 0
  private lightsOffCd = 10
  private steamCd = 6
  private loPhase: 'idle' | 'down' | 'hold' | 'restore' = 'idle'
  private loTimer = 0
  private loRestoreT = 0
  private hazeTimer = 0 // steam screen-edge white haze
  private flickerT = -1

  // input
  private keys = new Set<string>()
  private dragging = false
  private dragPointer = -1
  private lastDragX = 0
  touchX = 0 // -1..1 strafe (written by React joystick)
  touchY = 0 // -1..1 forward

  // loop
  private raf = 0
  private lastT = 0
  private hudAccum = 0
  private audioAccum = 0
  private destroyed = false

  // scratch (avoid allocations in hot paths)
  private drawList: { s: Sprite; d: number }[] = []

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.cb = opts.callbacks
    this.theme = opts.theme
    this.seed = opts.runSeed >>> 0
    this.reduced = opts.reducedMotion
    this.foundAtStart = opts.foundDocs.slice()
    this.sanity = opts.initialSanity ?? CONFIG.SANITY_START
    this.almond = opts.initialAlmond ?? 0

    this.grainTable = new Uint8Array(65536)
    for (let i = 0; i < 65536; i++) this.grainTable[i] = (Math.random() * 256) | 0
    this.allocBuffers(this.w, this.h)

    this.set = opts.theme.texSet()
    this.spriteTex = buildSpriteTextures()

    if (opts.graceSeconds && opts.graceSeconds > 0) {
      this.eventTimer = opts.graceSeconds + CONFIG.EVENT_MIN_GAP
    }

    // initial chunk + spawn at its connected center
    const c0 = this.getChunk(0, 0)
    this.posX = (c0.spawn % CS) + 0.5
    this.posY = Math.floor(c0.spawn / CS) + 0.5

    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)
    this.loop = this.loop.bind(this)
  }

  /** (Re)allocate all resolution-dependent buffers. Zero per-frame cost. */
  private allocBuffers(w: number, h: number) {
    this.w = w
    this.h = h
    this.canvas.width = w
    this.canvas.height = h
    this.image = this.ctx.createImageData(w, h)
    this.outBuf = new Uint32Array(this.image.data.buffer)
    this.frameBuf = new Uint32Array(w * h)
    this.zbuf = new Float32Array(w)
    this.vignette = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x / w - 0.5) * 2
        const ny = (y / h - 0.5) * 2
        const d = Math.sqrt(nx * nx * 0.8 + ny * ny * 1.15)
        this.vignette[y * w + x] = Math.max(0.55, 1 - d * 0.42)
      }
    }
  }

  /** Adaptive internal resolution from the canvas display size. */
  resize(cssW: number, cssH: number) {
    const tier = cssW <= 900 ? 480 : cssW <= 1600 ? 560 : 640
    const aspect = cssH > 0 ? cssH / cssW : 9 / 16
    const nw = tier
    const nh = Math.max(2, Math.round(tier * aspect))
    if (nw === this.w && nh === this.h) return
    this.allocBuffers(nw, nh)
  }

  /* ---------------------------------------------------------------- public */

  start() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    this.lastT = performance.now()
    this.raf = requestAnimationFrame(this.loop)
    this.pushHud()
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
  }

  pause() {
    if (this.state === 'play') {
      this.state = 'paused'
      audio.setDuck(true)
      this.pushHud()
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'play'
      audio.setDuck(false)
      this.pushHud()
    }
  }

  /** Space / auto-drink */
  drink() {
    if (this.almond <= 0 || this.state !== 'play') return
    this.almond--
    this.sanity = Math.min(100, this.sanity + CONFIG.ALMOND_RESTORE)
    audio.chime()
    this.pushHud()
  }

  getSeconds() {
    return Math.floor(this.seconds)
  }

  getCarry() {
    return { sanity: this.sanity, almond: this.almond }
  }

  /* --------------------------------------------------------------- chunks */

  private getChunk(cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy)
    let c = this.chunks.get(key)
    if (c) return c
    c = generateChunk(cx, cy, this.seed, this.theme.genKind)
    this.chunks.set(key, c)
    this.chunksGenerated++
    this.populateChunk(cx, cy, c)
    // eviction: keep the cache local to the player (4-chunk radius)
    if (this.chunks.size > 81) {
      const pcx = Math.floor(this.posX / CS)
      const pcy = Math.floor(this.posY / CS)
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          this.keepKeys.add(chunkKey(pcx + dx, pcy + dy))
        }
      }
      for (const k of this.chunks.keys()) {
        if (!this.keepKeys.has(k)) {
          this.chunks.delete(k)
          // a guaranteed exit/stairwell must not vanish with an evicted chunk —
          // release the flag so it can spawn again nearer the player
          const evictedSprites = this.chunkSprites.get(k)
          if (evictedSprites) {
            for (const s of evictedSprites) {
              if (s.kind === 'exit' && s.alive) this.exitSpawned = false
              if (s.kind === 'stairwell' && s.alive) this.stairSpawned = false
              if (s.kind === 'sadposter' && s.alive) this.sadPosterSpawned = false
            }
          }
          this.chunkSprites.delete(k)
        }
      }
      this.keepKeys.clear()
    }
    return c
  }

  private populateChunk(cx: number, cy: number, chunk: Chunk) {
    const key = chunkKey(cx, cy)
    const sprites: Sprite[] = []
    const r = this.chunkRng(cx, cy)
    const cells = chunk.connected
    // cells near the chunk border — players constantly cross chunk edges, so
    // items placed here get discovered at a humane rate
    const nearEdge = cells.filter((i) => {
      const x = i % CS
      const y = Math.floor(i / CS)
      return x <= 4 || x >= CS - 5 || y <= 4 || y >= CS - 5
    })
    const pool = nearEdge.length > 4 ? nearEdge : cells
    const mk = (kind: SpriteKind, lx: number, ly: number, scale: number, floor: boolean): Sprite => ({
      kind,
      x: cx * CS + lx,
      y: cy * CS + ly,
      scale,
      floor,
      alive: true,
      vx: 0,
      vy: 0,
      ttl: -1,
      born: 0,
    })
    const pick = () => {
      const src = r() < 0.68 ? pool : cells
      const i = src[(r() * src.length) | 0]
      return { x: (i % CS) + 0.5 + (r() - 0.5) * 0.4, y: Math.floor(i / CS) + 0.5 + (r() - 0.5) * 0.4 }
    }

    // almond water (occasionally a pair)
    if (r() < this.theme.almondRate && !this.collected.has(`${cx},${cy},almond`)) {
      const p = pick()
      sprites.push(mk('almond', p.x, p.y, 0.55, true))
      if (r() < 0.3) {
        const p2 = pick()
        sprites.push(mk('almond', p2.x, p2.y, 0.55, true))
      }
    }
    // supply crates (Level 1)
    if (this.theme.crateRate > 0 && r() < this.theme.crateRate && !this.collected.has(`${cx},${cy},crate`)) {
      const p = pick()
      sprites.push(mk('crate', p.x, p.y, 0.75, true))
    }
    // document — Level Fun holds exactly one file, and only until it is found
    const partyDocDue =
      this.theme.id === 3 &&
      !this.foundAtStart.includes('level-fun') &&
      !this.pickedDocIds.has('level-fun') &&
      r() < CONFIG.PARTY_DOC_RATE
    const normalDocDue = this.theme.id !== 3 && r() < CONFIG.DOC_PER_CHUNK
    if ((partyDocDue || normalDocDue) && !this.collected.has(`${cx},${cy},document`)) {
      const p = pick()
      sprites.push(mk('document', p.x, p.y, 0.5, true))
    }
    // exit door — every level that has one, always leads home (never Level Fun)
    const docsFound = this.foundAtStart.length + this.docsPickedThisRun
    const exitGuarantee =
      !this.exitSpawned &&
      docsFound >= CONFIG.EXIT_GUARANTEE_AFTER_DOCS &&
      this.chunksGenerated >= CONFIG.EXIT_GUARANTEE_MIN_CHUNKS &&
      Math.abs(cx) + Math.abs(cy) >= 2
    if (
      this.theme.hasExit &&
      !this.exitSpawned &&
      (r() < CONFIG.EXIT_PER_CHUNK || exitGuarantee) &&
      !(cx === 0 && cy === 0)
    ) {
      const p = pick()
      sprites.push(mk('exit', p.x, p.y, 1.05, true))
      this.exitSpawned = true
    }
    // stairwell down (not on the bottom level)
    const stairGuarantee = !this.stairSpawned && this.chunksGenerated >= CONFIG.STAIR_GUARANTEE_CHUNKS && Math.abs(cx) + Math.abs(cy) >= 2
    if (
      this.theme.hasStairs &&
      !this.stairSpawned &&
      (r() < CONFIG.STAIR_PER_CHUNK || stairGuarantee) &&
      !(cx === 0 && cy === 0)
    ) {
      const p = pick()
      sprites.push(mk('stairwell', p.x, p.y, 1.15, true))
      this.stairSpawned = true
    }
    // =( poster — the only way out of the party (Level Fun only)
    if (this.theme.id === 3 && !this.sadPosterSpawned && !(cx === 0 && cy === 0)) {
      const sadGuarantee =
        this.chunksGenerated >= CONFIG.SAD_POSTER_GUARANTEE_CHUNKS && Math.abs(cx) + Math.abs(cy) >= 2
      if (r() < CONFIG.SAD_POSTER_PER_CHUNK || sadGuarantee) {
        const wall = this.wallAdjacentCell(chunk, r)
        if (wall) {
          sprites.push(mk('sadposter', wall.x, wall.y, 0.62, false))
          this.sadPosterSpawned = true
        }
      }
    }
    // floating balloons near the ceiling (Level Fun)
    if (this.theme.id === 3 && r() < CONFIG.FLOAT_BALLOON_RATE) {
      const p = pick()
      sprites.push(mk('balloon', p.x, p.y, 0.45, false))
    }
    // set-dressing props baked into the chunk
    for (const pr of chunk.props) {
      const scale =
        pr.kind === 'sign'
          ? 0.55
          : pr.kind === 'chair'
            ? 0.6
            : pr.kind === 'cooler'
              ? 0.85
              : pr.kind === 'ptable'
                ? 1.05
                : pr.kind === 'balloons'
                  ? 0.85
                  : 0.9
      sprites.push(mk(pr.kind, pr.lx + 0.5, pr.ly + 0.5, scale, true))
    }
    this.chunkSprites.set(key, sprites)
  }

  /** Chunk-LOCAL center of a wall cell adjacent to a connected open cell
   *  (mk() applies the chunk offset — do not add it here). */
  private wallAdjacentCell(chunk: Chunk, r: () => number): { x: number; y: number } | null {
    const start = (r() * chunk.connected.length) | 0
    for (let n = 0; n < chunk.connected.length; n++) {
      const i = chunk.connected[(start + n) % chunk.connected.length]
      const lx = i % CS
      const ly = (i - lx) / CS
      if (lx < 1 || ly < 1 || lx > CS - 2 || ly > CS - 2) continue
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      const d = dirs[(r() * 4) | 0]
      const wx = lx + d[0]
      const wy = ly + d[1]
      if (chunk.grid[wy * CS + wx] === 1) {
        return { x: wx + 0.5, y: wy + 0.5 }
      }
    }
    return null
  }

  private chunkRng(cx: number, cy: number) {
    let s = hash3(cx, cy, this.seed ^ 0xc0ffee)
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  private isWall(wx: number, wy: number): boolean {
    const cx = Math.floor(wx / CS)
    const cy = Math.floor(wy / CS)
    const c = this.getChunk(cx, cy)
    const lx = wx - cx * CS
    const ly = wy - cy * CS
    return c.grid[ly * CS + lx] === 1
  }

  private wallTexAt(wx: number, wy: number): PixTex {
    const cx = Math.floor(wx / CS)
    const cy = Math.floor(wy / CS)
    const c = this.getChunk(cx, cy)
    const lx = wx - cx * CS
    const ly = wy - cy * CS
    const v = c.wallVar[ly * CS + lx]
    return this.set.walls[v < this.set.walls.length ? v : 0]
  }

  /* ---------------------------------------------------------------- input */

  private onKeyDown(e: KeyboardEvent) {
    const k = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    if (k === ' ') {
      this.drink()
      return
    }
    this.keys.add(k)
  }
  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.key.toLowerCase())
  }

  private onPointerDown(e: PointerEvent) {
    if (e.target !== this.canvas) return
    // on touch devices the left half belongs to the joystick overlay
    if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.42) return
    this.dragging = true
    this.dragPointer = e.pointerId
    this.lastDragX = e.clientX
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  private onPointerMove(e: PointerEvent) {
    if (!this.dragging || e.pointerId !== this.dragPointer) return
    const dx = e.clientX - this.lastDragX
    this.lastDragX = e.clientX
    this.rotate(dx * CONFIG.MOUSE_SENS)
  }
  private onPointerUp(e: PointerEvent) {
    if (e.pointerId !== this.dragPointer) return
    this.dragging = false
    this.dragPointer = -1
  }

  private rotate(a: number) {
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const ndx = this.dirX * cos - this.dirY * sin
    this.dirY = this.dirX * sin + this.dirY * cos
    this.dirX = ndx
    const npx = this.planeX * cos - this.planeY * sin
    this.planeY = this.planeX * sin + this.planeY * cos
    this.planeX = npx
  }

  /* ----------------------------------------------------------------- loop */

  private loop(t: number) {
    if (this.destroyed) return
    let dt = (t - this.lastT) / 1000
    this.lastT = t
    if (dt > 0.05) dt = 0.05 // tab was backgrounded etc.
    this.frame++

    if (this.state === 'play') {
      this.update(dt)
    } else if (this.state === 'lost') {
      this.updateLost(dt)
    } else if (this.state === 'descending') {
      this.updateDescent(dt)
    } else if (this.state === 'warping') {
      this.updateWarp(dt)
    }

    this.render()
    this.postProcess()
    this.ctx.putImageData(this.image, 0, 0)

    if (this.state === 'lost' && this.lostTimer > 1.1) {
      this.drawCenteredText('you lost yourself for a while.')
    }
    if (this.state === 'warping') {
      const dur = this.reduced ? CONFIG.POSTER_TRANSITION * 0.5 : CONFIG.POSTER_TRANSITION
      if (this.warpTimer / dur > 0.35) {
        this.drawCenteredText(this.warpTarget === 'party' ? '=)' : '=(', 26)
      }
    }

    this.raf = requestAnimationFrame(this.loop)
  }

  private update(dt: number) {
    this.seconds += dt
    this.sanity -= this.theme.sanityDrain * dt
    if (this.sanity <= 0) {
      this.sanity = 0
      this.state = 'lost'
      this.lostTimer = 0
      audio.setHum(0.12, 2)
      this.pushHud()
      return
    }

    // ---- movement ----
    let fwd = 0
    let strafe = 0
    if (this.keys.has('w') || this.keys.has('arrowup')) fwd += 1
    if (this.keys.has('s') || this.keys.has('arrowdown')) fwd -= 1
    if (this.keys.has('d')) strafe += 1
    if (this.keys.has('a')) strafe -= 1
    if (this.keys.has('q') || this.keys.has('arrowleft')) this.rotate(-CONFIG.TURN_SPEED * dt)
    if (this.keys.has('e') || this.keys.has('arrowright')) this.rotate(CONFIG.TURN_SPEED * dt)
    fwd += this.touchY
    strafe += this.touchX
    fwd = Math.max(-1, Math.min(1, fwd))
    strafe = Math.max(-1, Math.min(1, strafe))

    const moving = fwd !== 0 || strafe !== 0
    if (moving) {
      const mvx = (this.dirX * fwd * CONFIG.MOVE_SPEED + -this.dirY * strafe * CONFIG.STRAFE_SPEED) * dt
      const mvy = (this.dirY * fwd * CONFIG.MOVE_SPEED + this.dirX * strafe * CONFIG.STRAFE_SPEED) * dt
      this.tryMove(mvx, mvy)
      this.bobPhase += dt * CONFIG.BOB_FREQ
      this.walkDistAccum += Math.sqrt(mvx * mvx + mvy * mvy)
      if (this.walkDistAccum > 1.05) {
        this.walkDistAccum = 0
        audio.footstep(0.85)
      }
    } else {
      this.bobPhase *= 0.9
    }

    // ---- pickups / exits / stairwells ----
    this.checkSprites()

    // ---- stairwell draft cue (cool edge bloom + faint air sound nearby) ----
    this.updateDraft(dt)

    // ---- events ----
    this.updateEvents(dt)
    this.updateLightsOff(dt)

    // transient sprites (silhouette crossing, steam plumes)
    for (const s of this.transientSprites) {
      if (s.kind === 'steam') {
        if (this.seconds - s.born > CONFIG.STEAM_DURATION) s.alive = false
      } else if (s.ttl > 0) {
        s.ttl -= dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        if (s.ttl <= 0) s.alive = false
      }
    }
    if (this.transientSprites.length && this.frame % 60 === 0) {
      this.transientSprites = this.transientSprites.filter((s) => s.alive)
    }

    // ---- timers ----
    if (this.dimTimer > 0) this.dimTimer -= dt
    if (this.silCooldown > 0) this.silCooldown -= dt
    if (this.lightsOffCd > 0) this.lightsOffCd -= dt
    if (this.steamCd > 0) this.steamCd -= dt
    if (this.hazeTimer > 0) this.hazeTimer -= dt
    this.flickerT += dt
    // ease lightLevel back toward 1 when nothing is holding it down
    if (this.loPhase === 'idle' && this.lightLevel < 1) {
      this.lightLevel = Math.min(1, this.lightLevel + dt * 0.5)
    }

    // ---- audio plumbing ----
    this.audioAccum += dt
    if (this.audioAccum > 0.4) {
      this.audioAccum = 0
      audio.setSanity(this.sanity)
      audio.setHum(0.5 + (100 - this.sanity) * 0.004, 1)
    }
    audio.update()

    // auto-drink
    if (this.sanity < CONFIG.ALMOND_AUTODRINK_BELOW && this.almond > 0) this.drink()

    // hud throttle
    this.hudAccum += dt
    if (this.hudAccum > 0.25) {
      this.hudAccum = 0
      this.pushHud()
    }
  }

  /** Feel the stairwell before you see it: proximity + stereo direction. */
  private updateDraft(dt: number) {
    this.draftProx = 0
    if (!this.theme.hasStairs) return
    const pcx = Math.floor(this.posX / CS)
    const pcy = Math.floor(this.posY / CS)
    let best: number = CONFIG.DRAFT_RANGE
    let bdx = 0
    let bdy = 0
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const list = this.chunkSprites.get(chunkKey(pcx + dx, pcy + dy))
        if (!list) continue
        for (const s of list) {
          if (!s.alive || s.kind !== 'stairwell') continue
          const ex = s.x - this.posX
          const ey = s.y - this.posY
          const d = Math.hypot(ex, ey)
          if (d < best) {
            best = d
            bdx = ex
            bdy = ey
          }
        }
      }
    }
    if (best < CONFIG.DRAFT_RANGE) {
      this.draftProx = 1 - best / CONFIG.DRAFT_RANGE
      const cross = this.dirX * bdy - this.dirY * bdx
      this.draftPan = Math.max(-1, Math.min(1, cross / (best || 1)))
      this.draftTimer -= dt
      if (this.draftTimer <= 0) {
        this.draftTimer = CONFIG.DRAFT_AUDIO_GAP
        audio.airDraft(this.draftPan)
      }
    }
  }

  private tryMove(mvx: number, mvy: number) {
    const r = CONFIG.PLAYER_RADIUS
    const nx = this.posX + mvx
    if (
      !this.isWall(Math.floor(nx + Math.sign(mvx) * r), Math.floor(this.posY - r)) &&
      !this.isWall(Math.floor(nx + Math.sign(mvx) * r), Math.floor(this.posY + r))
    ) {
      this.posX = nx
    }
    const ny = this.posY + mvy
    if (
      !this.isWall(Math.floor(this.posX - r), Math.floor(ny + Math.sign(mvy) * r)) &&
      !this.isWall(Math.floor(this.posX + r), Math.floor(ny + Math.sign(mvy) * r))
    ) {
      this.posY = ny
    }
  }

  private checkSprites() {
    const pcx = Math.floor(this.posX / CS)
    const pcy = Math.floor(this.posY / CS)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = chunkKey(pcx + dx, pcy + dy)
        const list = this.chunkSprites.get(key)
        if (!list) continue
        const cx = pcx + dx
        const cy = pcy + dy
        for (const s of list) {
          if (!s.alive) continue
          const ddx = s.x - this.posX
          const ddy = s.y - this.posY
          const dist2 = ddx * ddx + ddy * ddy
          if (s.kind === 'exit') {
            if (dist2 < 0.5) {
              s.alive = false
              this.state = 'exiting'
              this.cb.onExit(this.getSeconds(), this.theme.id)
              return
            }
          } else if (s.kind === 'stairwell') {
            if (dist2 < 0.5) {
              s.alive = false
              this.beginDescent()
              return
            }
          } else if (s.kind === 'crate') {
            if (dist2 < 0.64) {
              s.alive = false
              this.collected.add(`${cx},${cy},crate`)
              const span = CONFIG.CRATE_ALMOND_MAX - CONFIG.CRATE_ALMOND_MIN + 1
              this.almond += CONFIG.CRATE_ALMOND_MIN + Math.floor(Math.random() * span)
              audio.crateOpen()
              this.pushHud()
            }
          } else if (s.kind === 'sadposter') {
            // pressed against it and facing it — the party lets you go
            if (dist2 < CONFIG.POSTER_ENTRY_DIST * CONFIG.POSTER_ENTRY_DIST && this.facing(ddx, ddy)) {
              s.alive = false
              this.beginWarp('leave')
              return
            }
          } else if (s.kind === 'balloons') {
            // do not pop the balloons
            if (dist2 < 0.64) {
              s.alive = false
              this.collected.add(`${cx},${cy},balloons`)
              this.sanity = Math.max(0, this.sanity - EVENT_COST.balloonPop)
              const cross = this.dirX * ddy - this.dirY * ddx
              audio.balloonPop(Math.max(-1, Math.min(1, cross / (Math.sqrt(dist2) || 1))))
              this.pushHud()
            }
          } else if (s.kind === 'almond' || s.kind === 'document') {
            if (dist2 < 0.64) {
              s.alive = false
              this.collected.add(`${cx},${cy},${s.kind}`)
              if (s.kind === 'almond') {
                this.almond++
                audio.chime()
                this.pushHud()
              } else {
                audio.paper()
                const docId = this.nextDocId()
                this.docsPickedThisRun++
                this.state = 'paused'
                audio.setDuck(true)
                this.pushHud()
                this.cb.onDocument(docId)
                return
              }
            }
          }
        }
      }
    }

    // =) posters (transient, Level 0) — walk in facing them to attend the party
    if (this.theme.id === 0) {
      for (const s of this.transientSprites) {
        if (!s.alive || s.kind !== 'poster') continue
        const ddx = s.x - this.posX
        const ddy = s.y - this.posY
        if (ddx * ddx + ddy * ddy < CONFIG.POSTER_ENTRY_DIST * CONFIG.POSTER_ENTRY_DIST && this.facing(ddx, ddy)) {
          s.alive = false
          this.beginWarp('party')
          return
        }
      }
    }
  }

  /** Is the player deliberately facing the point (ddx,ddy)? (dot with view dir) */
  private facing(ddx: number, ddy: number): boolean {
    const len = Math.hypot(ddx, ddy) || 1
    return (this.dirX * ddx + this.dirY * ddy) / len > CONFIG.POSTER_FACE_DOT
  }

  /** Weighted by level affinity: a level's own file is 3x more likely here.
   *  LEVEL FILE FUN is only ever handed out on Level Fun itself. */
  private nextDocId(): string {
    if (this.theme.id === 3) return 'level-fun'
    const affinity: Record<string, number> = { 'level-0': 0, 'level-1': 1, 'level-2': 2 }
    const pool: { id: string; w: number }[] = []
    for (const d of MEG_DOCS) {
      if (d.id === 'level-fun') continue
      if (this.foundAtStart.includes(d.id) || this.pickedDocIds.has(d.id)) continue
      const w = affinity[d.id] === this.theme.id ? 3 : 1
      pool.push({ id: d.id, w })
    }
    if (pool.length === 0) {
      // everything found — hand out repeats deterministically
      return MEG_DOCS[(this.frame + this.docsPickedThisRun) % MEG_DOCS.length].id
    }
    let total = 0
    for (const p of pool) total += p.w
    let roll = Math.random() * total
    for (const p of pool) {
      roll -= p.w
      if (roll <= 0) {
        this.pickedDocIds.add(p.id)
        return p.id
      }
    }
    const fallback = pool[0].id
    this.pickedDocIds.add(fallback)
    return fallback
  }

  /* ----------------------------------------------------------- descent */

  private beginDescent() {
    this.state = 'descending'
    this.descendTimer = 0
    audio.descendSteps()
    audio.setHum(0, 0.6)
  }

  private updateDescent(dt: number) {
    this.descendTimer += dt
    const dur = this.reduced ? CONFIG.DESCENT_FADE_REDUCED : CONFIG.DESCENT_FADE
    // fire exactly once — a repeated callback would remount the page in a storm
    if (!this.descendFired && this.descendTimer >= dur) {
      this.descendFired = true
      this.cb.onDescend(this.theme.id + 1)
    }
  }

  /* ---------------------------------------------------- poster warps */

  private beginWarp(target: 'party' | 'leave') {
    this.state = 'warping'
    this.warpTimer = 0
    this.warpTarget = target
    if (target === 'party') {
      audio.detune(-4, CONFIG.POSTER_TRANSITION) // the hum sags as you go through
    }
    audio.setHum(0, 0.5)
  }

  private updateWarp(dt: number) {
    this.warpTimer += dt
    const dur = this.reduced ? CONFIG.POSTER_TRANSITION * 0.5 : CONFIG.POSTER_TRANSITION
    // fire exactly once — a repeated callback would remount the page in a storm
    if (!this.warpFired && this.warpTimer >= dur) {
      this.warpFired = true
      if (this.warpTarget === 'party') this.cb.onEnterParty()
      else this.cb.onLeaveParty()
    }
  }

  /* --------------------------------------------------------------- events */

  private updateEvents(dt: number) {
    this.eventTimer -= dt
    if (this.eventTimer > 0) return
    this.eventTimer = CONFIG.EVENT_MIN_GAP + Math.random() * (CONFIG.EVENT_MAX_GAP - CONFIG.EVENT_MIN_GAP)

    const table = this.theme.events
    const entries: [EventKind, number][] = []
    for (const k of Object.keys(table) as EventKind[]) {
      const w = table[k]
      if (!w) continue
      if (k === 'silhouette' && this.silCooldown > 0) continue
      if (k === 'lightsOff' && this.lightsOffCd > 0) continue
      if (k === 'steamBurst' && this.steamCd > 0) continue
      entries.push([k, w])
    }
    if (entries.length === 0) {
      this.eventTimer = 5
      return
    }
    let total = 0
    for (const [, w] of entries) total += w
    let roll = Math.random() * total
    let chosen: EventKind = entries[0][0]
    for (const [k, w] of entries) {
      roll -= w
      if (roll <= 0) {
        chosen = k
        break
      }
    }
    this.sanity = Math.max(0, this.sanity - EVENT_COST[chosen])

    switch (chosen) {
      case 'dimLights':
        this.dimTimer = CONFIG.DIM_DURATION
        break
      case 'distantThud':
        audio.distantThud(Math.random() * 2 - 1)
        break
      case 'humDetune':
        audio.detune(Math.random() < 0.7 ? -1 : 1, CONFIG.DETUNE_DURATION)
        break
      case 'poster':
        this.spawnPoster()
        break
      case 'silhouette':
        this.spawnSilhouette()
        break
      case 'lightsOff':
        this.startLightsOff()
        break
      case 'steamBurst':
        this.spawnSteam()
        break
      case 'pipeKnock':
        audio.pipeKnock(Math.random() * 2 - 1)
        break
      case 'balloonPop':
        audio.balloonPop(Math.random() * 2 - 1)
        break
      case 'hornHonk':
        audio.partyHorn(Math.random() * 2 - 1)
        break
    }
  }

  /** Warehouse lights-off: ambient drops to ~25% with a rumble, then lamps
   *  come back section by section (stepped restore, <= 2 dips/sec). */
  private startLightsOff() {
    this.loPhase = 'down'
    this.loTimer = CONFIG.LIGHTSOFF_DURATION_MIN + Math.random() * (CONFIG.LIGHTSOFF_DURATION_MAX - CONFIG.LIGHTSOFF_DURATION_MIN)
    this.lightsOffCd = CONFIG.LIGHTSOFF_COOLDOWN
    audio.rumble(this.loTimer + 1.5)
  }

  private updateLightsOff(dt: number) {
    if (this.loPhase === 'down') {
      this.lightLevel += (CONFIG.LIGHTSOFF_FLOOR - this.lightLevel) * Math.min(1, dt * 1.4)
      this.loTimer -= dt
      if (this.loTimer <= 0) {
        this.loPhase = 'restore'
        this.loRestoreT = 0
      }
    } else if (this.loPhase === 'restore') {
      this.loRestoreT += dt
      const step = Math.min(3, Math.floor(this.loRestoreT / 0.5))
      const frac = this.loRestoreT % 0.5
      let lvl = CONFIG.LIGHTSOFF_FLOOR + step * 0.25
      if (frac < 0.08) lvl *= 0.85 // brief dip before each section returns
      this.lightLevel = Math.min(1, lvl)
      if (this.loRestoreT >= 1.5) {
        this.loPhase = 'idle'
        this.lightLevel = 1
      }
    }
  }

  private spawnSteam() {
    this.steamCd = CONFIG.STEAM_COOLDOWN
    // find a wall 2-5 cells away, in or near the view cone
    const ang0 = Math.atan2(this.dirY, this.dirX)
    let sx = 0
    let sy = 0
    let found = false
    for (let attempt = 0; attempt < 16; attempt++) {
      const ang = ang0 + (Math.random() - 0.5) * 2.2
      const dist = 2 + Math.random() * 3
      const wx = Math.floor(this.posX + Math.cos(ang) * dist)
      const wy = Math.floor(this.posY + Math.sin(ang) * dist)
      if (this.isWall(wx, wy)) {
        sx = wx + 0.5 - Math.cos(ang) * 0.35
        sy = wy + 0.5 - Math.sin(ang) * 0.35
        found = true
        break
      }
    }
    if (!found) {
      sx = this.posX + Math.cos(ang0) * 3
      sy = this.posY + Math.sin(ang0) * 3
    }
    this.transientSprites.push({
      kind: 'steam',
      x: sx,
      y: sy,
      scale: 0.9,
      floor: false,
      alive: true,
      vx: 0,
      vy: 0,
      ttl: -1,
      born: this.seconds,
    })
    this.hazeTimer = 0.6
    // stereo position from camera-relative direction
    const ex = sx - this.posX
    const ey = sy - this.posY
    const cross = this.dirX * ey - this.dirY * ex
    const pan = Math.max(-1, Math.min(1, cross / (Math.hypot(ex, ey) || 1)))
    audio.steamHiss(pan)
  }

  private spawnPoster() {
    const ang0 = Math.atan2(this.dirY, this.dirX)
    for (let attempt = 0; attempt < 24; attempt++) {
      const ang = ang0 + (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.9)
      const dist = 3 + Math.random() * 4
      const wx = Math.floor(this.posX + Math.cos(ang) * dist)
      const wy = Math.floor(this.posY + Math.sin(ang) * dist)
      if (!this.isWall(wx, wy)) continue
      const tag = `${Math.floor(wx / CS)},${Math.floor(wy / CS)},${wx},${wy}`
      if (this.posterWalls.has(tag)) continue
      this.posterWalls.add(tag)
      this.transientSprites.push({
        kind: 'poster',
        x: wx + 0.5,
        y: wy + 0.5,
        scale: 0.62,
        floor: false,
        alive: true,
        vx: 0,
        vy: 0,
        ttl: -1,
        born: 0,
      })
      return
    }
    audio.distantThud(Math.random() * 2 - 1)
  }

  private spawnSilhouette() {
    this.silCooldown = CONFIG.SILHOUETTE_COOLDOWN
    const ang0 = Math.atan2(this.dirY, this.dirX)
    const ang = ang0 + (Math.random() - 0.5) * 1.0

    if (this.theme.id === 3) {
      // partygoer: motionless at the edge of draw distance, gone in a blink
      const dist = this.theme.maxDepth * (0.7 + Math.random() * 0.15)
      this.transientSprites.push({
        kind: 'partier',
        x: this.posX + Math.cos(ang) * dist,
        y: this.posY + Math.sin(ang) * dist,
        scale: 1.05,
        floor: true,
        alive: true,
        vx: 0,
        vy: 0,
        ttl: 0.4,
        born: 0,
      })
      return // no audio cut — the waltz plays on; that is worse
    }

    const dist = this.theme.maxDepth * (0.62 + Math.random() * 0.18)
    const sx = this.posX + Math.cos(ang) * dist
    const sy = this.posY + Math.sin(ang) * dist
    const perp = ang + Math.PI / 2
    const speed = 7.5 * (Math.random() < 0.5 ? 1 : -1)
    this.transientSprites.push({
      kind: 'silhouette',
      x: sx,
      y: sy,
      scale: 1.15,
      floor: true,
      alive: true,
      vx: Math.cos(perp) * speed,
      vy: Math.sin(perp) * speed,
      ttl: 0.75,
      born: 0,
    })
    audio.cutHum(2) // the hum cuts out — the silence is the scare
  }

  /* ----------------------------------------------------------- lost state */

  private updateLost(dt: number) {
    this.lostTimer += dt
    if (this.lostTimer > 4.2) {
      const pcx = Math.floor(this.posX / CS)
      const pcy = Math.floor(this.posY / CS)
      const ncx = pcx + 6 + ((this.frame >>> 4) % 5)
      const ncy = pcy - 4 - ((this.frame >>> 5) % 5)
      const c = this.getChunk(ncx, ncy)
      this.posX = ncx * CS + (c.spawn % CS) + 0.5
      this.posY = ncy * CS + Math.floor(c.spawn / CS) + 0.5
      this.sanity = CONFIG.SANITY_LOST_RESPAWN
      this.state = 'play'
      audio.setHum(0.5, 2)
      this.pushHud()
    }
  }

  /* --------------------------------------------------------------- render */

  private render() {
    const buf = this.frameBuf
    const bob = this.state === 'lost' || this.reduced ? 0 : Math.sin(this.bobPhase) * CONFIG.BOB_AMOUNT * this.h
    const horizon = (this.h / 2 + bob) | 0

    this.castFloorCeiling(buf, horizon)
    this.drawDecals(buf, horizon)
    this.castWalls(buf, horizon)
    this.drawSprites(buf, horizon)

    if (this.state === 'lost') {
      const f = Math.min(1, this.lostTimer / 1.0)
      this.fadeToBlack(buf, f * 0.94)
    } else if (this.state === 'descending') {
      const dur = this.reduced ? CONFIG.DESCENT_FADE_REDUCED : CONFIG.DESCENT_FADE
      this.fadeToBlack(buf, Math.min(1, this.descendTimer / dur))
    } else if (this.state === 'warping') {
      const dur = this.reduced ? CONFIG.POSTER_TRANSITION * 0.5 : CONFIG.POSTER_TRANSITION
      this.fadeToBlack(buf, Math.min(1, this.warpTimer / dur))
    }
  }

  private fadeToBlack(buf: Uint32Array, f: number) {
    const keep = 1 - f
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i]
      const r = ((c & 255) * keep) | 0
      const g = (((c >> 8) & 255) * keep) | 0
      const b = (((c >> 16) & 255) * keep) | 0
      buf[i] = (255 << 24) | (b << 16) | (g << 8) | r
    }
  }

  private castFloorCeiling(buf: Uint32Array, horizon: number) {
    const w = this.w
    const h = this.h
    const rayDirX0 = this.dirX - this.planeX
    const rayDirY0 = this.dirY - this.planeY
    const rayDirX1 = this.dirX + this.planeX
    const rayDirY1 = this.dirY + this.planeY
    const posZ = 0.5 * h
    const carpet = this.set.floor
    const ceil = this.set.ceiling
    const dim = this.dimTimer > 0 ? 1 - CONFIG.DIM_AMOUNT : 1
    const amb = Math.max(0.3, this.theme.ambient * this.lightLevel) // floor: never pitch black
    const maxD = this.theme.maxDepth
    const wobble = this.reduced ? 1 : 1 + Math.sin(this.flickerT * 4.1) * 0.025 + Math.sin(this.flickerT * 1.3) * 0.02
    const cl = this.theme.ceiling

    for (let y = horizon < 0 ? 0 : horizon; y < h; y += 2) {
      const p = y - h / 2 + 0.5
      if (p === 0) continue
      const rowDist = posZ / p
      const stepX = (rowDist * (rayDirX1 - rayDirX0)) / w
      const stepY = (rowDist * (rayDirY1 - rayDirY0)) / w
      let fx = this.posX + rowDist * rayDirX0
      let fy = this.posY + rowDist * rayDirY0
      const ceilY = 2 * horizon - y
      const shade = Math.max(0.12, 1.25 - rowDist / (maxD * 0.62))
      const floorShade = shade * 0.82 * amb
      const ceilShadeBase = shade

      for (let x = 0; x < w; x++) {
        const tx = ((fx - Math.floor(fx)) * TEX) | 0
        const ty = ((fy - Math.floor(fy)) * TEX) | 0
        const ti = ty * TEX + tx

        // floor
        let c = carpet.px[ti]
        {
          const r = Math.min(255, (c & 255) * floorShade) | 0
          const g = Math.min(255, (((c >> 8) & 255) * floorShade)) | 0
          const b = Math.min(255, (((c >> 16) & 255) * floorShade)) | 0
          const px = (255 << 24) | (b << 16) | (g << 8) | r
          buf[y * w + x] = px
          if (y + 1 < h) buf[(y + 1) * w + x] = px
        }

        // ceiling (mirrored)
        if (ceilY >= 0 && ceilY < h) {
          const cellX = Math.floor(fx)
          const cellY = Math.floor(fy)
          const lx = ((cellX % cl.modX) + cl.modX) % cl.modX
          const ly = ((cellY % cl.modY) + cl.modY) % cl.modY
          const isLight = lx === cl.cellX && ly === cl.cellY
          c = ceil.px[ti]
          let s = ceilShadeBase * 0.7 * amb
          let warmR = 0
          let warmG = 0
          let warmB = 0
          if (isLight) {
            const dxc = fx - (cellX + 0.5)
            const dyc = fy - (cellY + 0.5)
            const glow = Math.max(0, 1 - Math.sqrt(dxc * dxc + dyc * dyc) * 1.5)
            s = ceilShadeBase * (0.85 + glow * 1.15 * cl.strength) * dim * wobble * amb
            if (cl.red) {
              warmR = glow * 46 * dim * this.lightLevel
              warmG = glow * 6 * dim * this.lightLevel
            } else {
              warmR = glow * 26 * dim * this.lightLevel
              warmG = glow * 24 * dim * this.lightLevel
              warmB = glow * 15 * dim * this.lightLevel
            }
          }
          let r = (c & 255) * s + warmR
          let g = ((c >> 8) & 255) * s + warmG
          let b = ((c >> 16) & 255) * s + warmB
          // Level Fun: some lit panels glow queasy pink, some queasy teal
          const ct = this.theme.ceilingTint
          if (ct && isLight) {
            const tm = (((cellX + cellY) % ct.mod) + ct.mod) % ct.mod
            if (tm === 0) {
              r *= ct.pink[0]
              g *= ct.pink[1]
              b *= ct.pink[2]
            } else if (tm === ct.mod >> 1) {
              r *= ct.teal[0]
              g *= ct.teal[1]
              b *= ct.teal[2]
            }
          }
          if (r > 255) r = 255
          if (g > 255) g = 255
          if (b > 255) b = 255
          const px = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)
          buf[ceilY * w + x] = px
          if (ceilY - 1 >= 0) buf[(ceilY - 1) * w + x] = px
        }

        fx += stepX
        fy += stepY
      }
    }
    // rows above horizon that the mirror didn't cover
    for (let y = 0; y < Math.max(0, 2 * horizon - h + 1); y++) {
      for (let x = 0; x < w; x++) buf[y * w + x] = 0xff100d0a
    }
  }

  /** Floor decals (the dry rectangle) — rasterized before walls so walls
   *  naturally occlude them. */
  private drawDecals(buf: Uint32Array, horizon: number) {
    const pcx = Math.floor(this.posX / CS)
    const pcy = Math.floor(this.posY / CS)
    const invDet = 1 / (this.planeX * this.dirY - this.dirX * this.planeY)
    const w = this.w
    const h = this.h
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const chunk = this.chunks.get(chunkKey(pcx + dx, pcy + dy))
        if (!chunk || chunk.decals.length === 0) continue
        for (const d of chunk.decals) {
          this.rasterDecal(buf, horizon, invDet, pcx + dx, pcy + dy, d, w, h)
        }
      }
    }
  }

  private rasterDecal(buf: Uint32Array, horizon: number, invDet: number, ccx: number, ccy: number, d: DecalSpec, w: number, h: number) {
    // project the four floor-plane corners
    const corners = [
      [ccx * CS + d.x0, ccy * CS + d.y0],
      [ccx * CS + d.x1, ccy * CS + d.y0],
      [ccx * CS + d.x1, ccy * CS + d.y1],
      [ccx * CS + d.x0, ccy * CS + d.y1],
    ]
    const pts: [number, number][] = []
    for (const [wx, wy] of corners) {
      const sx = wx - this.posX
      const sy = wy - this.posY
      const transformX = invDet * (this.dirY * sx - this.dirX * sy)
      const transformY = invDet * (-this.planeY * sx + this.planeX * sy)
      if (transformY < 0.15 || transformY > this.theme.maxDepth) return
      pts.push([(w / 2) * (1 + transformX / transformY), horizon + (0.5 * h) / transformY])
    }
    // dry carpet color — one perfectly clean, lighter rectangle
    const dr = 168
    const dg = 152
    const db = 92
    const alpha = 0.5 * this.theme.ambient * this.lightLevel
    if (alpha <= 0.02) return
    const minX = Math.max(0, Math.floor(Math.min(pts[0][0], pts[1][0], pts[2][0], pts[3][0])))
    const maxX = Math.min(w - 1, Math.ceil(Math.max(pts[0][0], pts[1][0], pts[2][0], pts[3][0])))
    const minY = Math.max(horizon, Math.floor(Math.min(pts[0][1], pts[1][1], pts[2][1], pts[3][1])))
    const maxY = Math.min(h - 1, Math.ceil(Math.max(pts[0][1], pts[1][1], pts[2][1], pts[3][1])))
    if (maxX < minX || maxY < minY) return
    const edge = (a: [number, number], b: [number, number], px: number, py: number) =>
      (px - a[0]) * (b[1] - a[1]) - (py - a[1]) * (b[0] - a[0])
    const area1 = edge(pts[0], pts[1], pts[2][0], pts[2][1])
    const area2 = edge(pts[0], pts[2], pts[3][0], pts[3][1])
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const inTri1 =
          (area1 >= 0 &&
            edge(pts[0], pts[1], px, py) >= 0 &&
            edge(pts[1], pts[2], px, py) >= 0 &&
            edge(pts[2], pts[0], px, py) >= 0) ||
          (area1 < 0 &&
            edge(pts[0], pts[1], px, py) <= 0 &&
            edge(pts[1], pts[2], px, py) <= 0 &&
            edge(pts[2], pts[0], px, py) <= 0)
        const inTri2 =
          (area2 >= 0 &&
            edge(pts[0], pts[2], px, py) >= 0 &&
            edge(pts[2], pts[3], px, py) >= 0 &&
            edge(pts[3], pts[0], px, py) >= 0) ||
          (area2 < 0 &&
            edge(pts[0], pts[2], px, py) <= 0 &&
            edge(pts[2], pts[3], px, py) <= 0 &&
            edge(pts[3], pts[0], px, py) <= 0)
        if (!inTri1 && !inTri2) continue
        const i = py * w + px
        const dst = buf[i]
        const or = dst & 255
        const og = (dst >> 8) & 255
        const ob = (dst >> 16) & 255
        const nr = (dr * alpha + or * (1 - alpha)) | 0
        const ng = (dg * alpha + og * (1 - alpha)) | 0
        const nb = (db * alpha + ob * (1 - alpha)) | 0
        buf[i] = (255 << 24) | (nb << 16) | (ng << 8) | nr
      }
    }
  }

  private castWalls(buf: Uint32Array, horizon: number) {
    const w = this.w
    const h = this.h
    const amb = Math.max(0.3, this.theme.ambient * this.lightLevel) // floor: never pitch black
    const maxD = this.theme.maxDepth
    const warm = this.theme.warmTint
    for (let x = 0; x < w; x++) {
      const cameraX = (2 * x) / w - 1
      const rayDirX = this.dirX + this.planeX * cameraX
      const rayDirY = this.dirY + this.planeY * cameraX

      let mapX = Math.floor(this.posX)
      let mapY = Math.floor(this.posY)
      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX)
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY)
      let stepX: number
      let stepY: number
      let sideDistX: number
      let sideDistY: number
      if (rayDirX < 0) {
        stepX = -1
        sideDistX = (this.posX - mapX) * deltaDistX
      } else {
        stepX = 1
        sideDistX = (mapX + 1 - this.posX) * deltaDistX
      }
      if (rayDirY < 0) {
        stepY = -1
        sideDistY = (this.posY - mapY) * deltaDistY
      } else {
        stepY = 1
        sideDistY = (mapY + 1 - this.posY) * deltaDistY
      }

      let side = 0
      let hit = false
      let guard = 0
      while (!hit && guard++ < 128) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX
          mapX += stepX
          side = 0
        } else {
          sideDistY += deltaDistY
          mapY += stepY
          side = 1
        }
        if (this.isWall(mapX, mapY)) hit = true
      }

      const perp =
        side === 0
          ? (mapX - this.posX + (1 - stepX) / 2) / (rayDirX || 1e-9)
          : (mapY - this.posY + (1 - stepY) / 2) / (rayDirY || 1e-9)
      this.zbuf[x] = perp

      const lineHeight = h / perp
      const drawStart = horizon - lineHeight / 2
      const drawEnd = horizon + lineHeight / 2
      const y0 = drawStart < 0 ? 0 : drawStart | 0
      const y1 = drawEnd > h ? h : drawEnd | 0

      let wallX = side === 0 ? this.posY + perp * rayDirY : this.posX + perp * rayDirX
      wallX -= Math.floor(wallX)
      let texX = (wallX * TEX) | 0
      if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) texX = TEX - texX - 1

      const wall = this.wallTexAt(mapX, mapY)
      const wpx = wall.px
      const step = TEX / lineHeight
      let texPos = (y0 - drawStart) * step
      let shade = Math.max(0.1, 1.3 - perp / (maxD * 0.55)) * amb
      if (side === 1) shade *= 0.74
      if (this.dimTimer > 0) shade *= 0.9
      // Level 2 heat: close walls glow warm
      const heat = warm > 0 ? Math.max(0, 1 - perp / 4) * warm : 0

      for (let y = y0; y < y1; y++) {
        const texY = texPos | 0
        texPos += step
        const c = wpx[(texY & (TEX - 1)) * TEX + texX]
        let r = (c & 255) * shade + heat * 46
        let g = ((c >> 8) & 255) * shade + heat * 12
        let b = ((c >> 16) & 255) * shade
        if (r > 255) r = 255
        if (g > 255) g = 255
        if (b > 255) b = 255
        buf[y * w + x] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)
      }
    }
  }

  private drawSprites(buf: Uint32Array, horizon: number) {
    const w = this.w
    const h = this.h
    const dl = this.drawList
    dl.length = 0
    const pcx = Math.floor(this.posX / CS)
    const pcy = Math.floor(this.posY / CS)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.chunkSprites.get(chunkKey(pcx + dx, pcy + dy))
        if (!list) continue
        for (const s of list) {
          if (!s.alive) continue
          const ddx = s.x - this.posX
          const ddy = s.y - this.posY
          dl.push({ s, d: ddx * ddx + ddy * ddy })
        }
      }
    }
    for (const s of this.transientSprites) {
      if (!s.alive) continue
      const ddx = s.x - this.posX
      const ddy = s.y - this.posY
      dl.push({ s, d: ddx * ddx + ddy * ddy })
    }
    dl.sort((a, b) => b.d - a.d)

    const invDet = 1 / (this.planeX * this.dirY - this.dirX * this.planeY)
    const maxD = this.theme.maxDepth
    const amb = Math.max(0.3, this.theme.ambient * this.lightLevel) // floor: never pitch black
    for (const { s } of dl) {
      let spriteX = s.x - this.posX
      let spriteY = s.y - this.posY
      // loose balloons drift on a draft nobody feels
      if (s.kind === 'balloon' && !this.reduced) {
        spriteX += Math.sin(this.seconds * 0.5 + s.x * 3.7) * 0.12
        spriteY += Math.cos(this.seconds * 0.4 + s.y * 2.9) * 0.12
      }
      const transformX = invDet * (this.dirY * spriteX - this.dirX * spriteY)
      const transformY = invDet * (-this.planeY * spriteX + this.planeX * spriteY)
      if (transformY < 0.18 || transformY > maxD) continue

      const tex = this.texFor(s.kind)
      const screenX = ((w / 2) * (1 + transformX / transformY)) | 0

      // steam plumes grow and fade over their lifetime
      let scale = s.scale
      let aMul = 1
      if (s.kind === 'steam') {
        const t = (this.seconds - s.born) / CONFIG.STEAM_DURATION
        scale = s.scale * (0.7 + t * 1.6)
        aMul = Math.max(0, 1 - t) * 0.9
      }

      const spriteH = Math.abs((h / transformY) * scale)
      const spriteW = spriteH * (tex.w / tex.h)

      let drawEndY: number
      let drawStartY: number
      if (s.floor) {
        drawEndY = horizon + (0.5 * h) / transformY
        drawStartY = drawEndY - spriteH
      } else if (s.kind === 'balloon') {
        drawStartY = horizon - spriteH * 1.7 // adrift near the ceiling
        drawEndY = drawStartY + spriteH
      } else {
        drawStartY = horizon - spriteH * 0.85
        drawEndY = drawStartY + spriteH
      }
      const drawStartX = screenX - spriteW / 2
      const drawEndX = screenX + spriteW / 2
      const x0 = Math.max(0, drawStartX | 0)
      const x1 = Math.min(w, drawEndX | 0)

      const shadeBase =
        s.kind === 'silhouette' || s.kind === 'partier'
          ? 1
          : Math.max(0.25, 1.3 - transformY / (maxD * 0.5)) * (s.kind === 'steam' ? 1 : amb)
      let glow = s.kind === 'document' || s.kind === 'almond' ? 0.25 : 0
      if (s.kind === 'stairwell') {
        // a slow breathe — 3s cycle, still understated (static when reduced)
        glow = this.reduced
          ? 0.14
          : 0.1 + CONFIG.STAIR_GLOW * 0.55 * (0.5 + 0.5 * Math.sin((this.seconds / CONFIG.STAIR_BREATHE_SECONDS) * Math.PI * 2))
      }
      const dimMul = this.dimTimer > 0 ? 0.85 : 1

      for (let x = x0; x < x1; x++) {
        if (transformY >= this.zbuf[x]) continue
        const texX = (((x - drawStartX) / spriteW) * tex.w) | 0
        if (texX < 0 || texX >= tex.w) continue
        const yStart = Math.max(0, drawStartY | 0)
        const yEnd = Math.min(h, drawEndY | 0)
        for (let y = yStart; y < yEnd; y++) {
          const texY = (((y - drawStartY) / spriteH) * tex.h) | 0
          if (texY < 0 || texY >= tex.h) continue
          const c = tex.px[texY * tex.w + texX]
          let a = ((c >>> 24) & 255) * aMul
          if (a < 12) continue
          let shade = shadeBase * dimMul + glow
          if (shade > 1.6) shade = 1.6
          const r = Math.min(255, ((c & 255) * shade) | 0)
          const g = Math.min(255, ((((c >> 8) & 255) * shade) | 0))
          const b = Math.min(255, ((((c >> 16) & 255) * shade) | 0))
          const i = y * w + x
          if (a > 235) {
            buf[i] = (255 << 24) | (b << 16) | (g << 8) | r
          } else {
            const af = a / 255
            const dst = buf[i]
            const dr2 = dst & 255
            const dg2 = (dst >> 8) & 255
            const db2 = (dst >> 16) & 255
            const nr = (r * af + dr2 * (1 - af)) | 0
            const ng = (g * af + dg2 * (1 - af)) | 0
            const nb = (b * af + db2 * (1 - af)) | 0
            buf[i] = (255 << 24) | (nb << 16) | (ng << 8) | nr
          }
          a = 0 // (a consumed)
        }
      }
    }
  }

  private texFor(kind: SpriteKind): PixTex {
    const t = this.spriteTex
    switch (kind) {
      case 'almond':
        return t.almond
      case 'document':
        return t.document
      case 'exit':
        return t.door
      case 'poster':
        return t.poster
      case 'silhouette':
        return t.silhouette
      case 'stairwell':
        return t.stairwell
      case 'crate':
        return t.crate
      case 'steam':
        return t.steam
      case 'chairs':
        return t.chairs
      case 'cooler':
        return t.cooler
      case 'sign':
        return t.sign
      case 'chair':
        return t.chair
      case 'sadposter':
        return t.sadPoster
      case 'balloons':
        return t.balloons
      case 'ptable':
        return t.ptable
      case 'balloon':
        return t.balloon
      case 'partier':
        return t.partier
    }
  }

  /* ----------------------------------------------------- post-processing */

  private postProcess() {
    const w = this.w
    const h = this.h
    const src = this.frameBuf
    const dst = this.outBuf
    const sanityLoss = 1 - this.sanity / 100
    const desat = sanityLoss * 0.55
    const grainAmp = (this.reduced ? 5 : 10) + sanityLoss * (this.reduced ? 10 : 26)
    const grainShift = this.reduced ? 0 : (this.frame * 7919) & 65535
    const haze = this.hazeTimer > 0 ? this.hazeTimer / 0.6 : 0

    // stairwell draft — cool edge bloom pulsing on a 5s cycle (skipped when reduced)
    const draft =
      this.reduced || this.draftProx <= 0
        ? 0
        : CONFIG.DRAFT_BLOOM_ALPHA * this.draftProx * (0.5 + 0.5 * Math.sin((this.seconds / CONFIG.DRAFT_PULSE_SECONDS) * Math.PI * 2))
    // Level Fun hue drift — 48s warm<->cool cycle, far below flash thresholds
    const hueMul = this.theme.hueDrift ? Math.sin((this.seconds / CONFIG.HUE_DRIFT_SECONDS) * Math.PI * 2) * 0.05 * (this.reduced ? 0.5 : 1) : 0

    let tearY0 = -1
    let tearY1 = -1
    let tearShift = 0
    if (!this.reduced && this.state !== 'lost' && this.frame % 211 === 97 && Math.random() < 0.5) {
      tearY0 = (Math.random() * h * 0.7) | 0
      tearY1 = tearY0 + 3 + ((Math.random() * 7) | 0)
      tearShift = (((Math.random() * 9) | 0) - 4) * 2
    }
    if (this.state === 'lost' && !this.reduced) {
      tearY0 = (Math.random() * h * 0.8) | 0
      tearY1 = tearY0 + 6 + ((Math.random() * 12) | 0)
      tearShift = (((Math.random() * 13) | 0) - 6) * 3
    }

    for (let y = 0; y < h; y++) {
      const row = y * w
      const inTear = y >= tearY0 && y < tearY1
      const scanline = (y & 1) === 0 ? 0.92 : 1
      for (let x = 0; x < w; x++) {
        let sx = x
        if (inTear) {
          sx = x - tearShift
          if (sx < 0) sx = 0
          else if (sx >= w) sx = w - 1
        }
        const i = row + x
        const c = src[row + sx]

        const edge = Math.abs(x / w - 0.5) * 2
        let r: number
        let b: number
        if (edge > 0.55) {
          const off = edge > 0.8 ? 2 : 1
          const cr = src[row + Math.max(0, sx - off)]
          const cb = src[row + Math.min(w - 1, sx + off)]
          r = cr & 255
          b = (cb >> 16) & 255
        } else {
          r = c & 255
          b = (c >> 16) & 255
        }
        let g = (c >> 8) & 255

        if (desat > 0.01) {
          const luma = r * 0.299 + g * 0.587 + b * 0.114
          r += (luma - r) * desat
          g += (luma - g) * desat
          b += (luma - b) * desat
        }

        const gn = (this.grainTable[(i + grainShift) & 65535] - 128) * (grainAmp / 128)
        r += gn
        g += gn
        b += gn

        const v = this.vignette[i] * scanline
        r *= v
        g *= v
        b *= v

        // steam haze at the screen edges (never white-out: capped low)
        if (haze > 0) {
          const hz = haze * edge * edge * 26
          r += hz
          g += hz
          b += hz
        }

        // stairwell draft — a cool breath at the screen edges
        if (draft > 0 && edge > 0.55) {
          const dz = draft * edge * edge
          r += dz * 20
          g += dz * 44
          b += dz * 58
        }

        // Level Fun hue drift (±5%, one cycle per 48 seconds)
        if (hueMul !== 0) {
          r *= 1 + hueMul
          g *= 1 + hueMul * 0.3
          b *= 1 - hueMul
        }

        dst[i] =
          (255 << 24) |
          ((b > 255 ? 255 : b < 0 ? 0 : b | 0) << 16) |
          ((g > 255 ? 255 : g < 0 ? 0 : g | 0) << 8) |
          (r > 255 ? 255 : r < 0 ? 0 : r | 0)
      }
    }
  }

  private drawCenteredText(msg: string, size = 11) {
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = '#d8d2c0'
    ctx.font = `${size}px ui-monospace, "Courier New", monospace`
    ctx.textAlign = 'center'
    ctx.fillText(msg, this.w / 2, this.h / 2)
    ctx.restore()
  }

  private pushHud() {
    this.cb.onHud({
      sanity: Math.round(this.sanity),
      almond: this.almond,
      seconds: this.getSeconds(),
      files: this.foundAtStart.length + this.pickedDocIds.size,
      paused: this.state !== 'play',
    })
  }
}
