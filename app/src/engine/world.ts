/* ============================================================================
 * Infinite procedural maze — 16x16 chunks from a seeded hash.
 * Three generator variants:
 *   office    — Level 0: irregular rooms, pillars, special rooms, wall variety
 *   warehouse — Level 1: big open halls, regular pillar grids, aisle walls
 *   pipes     — Level 2: winding corridors 1-2 wide, long bends, alcoves
 * Every variant guarantees shared edge openings + flood-fill connectivity.
 * ==========================================================================*/

import { CONFIG } from '@/config'

const CS = CONFIG.CHUNK_SIZE

export type GenKind = 'office' | 'warehouse' | 'pipes' | 'party'
export type PropKind = 'chairs' | 'cooler' | 'sign' | 'chair' | 'balloons' | 'ptable'

export interface PropSpec {
  lx: number
  ly: number
  kind: PropKind
}

export interface DecalSpec {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Chunk {
  grid: Uint8Array // CS*CS, 1 = wall
  wallVar: Uint8Array // CS*CS, index into LevelTexSet.walls
  connected: number[] // open cells in the main connected region
  spawn: number // connected cell index nearest the chunk center
  props: PropSpec[]
  decals: DecalSpec[]
}

export function hash3(x: number, y: number, seed: number): number {
  let h = seed >>> 0
  h = Math.imul(h ^ (x >>> 0), 2654435761)
  h = Math.imul(h ^ (y >>> 0), 2246822519)
  h ^= h >>> 13
  h = Math.imul(h, 3266489917)
  h ^= h >>> 16
  return h >>> 0
}

function rngFrom(h: number) {
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Openings on the boundary shared by chunk (cx,cy) and its +x neighbor. */
function eastEdgeOpenings(cx: number, cy: number, seed: number): boolean[] {
  const r = rngFrom(hash3(cx * 2 + 1, cy * 7 - 3, seed ^ 0x9e3779b9))
  const open = new Array<boolean>(CS).fill(false)
  let count = 0
  for (let i = 1; i < CS - 1; i++) {
    if (r() < 0.3) {
      open[i] = true
      count++
    }
  }
  while (count < 2) {
    const i = 1 + Math.floor(r() * (CS - 2))
    if (!open[i]) {
      open[i] = true
      count++
    }
  }
  return open
}

/** Openings on the boundary shared by chunk (cx,cy) and its +y neighbor. */
function southEdgeOpenings(cx: number, cy: number, seed: number): boolean[] {
  const r = rngFrom(hash3(cx * 5 - 11, cy * 3 + 2, seed ^ 0x85ebca77))
  const open = new Array<boolean>(CS).fill(false)
  let count = 0
  for (let i = 1; i < CS - 1; i++) {
    if (r() < 0.3) {
      open[i] = true
      count++
    }
  }
  while (count < 2) {
    const i = 1 + Math.floor(r() * (CS - 2))
    if (!open[i]) {
      open[i] = true
      count++
    }
  }
  return open
}

/** Pipe-tunnel edges: sparser openings so corridors stay narrow and rare. */
function eastEdgeOpeningsPipes(cx: number, cy: number, seed: number): boolean[] {
  const r = rngFrom(hash3(cx * 2 + 1, cy * 7 - 3, seed ^ 0x9e3779b9 ^ 0x51a7))
  const open = new Array<boolean>(CS).fill(false)
  let count = 0
  for (let i = 1; i < CS - 1; i++) {
    if (r() < 0.14) {
      open[i] = true
      count++
    }
  }
  while (count < 1) {
    const i = 1 + Math.floor(r() * (CS - 2))
    if (!open[i]) {
      open[i] = true
      count++
    }
  }
  return open
}

function southEdgeOpeningsPipes(cx: number, cy: number, seed: number): boolean[] {
  const r = rngFrom(hash3(cx * 5 - 11, cy * 3 + 2, seed ^ 0x85ebca77 ^ 0x51a7))
  const open = new Array<boolean>(CS).fill(false)
  let count = 0
  for (let i = 1; i < CS - 1; i++) {
    if (r() < 0.14) {
      open[i] = true
      count++
    }
  }
  while (count < 1) {
    const i = 1 + Math.floor(r() * (CS - 2))
    if (!open[i]) {
      open[i] = true
      count++
    }
  }
  return open
}

interface GenAcc {
  grid: Uint8Array
  wallVar: Uint8Array
  props: PropSpec[]
  decals: DecalSpec[]
  cx: number
  cy: number
  seed: number
}

const idx = (x: number, y: number) => y * CS + x

/* ---------------------- wall variant assignment ------------------------ */

function assignVariants(acc: GenAcc, kind: GenKind) {
  const { grid, wallVar, cx, cy, seed } = acc
  for (let ly = 0; ly < CS; ly++) {
    for (let lx = 0; lx < CS; lx++) {
      const i = idx(lx, ly)
      if (grid[i] !== 1) continue
      const wx = cx * CS + lx
      const wy = cy * CS + ly
      // hash per 2x2 block so variants read as sections, not noise
      const h = hash3(wx >> 1, wy >> 1, seed ^ 0xa53f9c) % 100
      if (kind === 'office') {
        // 0 base ~70%, 1 damp, 2 fake door, 3 elevator, 4 graffiti; 5 = whiteboard (special rooms only)
        wallVar[i] = h < 70 ? 0 : h < 78 ? 1 : h < 84 ? 2 : h < 89 ? 3 : h < 94 ? 4 : 0
      } else if (kind === 'warehouse') {
        // 0 concrete ~70%, 1 stencil, 2 chain-link
        wallVar[i] = h < 70 ? 0 : h < 85 ? 1 : 2
      } else if (kind === 'pipes') {
        // 0 pipe wall ~72%, 1 valve cluster, 2 warning stripes
        wallVar[i] = h < 72 ? 0 : h < 86 ? 1 : 2
      } else {
        // party: 0 bunting wallpaper ~72%, 1 hand-drawn faces, 2 streamers
        wallVar[i] = h < 72 ? 0 : h < 86 ? 1 : 2
      }
    }
  }
}

/* ------------------------ border + edge openings ----------------------- */

function applyBorder(acc: GenAcc, kind: GenKind) {
  const { grid, cx, cy, seed } = acc
  for (let i = 0; i < CS; i++) {
    grid[idx(i, 0)] = 1
    grid[idx(i, CS - 1)] = 1
    grid[idx(0, i)] = 1
    grid[idx(CS - 1, i)] = 1
  }
  const pipes = kind === 'pipes'
  const eastFn = pipes ? eastEdgeOpeningsPipes : eastEdgeOpenings
  const southFn = pipes ? southEdgeOpeningsPipes : southEdgeOpenings
  const east = eastFn(cx, cy, seed)
  const west = eastFn(cx - 1, cy, seed)
  const south = southFn(cx, cy, seed)
  const north = southFn(cx, cy - 1, seed)
  for (let i = 1; i < CS - 1; i++) {
    if (east[i]) {
      grid[idx(CS - 1, i)] = 0
      grid[idx(CS - 2, i)] = 0
    }
    if (west[i]) {
      grid[idx(0, i)] = 0
      grid[idx(1, i)] = 0
    }
    if (south[i]) {
      grid[idx(i, CS - 1)] = 0
      grid[idx(i, CS - 2)] = 0
    }
    if (north[i]) {
      grid[idx(i, 0)] = 0
      grid[idx(i, 1)] = 0
    }
  }
  return { east, west, south, north }
}

/* ------------------------- connectivity repair ------------------------- */

function repairConnectivity(acc: GenAcc, openings: number[]): { connected: number[]; spawn: number } {
  const { grid } = acc
  const visited = new Uint8Array(CS * CS)
  if (openings.length > 0) {
    const queue: number[] = [openings[0]]
    visited[openings[0]] = 1
    let head = 0
    while (head < queue.length) {
      const cur = queue[head++]
      const x = cur % CS
      const y = (cur - x) / CS
      if (x + 1 < CS) tryVisit(x + 1, y)
      if (x - 1 >= 0) tryVisit(x - 1, y)
      if (y + 1 < CS) tryVisit(x, y + 1)
      if (y - 1 >= 0) tryVisit(x, y - 1)
    }
    function tryVisit(nx: number, ny: number) {
      const ni = ny * CS + nx
      if (!visited[ni] && grid[ni] === 0) {
        visited[ni] = 1
        queue.push(ni)
      }
    }
    const anchors = openings.concat([idx(CS / 2, CS / 2)])
    for (const o of anchors) {
      if (visited[o]) continue
      let x = o % CS
      let y = (o - x) / CS
      let guard = 0
      while (guard++ < CS * 3) {
        grid[idx(x, y)] = 0
        visited[idx(x, y)] = 1
        const cxDir = x < CS / 2 ? 1 : x > CS / 2 ? -1 : 0
        const cyDir = y < CS / 2 ? 1 : y > CS / 2 ? -1 : 0
        const nx = x + (guard % 2 === 0 ? cxDir : 0)
        const ny = y + (guard % 2 === 1 ? cyDir : 0)
        if (nx < 0 || ny < 0 || nx >= CS || ny >= CS) break
        const touches =
          (nx + 1 < CS && visited[idx(nx + 1, ny)] && grid[idx(nx + 1, ny)] === 0) ||
          (nx - 1 >= 0 && visited[idx(nx - 1, ny)] && grid[idx(nx - 1, ny)] === 0) ||
          (ny + 1 < CS && visited[idx(nx, ny + 1)] && grid[idx(nx, ny + 1)] === 0) ||
          (ny - 1 >= 0 && visited[idx(nx, ny - 1)] && grid[idx(nx, ny - 1)] === 0)
        x = nx
        y = ny
        if (touches) {
          grid[idx(x, y)] = 0
          visited[idx(x, y)] = 1
          break
        }
      }
    }
  }
  const connected: number[] = []
  let spawn = idx(CS / 2, CS / 2)
  let bestDist = Infinity
  for (let y = 0; y < CS; y++) {
    for (let x = 0; x < CS; x++) {
      const i = idx(x, y)
      if (grid[i] === 0 && visited[i]) {
        connected.push(i)
        const d = (x - CS / 2) * (x - CS / 2) + (y - CS / 2) * (y - CS / 2)
        if (d < bestDist) {
          bestDist = d
          spawn = i
        }
      }
    }
  }
  if (connected.length === 0) {
    grid[spawn] = 0
    connected.push(spawn)
  }
  return { connected, spawn }
}

/* ============================ OFFICE (Level 0) ========================= */

function genOffice(acc: GenAcc) {
  const { grid, cx, cy, seed } = acc
  const r = rngFrom(hash3(cx, cy, seed))

  // 1) sparse pillars
  for (let y = 1; y < CS - 1; y++) {
    for (let x = 1; x < CS - 1; x++) {
      if (r() < CONFIG.WALL_DENSITY * 0.22) grid[idx(x, y)] = 1
    }
  }

  // 2) wall segments with door gaps
  const segments = 3 + Math.floor(r() * 4)
  for (let s = 0; s < segments; s++) {
    const horiz = r() < 0.5
    const len = 3 + Math.floor(r() * 8)
    const gapAt = 1 + Math.floor(r() * Math.max(1, len - 2))
    const doubleGap = r() < 0.35
    if (horiz) {
      const y = 1 + Math.floor(r() * (CS - 2))
      const x0 = 1 + Math.floor(r() * Math.max(1, CS - 2 - len))
      for (let i = 0; i < len; i++) {
        if (i === gapAt || (doubleGap && i === gapAt + 1)) continue
        const x = x0 + i
        if (x > 0 && x < CS - 1) grid[idx(x, y)] = 1
      }
    } else {
      const x = 1 + Math.floor(r() * (CS - 2))
      const y0 = 1 + Math.floor(r() * Math.max(1, CS - 2 - len))
      for (let i = 0; i < len; i++) {
        if (i === gapAt || (doubleGap && i === gapAt + 1)) continue
        const y = y0 + i
        if (y > 0 && y < CS - 1) grid[idx(x, y)] = 1
      }
    }
  }

  // 3) occasional large open hall
  if (r() < 0.3) {
    const w = 4 + Math.floor(r() * 5)
    const h = 4 + Math.floor(r() * 5)
    const x0 = 2 + Math.floor(r() * Math.max(1, CS - 4 - w))
    const y0 = 2 + Math.floor(r() * Math.max(1, CS - 4 - h))
    for (let y = y0; y < y0 + h && y < CS - 1; y++)
      for (let x = x0; x < x0 + w && x < CS - 1; x++) grid[idx(x, y)] = 0
  }

  // 4) special rooms — the conference room & the dry rectangle
  if (r() < CONFIG.SPECIAL_ROOM_RATE) carveConferenceRoom(acc, r)
  if (r() < CONFIG.SPECIAL_ROOM_RATE) carveDryRectangle(acc, r)

  // 5) origin chunk gets a guaranteed open plaza
  if (cx === 0 && cy === 0) {
    for (let y = CS / 2 - 2; y <= CS / 2 + 2; y++)
      for (let x = CS / 2 - 2; x <= CS / 2 + 2; x++) grid[idx(x, y)] = 0
  }
}

/** "SEE YOU SOON" whiteboard room — pays off the logbook note, wording exact */
function carveConferenceRoom(acc: GenAcc, r: () => number) {
  const { grid, wallVar, props } = acc
  const w = 6 + Math.floor(r() * 3)
  const h = 4 + Math.floor(r() * 2)
  const x0 = 3 + Math.floor(r() * Math.max(1, CS - 6 - w))
  const y0 = 4 + Math.floor(r() * Math.max(1, CS - 7 - h))
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) grid[idx(x, y)] = 0
  // whiteboard on the north wall of the room (variant 5)
  for (let x = x0; x < x0 + w; x++) {
    const i = idx(x, y0 - 1)
    grid[i] = 1
    wallVar[i] = 5
  }
  // rows of chairs facing the board
  for (let ry = y0 + 1; ry < y0 + h - 1; ry += 2) {
    for (let rx = x0 + 1; rx < x0 + w - 1; rx += 2) {
      props.push({ lx: rx, ly: ry, kind: 'chair' })
    }
  }
  // doorway: corridor from room center toward chunk center
  carveCorridorTo(acc, x0 + ((w / 2) | 0), y0 + ((h / 2) | 0), CS / 2, CS / 2)
}

/** a room whose carpet carries one perfectly dry, lighter rectangle */
function carveDryRectangle(acc: GenAcc, r: () => number) {
  const { grid, decals } = acc
  const w = 4 + Math.floor(r() * 2)
  const h = 3 + Math.floor(r() * 2)
  const x0 = 3 + Math.floor(r() * Math.max(1, CS - 6 - w))
  const y0 = 3 + Math.floor(r() * Math.max(1, CS - 6 - h))
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) grid[idx(x, y)] = 0
  decals.push({ x0: x0 + 0.7, y0: y0 + 0.7, x1: x0 + w - 0.7, y1: y0 + h - 0.7 })
  carveCorridorTo(acc, x0 + ((w / 2) | 0), y0 + ((h / 2) | 0), CS / 2, CS / 2)
}

