/* ============================================================================
 * Level themes — everything that makes a level look/sound/behave like itself.
 * The engine is constructed with one of these; the wander page swaps them
 * on descent. All tunable per-level numbers live here (see also config.ts).
 * ==========================================================================*/

import { CONFIG } from '@/config'
import { buildLevel0Set, buildLevel1Set, buildLevel2Set, buildLevelFunSet, type LevelTexSet } from './textures'
import type { GenKind } from './world'

export type EventKind =
  | 'dimLights'
  | 'distantThud'
  | 'humDetune'
  | 'poster'
  | 'silhouette'
  | 'lightsOff'
  | 'steamBurst'
  | 'pipeKnock'
  | 'balloonPop'
  | 'hornHonk'

export interface CeilingLight {
  modX: number // a panel is lit when cellX % modX === cellX...
  modY: number
  cellX: number
  cellY: number
  strength: number
  red: boolean // indicator-light tint instead of warm white
}

export interface CeilingTint {
  mod: number // every `mod`-th panel (by cellX+cellY) is tinted
  pink: [number, number, number] // multipliers — queasy pink
  teal: [number, number, number] // multipliers — queasy teal
}

export interface HumProfile {
  freq: number // base drone frequency
  harm2Gain: number // second harmonic gain
  bedCutoff: number // noise-bed lowpass
  drips: boolean // continuous water-drip ticks (boiler)
  reverb: number // synthetic tail on footsteps/thuds (0 = dry, 1 = cavernous)
  party?: boolean // replaces the drone with the Level Fun soundscape
}

export interface LevelTheme {
  id: number
  label: string // HUD label
  announce: string // typewriter text on arrival ("Level 1.")
  genKind: GenKind
  texSet: () => LevelTexSet
  maxDepth: number // far draw distance in cells
  ambient: number // global shade multiplier (1 = Level 0 brightness)
  warmTint: number // close-wall warmth (Level 2 heat feel), 0 = none
  sanityDrain: number // sanity lost per second of wandering
  almondRate: number // per-chunk almond bottle probability
  crateRate: number // per-chunk supply crate probability
  hasStairs: boolean // stairwells lead DOWN from this level
  hasExit: boolean // the grey exit door can spawn here
  hueDrift: boolean // extremely slow warm<->cool hue drift (Level Fun)
  ceiling: CeilingLight
  ceilingTint?: CeilingTint
  hum: HumProfile
  events: Partial<Record<EventKind, number>> // weighted event table
}

/** sanity cost per event kind (see config for level-specific ones) */
export const EVENT_COST: Record<EventKind, number> = {
  dimLights: CONFIG.SANITY_EVENT_HIT,
  distantThud: CONFIG.SANITY_EVENT_HIT,
  humDetune: CONFIG.SANITY_EVENT_HIT,
  poster: CONFIG.SANITY_EVENT_HIT,
  silhouette: CONFIG.SANITY_EVENT_HIT,
  lightsOff: CONFIG.LIGHTSOFF_COST,
  steamBurst: CONFIG.STEAM_COST,
  pipeKnock: CONFIG.KNOCK_COST,
  balloonPop: 4,
  hornHonk: 3,
}

/* ---------------------------------------------------------------- Level 0 */

export const LEVEL_0: LevelTheme = {
  id: 0,
  label: 'LEVEL 0 — "THE LOBBY"',
  announce: 'Level 0.',
  genKind: 'office',
  texSet: buildLevel0Set,
  maxDepth: 26,
  ambient: 1,
  warmTint: 0,
  sanityDrain: CONFIG.SANITY_DRAIN_PER_SEC, // ~1 per 12s
  almondRate: CONFIG.ALMOND_PER_CHUNK, // 0.45 — ~1 per 2-3 chunks
  crateRate: 0,
  hasStairs: true,
  hasExit: true,
  hueDrift: false,
  ceiling: { modX: 3, modY: 3, cellX: 1, cellY: 1, strength: 1, red: false },
  hum: { freq: 60, harm2Gain: 0.07, bedCutoff: 400, drips: false, reverb: 0 },
  events: {
    dimLights: 3,
    distantThud: 3,
    humDetune: 2,
    poster: 2, // the =) poster — it is a door, if you are rude enough to knock
    silhouette: 1,
  },
}