function carveCorridorTo(acc: GenAcc, x0: number, y0: number, x1: number, y1: number) {
  const { grid } = acc
  let x = x0
  let y = y0
  let guard = 0
  while ((x !== x1 || y !== y1) && guard++ < CS * 3) {
    grid[idx(x, y)] = 0
    if (guard % 2 === 0 && x !== x1) x += x < x1 ? 1 : -1
    else if (y !== y1) y += y < y1 ? 1 : -1
    else if (x !== x1) x += x < x1 ? 1 : -1
  }
  grid[idx(x1, y1)] = 0
}

/* ========================== WAREHOUSE (Level 1) ======================== */

function genWarehouse(acc: GenAcc) {
  const { grid, cx, cy, seed } = acc
  const r = rngFrom(hash3(cx, cy, seed ^ 0x51ed))

  // mostly open interior
  // (grid starts empty)

  // regular pillar grid — warehouse bays
  for (let y = 3; y < CS - 2; y += 4) {
    for (let x = 3; x < CS - 2; x += 4) {
      grid[idx(x, y)] = 1
      // some pillars are 2x2
      if (r() < 0.3 && x + 1 < CS - 1 && y + 1 < CS - 1) {
        grid[idx(x + 1, y)] = 1
        grid[idx(x, y + 1)] = 1
        grid[idx(x + 1, y + 1)] = 1
      }
    }
  }

  // long aisle walls with wide gaps
  const aisles = 1 + Math.floor(r() * 2)
  for (let a = 0; a < aisles; a++) {
    const y = 3 + Math.floor(r() * (CS - 6))
    const gap1 = 2 + Math.floor(r() * 5)
    const gap2 = CS - 7 + Math.floor(r() * 5)
    for (let x = 1; x < CS - 1; x++) {
      if (Math.abs(x - gap1) <= 1 || Math.abs(x - gap2) <= 1) continue
      grid[idx(x, y)] = 1
    }
  }

  // big open halls — clear pillars in a region
  if (r() < 0.55) {
    const w = 6 + Math.floor(r() * 5)
    const h = 5 + Math.floor(r() * 5)
    const x0 = 2 + Math.floor(r() * Math.max(1, CS - 4 - w))
    const y0 = 2 + Math.floor(r() * Math.max(1, CS - 4 - h))
    for (let y = y0; y < y0 + h && y < CS - 1; y++)
      for (let x = x0; x < x0 + w && x < CS - 1; x++) grid[idx(x, y)] = 0
  }

  if (cx === 0 && cy === 0) {
    for (let y = CS / 2 - 2; y <= CS / 2 + 2; y++)
      for (let x = CS / 2 - 2; x <= CS / 2 + 2; x++) grid[idx(x, y)] = 0
  }
}

/* ============================ PIPES (Level 2) ========================== */

function genPipes(acc: GenAcc) {
  const { grid, cx, cy, seed } = acc
  const r = rngFrom(hash3(cx, cy, seed ^ 0xb17e))

  // solid chunk; corridors carved by momentum walks between edge openings
  grid.fill(1)

  const east = eastEdgeOpeningsPipes(cx, cy, seed)
  const west = eastEdgeOpeningsPipes(cx - 1, cy, seed)
  const south = southEdgeOpeningsPipes(cx, cy, seed)
  const north = southEdgeOpeningsPipes(cx, cy - 1, seed)

  const openings: [number, number][] = []
  for (let i = 1; i < CS - 1; i++) {
    if (east[i]) openings.push([CS - 1, i])
    if (west[i]) openings.push([0, i])
    if (south[i]) openings.push([i, CS - 1])
    if (north[i]) openings.push([i, 0])
  }

  const carved = new Uint8Array(CS * CS)
  const carve = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= CS || y >= CS) return
    grid[idx(x, y)] = 0
    carved[idx(x, y)] = 1
  }

  if (openings.length === 0) {
    // should never happen — fall back to a plus-shaped crossing
    for (let i = 1; i < CS - 1; i++) {
      carve(i, CS / 2)
      carve(CS / 2, i)
    }
  } else {
    // shuffle openings deterministically and chain walks through them + center
    const targets = openings.slice()
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[targets[i], targets[j]] = [targets[j], targets[i]]
    }
    targets.push([CS / 2, CS / 2])

    let [sx, sy] = targets[0]
    carve(sx, sy)
    for (let t = 1; t < targets.length; t++) {
      const [tx, ty] = targets[t]
      let x = sx
      let y = sy
      let dx = r() < 0.5 ? 1 : 0
      let dy = dx === 0 ? 1 : 0
      if (r() < 0.5) {
        dx = -dx
        dy = -dy
      }
      let guard = 0
      while ((x !== tx || y !== ty) && guard++ < 400) {
        carve(x, y)
        // occasional width-2: carve a perpendicular neighbor
        if (r() < 0.14) carve(x + dy, y + dx)
        // occasional maintenance alcove
        if (r() < 0.05) {
          const aw = 1 + ((r() * 2) | 0)
          for (let ay = 0; ay < 2; ay++)
            for (let ax = 0; ax <= aw; ax++) {
              const px = Math.min(CS - 2, Math.max(1, x + ax - 1))
              const py = Math.min(CS - 2, Math.max(1, y + ay - 1))
              carve(px, py)
            }
        }
        // momentum walk — long bends: mostly keep direction, otherwise steer to target
        if (r() > 0.62) {
          const preferX = Math.abs(tx - x) > Math.abs(ty - y)
          if (preferX && tx !== x) {
            dx = tx > x ? 1 : -1
            dy = 0
          } else if (ty !== y) {
            dy = ty > y ? 1 : -1
            dx = 0
          } else {
            // aligned — pick a fresh perpendicular direction (creates the bend)
            if (dx !== 0) {
              dx = 0
              dy = r() < 0.5 ? 1 : -1
            } else {
              dy = 0
              dx = r() < 0.5 ? 1 : -1
            }
          }
        }
        let nx = x + dx
        let ny = y + dy
        // clamp to interior-ish; edge openings may sit on the border
        if (nx < 0 || nx >= CS || ny < 0 || ny >= CS) {
          nx = Math.min(CS - 1, Math.max(0, nx))
          ny = Math.min(CS - 1, Math.max(0, ny))
          dx = -dx
          dy = -dy
        }
        x = nx
        y = ny
      }
      carve(tx, ty)
      sx = tx
      sy = ty
    }
  }

  // reopen the shared edge openings (walks may have missed the exact border cells)
  for (let i = 1; i < CS - 1; i++) {
    if (east[i]) {
      carve(CS - 1, i)
      carve(CS - 2, i)
    }
    if (west[i]) {
      carve(0, i)
      carve(1, i)
    }
    if (south[i]) {
      carve(i, CS - 1)
      carve(i, CS - 2)
    }
    if (north[i]) {
      carve(i, 0)
      carve(i, 1)
    }
  }

  if (cx === 0 && cy === 0) {
    for (let y = CS / 2 - 1; y <= CS / 2 + 1; y++)
      for (let x = CS / 2 - 1; x <= CS / 2 + 1; x++) carve(x, y)
  }
}