/* ------------------------------------------------------------- Level 1 */

export const LEVEL_1: LevelTheme = {
  id: 1,
  label: 'LEVEL 1 — "HABITABLE ZONE"',
  announce: 'Level 1.',
  genKind: 'warehouse',
  texSet: buildLevel1Set,
  maxDepth: 18, // shorter fog — it must FEEL dark but stay readable
  ambient: 0.5, // ~half of Level 0
  warmTint: 0,
  sanityDrain: 1 / 11,
  almondRate: 0.25, // loose bottles exist, but...
  crateRate: CONFIG.CRATE_PER_CHUNK, // ...this is the stocking-up floor
  hasStairs: true,
  hasExit: true,
  hueDrift: false,
  // sparse hanging lamps: most panels dark, every ~6th one lit
  ceiling: { modX: 6, modY: 6, cellX: 2, cellY: 2, strength: 0.9, red: false },
  hum: { freq: 50, harm2Gain: 0.05, bedCutoff: 300, drips: false, reverb: 0.9 },
  events: {
    dimLights: 2,
    distantThud: 3,
    humDetune: 2,
    lightsOff: 3, // replaces poster in this level's table
    silhouette: 1,
  },
}

/* ------------------------------------------------------------- Level 2 */

export const LEVEL_2: LevelTheme = {
  id: 2,
  label: 'LEVEL 2 — "PIPE DREAMS"',
  announce: 'Level 2.',
  genKind: 'pipes',
  texSet: buildLevel2Set,
  maxDepth: 14, // claustrophobic fog
  ambient: 0.45,
  warmTint: 0.5, // close walls glow with heat
  sanityDrain: 1 / 10,
  almondRate: 0.25, // ~1 per 4 chunks — the risk floor
  crateRate: 0,
  hasStairs: false, // the bottom, for now
  hasExit: true,
  hueDrift: false,
  // low pipe-cluttered ceiling with rare red indicator lights
  ceiling: { modX: 5, modY: 5, cellX: 2, cellY: 2, strength: 0.7, red: true },
  hum: { freq: 42, harm2Gain: 0.04, bedCutoff: 220, drips: true, reverb: 0.5 },
  events: {
    distantThud: 2,
    humDetune: 1,
    steamBurst: 3,
    pipeKnock: 3,
    silhouette: 1,
  },
}

/* -------------------------------------------------------- LEVEL FUN "=)" */
/* The secret level — brighter than Level 0, and that is the horror of it.
 * Reached only through the =) poster; left only through the =( poster.
 * No exit door, no stairwell, and it never counts as "deepest descent". */

export const LEVEL_FUN: LevelTheme = {
  id: 3,
  label: 'LEVEL FUN — "=)"',
  announce: 'Level Fun.\n=)',
  genKind: 'party',
  texSet: buildLevelFunSet,
  maxDepth: 22,
  ambient: CONFIG.PARTY_AMBIENT, // 1.05 — slightly BRIGHTER than Level 0
  warmTint: 0,
  sanityDrain: CONFIG.PARTY_SANITY_DRAIN, // highest drain in the game (~1 per 8s)
  almondRate: CONFIG.PARTY_ALMOND_RATE, // almond water is very rare at the party
  crateRate: 0,
  hasStairs: false,
  hasExit: false, // the grey door does not come here
  hueDrift: true, // 48s warm<->cool drift — far below any flash threshold
  ceiling: { modX: 3, modY: 3, cellX: 1, cellY: 1, strength: 1.05, red: false },
  // every 5th panel tinted queasy pink, every 5th (offset) queasy teal
  ceilingTint: { mod: 5, pink: [1.1, 0.96, 1.05], teal: [0.95, 1.06, 1.09] },
  hum: { freq: 55, harm2Gain: 0.05, bedCutoff: 350, drips: false, reverb: 0.4, party: true },
  events: {
    balloonPop: 3,
    hornHonk: 2,
    silhouette: 2, // the partygoers — they do not approach
    distantThud: 1,
  },
}

/** The descent chain (0 → 1 → 2). Level Fun is NOT in this list on purpose. */
export const LEVELS: LevelTheme[] = [LEVEL_0, LEVEL_1, LEVEL_2]