/* ============================ PARTY (Level Fun) ======================== */

/** Office-like, but the party wants room: sparser pillars, bigger halls,
 *  occasional long banquet corridors. Connectivity is repaired as usual. */
function genParty(acc: GenAcc) {
  const { grid, cx, cy, seed } = acc
  const r = rngFrom(hash3(cx, cy, seed ^ 0xf00d))

  // 1) very sparse pillars
  for (let y = 1; y < CS - 1; y++) {
    for (let x = 1; x < CS - 1; x++) {
      if (r() < CONFIG.WALL_DENSITY * 0.14) grid[idx(x, y)] = 1
    }
  }

  // 2) a few short partition walls with wide gaps
  const segments = 2 + Math.floor(r() * 3)
  for (let s = 0; s < segments; s++) {
    const horiz = r() < 0.5
    const len = 3 + Math.floor(r() * 6)
    const gapAt = 1 + Math.floor(r() * Math.max(1, len - 2))
    const doubleGap = r() < 0.5
    if (horiz) {
      const y = 1 + Math.floor(r() * (CS - 2))
      const x0 = 1 + Math.floor(r() * Math.max(1, CS - 2 - len))
      for (let i = 0; i < len; i++) {
        if (i === gapAt || (doubleGap && i === gapAt + 1)) continue
        const x = x0 + i
        if (x > 0 && x < CS - 1) grid[idx(x, y)] = 1
      }
    } else {
      const x = 1 + Math.floor(r() * (CS - 2))
      const y0 = 1 + Math.floor(r() * Math.max(1, CS - 2 - len))
      for (let i = 0; i < len; i++) {
        if (i === gapAt || (doubleGap && i === gapAt + 1)) continue
        const y = y0 + i
        if (y > 0 && y < CS - 1) grid[idx(x, y)] = 1
      }
    }
  }

  // 3) party halls — larger and more common than office open halls
  if (r() < 0.6) {
    const w = 6 + Math.floor(r() * 6)
    const h = 5 + Math.floor(r() * 6)
    const x0 = 2 + Math.floor(r() * Math.max(1, CS - 4 - w))
    const y0 = 2 + Math.floor(r() * Math.max(1, CS - 4 - h))
    for (let y = y0; y < y0 + h && y < CS - 1; y++)
      for (let x = x0; x < x0 + w && x < CS - 1; x++) grid[idx(x, y)] = 0
  }

  // 4) banquet corridor — a long 2-wide hall spanning the whole chunk
  if (r() < 0.35) {
    if (r() < 0.5) {
      const y = 3 + Math.floor(r() * (CS - 7))
      for (let x = 1; x < CS - 1; x++) {
        grid[idx(x, y)] = 0
        grid[idx(x, y + 1)] = 0
      }
    } else {
      const x = 3 + Math.floor(r() * (CS - 7))
      for (let y = 1; y < CS - 1; y++) {
        grid[idx(x, y)] = 0
        grid[idx(x + 1, y)] = 0
      }
    }
  }

  // 5) origin chunk: the big hall you arrive in
  if (cx === 0 && cy === 0) {
    for (let y = CS / 2 - 3; y <= CS / 2 + 3; y++)
      for (let x = CS / 2 - 3; x <= CS / 2 + 3; x++) grid[idx(x, y)] = 0
  }
}

/* ============================== entry point =========================== */

export function generateChunk(cx: number, cy: number, seed: number, kind: GenKind): Chunk {
  const acc: GenAcc = {
    grid: new Uint8Array(CS * CS),
    wallVar: new Uint8Array(CS * CS),
    props: [],
    decals: [],
    cx,
    cy,
    seed,
  }

  if (kind === 'office') genOffice(acc)
  else if (kind === 'warehouse') genWarehouse(acc)
  else if (kind === 'pipes') genPipes(acc)
  else genParty(acc)

  const edges = applyBorder(acc, kind)
  assignVariants(acc, kind)

  const openings: number[] = []
  for (let i = 1; i < CS - 1; i++) {
    if (edges.east[i]) openings.push(idx(CS - 1, i))
    if (edges.west[i]) openings.push(idx(0, i))
    if (edges.south[i]) openings.push(idx(i, CS - 1))
    if (edges.north[i]) openings.push(idx(i, 0))
  }
  const { connected, spawn } = repairConnectivity(acc, openings)

  // Level 0 set dressing — props in open cells with >= 3 open neighbors
  if (kind === 'office') {
    const r = rngFrom(hash3(cx, cy, seed ^ 0xd00d))
    if (r() < CONFIG.PROP_PER_CHUNK && connected.length > 6) {
      const candidates = connected.filter((i) => {
        const x = i % CS
        const y = (i - x) / CS
        if (x < 1 || y < 1 || x > CS - 2 || y > CS - 2) return false
        let open = 0
        if (acc.grid[idx(x + 1, y)] === 0) open++
        if (acc.grid[idx(x - 1, y)] === 0) open++
        if (acc.grid[idx(x, y + 1)] === 0) open++
        if (acc.grid[idx(x, y - 1)] === 0) open++
        // keep the origin chunk's immediate spawn area clear
        if (cx === 0 && cy === 0 && Math.abs(x - CS / 2) <= 2 && Math.abs(y - CS / 2) <= 2) return false
        return open >= 3
      })
      if (candidates.length > 0) {
        const cell = candidates[Math.floor(r() * candidates.length)]
        const kinds: PropKind[] = ['chairs', 'cooler', 'sign']
        acc.props.push({ lx: cell % CS, ly: Math.floor(cell / CS), kind: kinds[Math.floor(r() * 3)] })
      }
    }
  }

  // Level Fun set dressing — balloon clusters and party tables
  if (kind === 'party') {
    const r = rngFrom(hash3(cx, cy, seed ^ 0xba1100))
    if (connected.length > 6) {
      const candidates = connected.filter((i) => {
        const x = i % CS
        const y = (i - x) / CS
        if (x < 1 || y < 1 || x > CS - 2 || y > CS - 2) return false
        let open = 0
        if (acc.grid[idx(x + 1, y)] === 0) open++
        if (acc.grid[idx(x - 1, y)] === 0) open++
        if (acc.grid[idx(x, y + 1)] === 0) open++
        if (acc.grid[idx(x, y - 1)] === 0) open++
        if (cx === 0 && cy === 0 && Math.abs(x - CS / 2) <= 2 && Math.abs(y - CS / 2) <= 2) return false
        return open >= 3
      })
      const place = (kind: PropKind) => {
        const n = Math.floor(r() * candidates.length)
        const cell = candidates[n]
        candidates.splice(n, 1)
        acc.props.push({ lx: cell % CS, ly: Math.floor(cell / CS), kind })
      }
      if (r() < CONFIG.BALLOON_CLUSTER_RATE && candidates.length > 0) place('balloons')
      if (r() < CONFIG.PARTY_TABLE_RATE && candidates.length > 0) place('ptable')
    }
  }

  return {
    grid: acc.grid,
    wallVar: acc.wallVar,
    connected,
    spawn,
    props: acc.props,
    decals: acc.decals,
  }
}

export function chunkKey(cx: number, cy: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0
}
