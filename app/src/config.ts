/* ============================================================================
 * NOCLIP — tunable constants & static lore data
 * Everything you'd want to tweak lives here.
 * ==========================================================================*/

export const CONFIG = {
  /* ---- world generation ---- */
  GLOBAL_SEED: 0x5f3759df,          // base seed; run number is XORed in so each loop re-seeds
  CHUNK_SIZE: 16,                   // cells per chunk edge (world is infinite, chunked 16x16)
  WALL_DENSITY: 0.45,               // ~45% walls => ~55% open space
  MIN_PILLAR_GAP: 2,                // minimum open cells between wall segments

  /* ---- raycaster ---- */
  INTERNAL_WIDTH: 480,              // internal render width (upscaled with pixelated CSS)
  INTERNAL_HEIGHT: 270,             // 16:9
  FOV: 1.05,                        // ~60 degrees, in radians (plane half-width = tan(FOV/2)... kept simple)
  PLANE: 0.66,                      // camera plane half-width (classic wolfenstein value)
  MOVE_SPEED: 2.6,                  // cells / second
  STRAFE_SPEED: 2.2,
  TURN_SPEED: 2.4,                  // radians / second (keyboard)
  MOUSE_SENS: 0.0032,               // radians per pixel of drag
  PLAYER_RADIUS: 0.22,              // collision radius in cells
  MAX_DEPTH: 26,                    // far draw distance in cells
  BOB_AMOUNT: 0.018,                // head-bob vertical offset in screen-space fraction
  BOB_FREQ: 9.5,                    // bob cycles per second while walking
  TEXTURE_SIZE: 64,                 // procedural texture edge length

  /* ---- sanity ---- */
  SANITY_START: 100,
  SANITY_DRAIN_PER_SEC: 1 / 12,     // ~1 per 12 seconds of wandering
  SANITY_EVENT_HIT: 5,              // every random event also costs sanity
  SANITY_LOST_RESPAWN: 50,          // sanity after "you lost yourself for a while."
  ALMOND_RESTORE: 30,
  ALMOND_AUTODRINK_BELOW: 15,

  /* ---- pickups / spawns (probability per chunk) ---- */
  ALMOND_PER_CHUNK: 0.45,           // ~1 per 2-3 chunks
  DOC_PER_CHUNK: 0.25,              // ~1 per 4 chunks
  EXIT_PER_CHUNK: 1 / 12,           // ~1 per 12 chunks
  EXIT_GUARANTEE_AFTER_DOCS: 8,     // exit guaranteed once this many docs found
  EXIT_GUARANTEE_MIN_CHUNKS: 6,     // ...but not before wandering a bit

  /* ---- events ---- */
  EVENT_MIN_GAP: 20,                // seconds between random events
  EVENT_MAX_GAP: 38,
  EVENT_WEIGHTS: {
    dimLights: 3,
    distantThud: 3,
    humDetune: 2,
    poster: 2,
    silhouette: 1,                  // ~1/10
  },
  SILHOUETTE_COOLDOWN: 180,         // never repeats within 3 minutes
  DIM_DURATION: 3,
  DIM_AMOUNT: 0.4,                  // lights dim 40% (never full black)
  DETUNE_DURATION: 5,

  /* ---- act 1 wrongness thresholds (scroll fraction) ---- */
  ACT1_STAGE1: 0.25,
  ACT1_STAGE2: 0.5,
  ACT1_STAGE3: 0.7,
  ACT1_STAGE4: 0.9,
  ACT1_FINAL_HEIGHT: 40000,         // page suddenly reports this many px of height
  ACT1_HIT_COUNTER: 4617,

  /* ---- descent mechanic ---- */
  DESCENT_FADE: 0.8,                // seconds of fade-to-black when entering a stairwell
  DESCENT_FADE_REDUCED: 0.4,        // prefers-reduced-motion variant
  DESCENT_GRACE: 15,                // seconds with no random events after arriving on a new level
  DESCENT_TEXT_MS: 1500,            // typewriter "Level 1." display time
  STAIR_PER_CHUNK: 1 / 8,           // stairwell spawn rate on Level 0 and 1
  STAIR_GUARANTEE_CHUNKS: 8,        // stairwell guaranteed within this many generated chunks

  /* ---- level 1: supply crates ---- */
  CRATE_PER_CHUNK: 0.5,             // ~1 per 2 chunks — the stocking-up floor
  CRATE_ALMOND_MIN: 1,
  CRATE_ALMOND_MAX: 2,

  /* ---- level 0 variety pass ---- */
  PROP_PER_CHUNK: 2 / 3,            // ~1 per 1.5 chunks of set-dressing props
  SPECIAL_ROOM_RATE: 1 / 12,        // per special room type, per chunk

  /* ---- level-specific event rules ---- */
  LIGHTSOFF_DURATION_MIN: 6,        // warehouse lights-off period
  LIGHTSOFF_DURATION_MAX: 8,
  LIGHTSOFF_FLOOR: 0.25,            // ambient floor during lights-off (never full black)
  LIGHTSOFF_COOLDOWN: 45,           // min seconds between lights-off events
  LIGHTSOFF_COST: 8,                // sanity
  STEAM_DURATION: 2,                // steam plume lifetime, seconds
  STEAM_COOLDOWN: 30,
  STEAM_COST: 6,
  KNOCK_COST: 4,
  KNOCK_TAPS_MIN: 4,
  KNOCK_TAPS_MAX: 7,

  /* ---- goal readout ---- */
  FILES_TOTAL: 9,                   // MEG_DOCS.length — total recoverable documents
  FILES_COMPLETE_SECONDS: 6,        // how long the "door is looking for you" message shows
  TOAST_SECONDS: 2.5,

  /* ---- hidden continue backdoor (task: persist descent) ---- */
  CONTINUE_FADE: 0.6,               // seconds of black before remounting at deepest level

  /* ---- stairwell guidance ---- */
  STAIR_GLOW: 0.22,                 // raised from 0.12 — still understated
  STAIR_BREATHE_SECONDS: 3,         // slow brightness breathe cycle
  DRAFT_RANGE: 24,                  // cells (~1.5 chunks) within which the draft cue is felt
  DRAFT_PULSE_SECONDS: 5,           // edge-bloom pulse period
  DRAFT_AUDIO_GAP: 20,              // seconds between air-draft whooshes while in range
  DRAFT_BLOOM_ALPHA: 0.08,          // peak opacity of the cool edge bloom

  /* ---- poster doors & Level Fun ---- */
  POSTER_TRANSITION: 0.8,           // seconds for poster entry/exit transition
  POSTER_ENTRY_DIST: 1.0,           // cells — poster sprite sits at wall center; collision keeps the player ~0.72 away, so 1.0 means "pressed against the wall, facing it"
  POSTER_FACE_DOT: 0.45,            // min dot(dir, toPoster) — must be deliberately facing it
  SAD_POSTER_PER_CHUNK: 1 / 6,      // =( exit poster spawn rate on Level Fun
  SAD_POSTER_GUARANTEE_CHUNKS: 8,   // guaranteed within this many chunks of arrival
  PARTY_DOC_RATE: 1 / 3,            // LEVEL FILE FUN is the only doc there, until found
  PARTY_ALMOND_RATE: 0.15,          // almond water is very rare at the party
  PARTY_SANITY_DRAIN: 1 / 8,        // highest drain in the game (~1 per 8s)
  PARTY_AMBIENT: 1.05,              // slightly BRIGHTER than Level 0 — the horror is cheerful
  HUE_DRIFT_SECONDS: 48,            // warm<->cool drift full cycle (>> any flash threshold)
  BALLOON_CLUSTER_RATE: 0.4,        // per-chunk party set dressing
  PARTY_TABLE_RATE: 0.25,
  FLOAT_BALLOON_RATE: 0.5,

  /* ---- misc ---- */
  CONTROL_HINT_SECONDS: 5,
  WAKE_BUTTON_LABEL: 'wake up',
} as const

/* --------------------------------------------------------------------------
 * localStorage keys
 * ------------------------------------------------------------------------*/
export const LS = {
  VISITED: 'noclip_visited',
  DOCS: 'noclip_docs',              // JSON array of found document ids
  NOTES: 'noclip_notes',            // JSON array of user logbook notes
  BEST_TIME: 'noclip_best_time',    // seconds
  LAST_TIME: 'noclip_last_time',    // seconds spent in Level 0 on the last exit
  RUN_COUNT: 'noclip_run_count',    // number of completed loops (world re-seed)
  DEEPEST: 'noclip_deepest',        // deepest level reached (0-2)
  EXIT_DEPTH: 'noclip_exit_depth',  // level the player last exited from (ending scales)
  MUTED: 'noclip_muted',
} as const

/* --------------------------------------------------------------------------
 * M.E.G. archive documents
 * ------------------------------------------------------------------------*/
export interface MegDoc {
  id: string
  code: string
  title: string
  colloquial: string
  survivalClass: string
  classNote: string
  body: string[]
  quote: string
  alias: string
  corrupted?: boolean
}

export const MEG_DOCS: MegDoc[] = [
  {
    id: 'level-0',
    code: 'LEVEL FILE 0',
    title: 'LEVEL 0 — "THE LOBBY"',
    colloquial: 'the yellow rooms',
    survivalClass: 'CLASS 1',
    classNote: 'SAFE // UNSTABLE GEOMETRY // MINIMAL ENTITY CONTACT',
    body: [
      'Level 0 is an expanse of empty office rooms, indeterminate in size, finished in damp yellow wallpaper, moist office carpet and humming fluorescent ceiling fixtures. No two rooms are identical, yet every room is the same room. Wanderers report the wallpaper pattern repeating with an error roughly every four hundred meters, though measurement is unreliable here.',
      'The fluorescent hum sits at a constant 60 hertz and is measurably louder than the fixtures should permit. Attempts to trace wiring have failed; the lights simply are. The carpet exudes an unidentified fluid. It is not water. Do not drink it.',
      'Spatial geometry on Level 0 is non-euclidean at the margins. Walking in a straight line rarely returns you to where you started, and retracing your steps produces different rooms than the ones you walked through. Compasses spin. Radios find only the hum.',
      'Entry is most commonly achieved by "noclipping" — a collision failure between the wanderer and consensus reality, usually triggered in liminal spaces: stairwell landings, service corridors, empty conference suites. There is no confirmed reliable exit. Documented exits manifest as ordinary office doors, cleaner than their surroundings.',
    ],
    quote: 'day one. the wallpaper is wet but my hands come away dry. i have stopped asking the building questions. it does not answer, but it listens.',
    alias: 'yellowwall_jane',
  },
  {
    id: 'level-1',
    code: 'LEVEL FILE 1',
    title: 'LEVEL 1 — "HABITABLE ZONE"',
    colloquial: 'the dark warehouse',
    survivalClass: 'CLASS 1',
    classNote: 'MOSTLY SAFE // DIM // SPARSE SUPPLIES',
    body: [
      'Level 1 resembles a maintenance warehouse of concrete pillars, chain-link cages and low brick office annexes, lit by failing ceiling lamps that go dark for hours at a time. Supply crates materialize here — canned food, batteries, Almond Water — and dematerialize when unobserved. Take what you need when you see it.',
      'During "lights-off" periods, entities emerge from the deep dark and the level is no longer considered safe. Wanderers are advised to carry two light sources and to never sleep in the open. M.E.G. Base Alpha operates here and maintains the majority of our archive.',
      'The air smells of dust and machine oil. Sounds carry strangely: a footstep one aisle over may be reported by your own ears as behind you. Trust distances, not directions.',
      'Connections to Level 0 occur through maintenance stairwells and service elevators that were not there a moment before. If the stairs keep going past where the building should end, keep climbing. Coming back down does not work.',
    ],
    quote: 'the crates are a joke the dark tells. i found three bottles of almond water and turned to call my partner and when i turned back there was a mop. just a mop. i cried a little. i took the mop.',
    alias: 'routepilot',
  },
  {
    id: 'level-2',
    code: 'LEVEL FILE 2',
    title: 'LEVEL 2 — "PIPE DREAMS"',
    colloquial: 'the steam pipes',
    survivalClass: 'CLASS 2',
    classNote: 'UNSAFE IN SECTIONS // HOT // ENTITY PRESENCE',
    body: [
      'Level 2 is an unbroken utility tunnel: black metal pipes, dripping valves, and walls sweating with heat. The corridor never branches, only bends. Sections of the tunnel are hot enough to burn on contact; the pipes carry something under pressure, and when a joint fails the steam is white and total.',
      'Sound behaves worse here than anywhere documented. The pipe chorus — a slow, arrhythmic knocking — has been timed against wanderer heart rates and found to synchronize. M.E.G. researchers consider the synchronization intentional. They do not agree on whose intention.',
      'Maintenance doors along the tunnel open into small supply rooms, air pockets of relative calm. Mark them. The tunnel shifts at a rate of roughly one door per day, and an unmarked door is a rumor.',
      'Do not follow the sound of running water uphill. There is no uphill on Level 2.',
    ],
    quote: 'the knocking learned my name. i do not mean it spoke. i mean the rhythm of it matches the rhythm of me saying my own name, and it started three days after i stopped saying it out loud.',
    alias: 'valve_keeper',
  },
  {
    id: 'level-run',
    code: 'LEVEL FILE !',
    title: 'LEVEL ! — "RUN FOR YOUR LIFE"',
    colloquial: 'run',
    survivalClass: 'CLASS 5',
    classNote: 'DO NOT ENTER // LINEAR // PURSUIT',
    body: [
      'Level ! is a hospital corridor approximately ten kilometers long, lit red, with doors that do not open and exit signs that count down. Upon entry the wanderer hears, at the edge of hearing, the corridor behind them filling up. There is one direction. You run it.',
      'Entities pursue at a constant pace slightly slower than a panicked human sprint. The corridor is designed — and the archive uses that word deliberately — to keep you running at the edge of your endurance for its full length. Obstacles appear: gurneys, chairs, spilled fluids. They are always exactly where a tired person would fail to look.',
      'Survivors describe the last kilometer as the loudest silence they have ever experienced. The exit is a set of double doors that are always exactly as far away as you can still run.',
      'If you find yourself on Level !, you have already made every mistake that leads here. Run anyway.',
    ],
    quote: 'i counted exit signs. forty. the last one said EXIT in a handwriting i recognized. mine. i have neat handwriting. i never noticed before.',
    alias: 'sprint_gospel',
  },
  {
    id: 'the-hub',
    code: 'LEVEL FILE — HUB',
    title: 'THE HUB',
    colloquial: 'the hub',
    survivalClass: 'CLASS 0',
    classNote: 'SAFE // CENTRAL // REQUIRES KEYS',
    body: [
      'The Hub is a single underground concrete tunnel lined, at regular intervals, with identical grey doors. Each door is numbered and leads to a numbered level, provided the wanderer holds the corresponding Level Key. Without keys the Hub is simply a very quiet place to rest, and rest here is genuine: no entity has ever been documented inside the Hub.',
      'The hum of Level 0 is audible faintly through the walls, as if the whole yellow expanse presses against the concrete from the other side. Wanderers report that the hum is, here, almost comforting. M.E.G. counselors flag this sentiment as an early symptom of acclimatization.',
      'Level Keys are small metal keys of no consistent design, found on levels matching their number, always somewhere inconvenient. The mechanism by which a key "matches" a door is not understood and does not appear to be mechanical.',
      'The Hub has no entrance of its own. Wanderers arrive by falling through the floor of other levels, and the Hub is polite enough to provide a floor to land on.',
    ],
    quote: 'every door is labeled and every label is honest. that scared me more than the corridor that chased me. honesty means something is keeping books.',
    alias: 'librarian_null',
  },
  {
    id: 'entity-hounds',
    code: 'ENTITY FILE 8',
    title: 'ENTITY 8 — "HOUNDS"',
    colloquial: 'hounds',
    survivalClass: 'ENTITY CLASS 4',
    classNote: 'HOSTILE // LIGHT-SENSITIVE // DO NOT RUN',
    body: [
      'Evidence file. No confirmed visual record exists of Entity 8 in full light. The archive assembles this entry from twenty-three field reports, six recovered audio logs, and one camera that was found pointed at a wall.',
      'Hounds are quadrupedal, roughly human-sized, and assemble themselves from the posture of things: a stack of chairs, a coil of cable, the shadow of a shelving unit. Reports agree that the entity is most visible in the moment you decide not to look at it. Peripheral movement is the only consistent description — low, fast, and always at the edge of a light pool.',
      'Direct light causes the entity to still. Wanderers who keep a Hound lit report it waiting, patiently, for the battery to die. Running triggers immediate pursuit at speeds no wanderer has outrun. Walking away slowly, light held steady, is the only documented survival behavior.',
      'The audio logs contain breathing that analysts describe as "human-adjacent, as if practiced." One log contains forty seconds of the wanderer whispering good boy. The wanderer survived. The archive does not know what to do with this information.',
    ],
    quote: 'it was made of the coat rack and the mop and something that wanted very badly to be a dog. i kept my flashlight on it for eleven hours. when my second battery died i was already through the door. i think it let me go. i think it was proud of me.',
    alias: 'kennel_psalm',
  },
  {
    id: 'object-almond-water',
    code: 'OBJECT FILE 1',
    title: 'OBJECT 1 — "ALMOND WATER"',
    colloquial: 'almond water',
    survivalClass: 'OBJECT CLASS B',
    classNote: 'BENEFICIAL // CONSUME // VERIFY SEAL',
    body: [
      'Almond Water is a clear, faintly sweet liquid found in unmarked white bottles across most levels. It tastes of almonds and, per several reports, of "being remembered fondly." Consumption restores hydration, clears the mind, and measurably slows the psychological erosion associated with long-term wandering. M.E.G. field rations assume three bottles per week.',
      'The liquid does not spoil, does not freeze, and does not evaporate. Bottles left in one location are sometimes found refilled. The archive has stopped asking where it comes from after the third analysis team returned the same result: water, almond extract, and one unidentified trace compound that resists spectroscopy by being, in the words of the report, "polite."',
      'Counterfeit Almond Water exists. Verify the seal: genuine bottles are sealed with a plain white cap and make no sound when shaken. A bottle that hums is not Almond Water, regardless of label.',
      'In emergencies — disorientation, memory loss, the early signs of "wretched cycle" onset — Almond Water is the first and often only effective intervention. Wanderers are advised to drink before they feel they need to.',
    ],
    quote: 'i keep one for emergencies and one for kindness. the kindness one is for whoever i find crying in the carpet. so far, twice, it has been me.',
    alias: 'wellwisher_9',
  },
  {
    id: 'level-fun',
    code: 'LEVEL FILE FUN',
    title: 'LEVEL FILE FUN — "=)"',
    colloquial: '=)',
    survivalClass: 'CLASS 5',
    classNote: 'HOSTILE // CELEBRATORY // DECLINE POLITELY',
    body: [
      'Level Fun presents as an endless birthday party furnished in the style of Level 0: brighter wallpaper, painted bunting, balloons that drift without string or hand. The lights do not hum here. Something plays a music box — three notes, slightly flat — and it has been playing since before any living wanderer arrived.',
      'The level celebrates you. This is the mechanism of its hostility: wanderers who remain describe a growing certainty that they are the guest of honor, that the other guests are simply late, that leaving would be rude. M.E.G. psychologists classify this as the most effective predation strategy in the archive, because at every stage it feels like gratitude.',
      'The partygoers are visible only at the edge of draw distance and only for fractions of a second: upright, round-headed, motionless, watching. They do not approach. The archive suspects they do not need to.',
      'Do not eat the cake. Do not pop the balloons; the sound costs something you cannot see leave. Do not dance, even ironically, even once.',
      'The exit is a poster of a frowning face, drawn in the same crude hand as the invitations. It is the only honest object on the level, and it appears rarely. Walk into it. The party will miss you. Let it.',
    ],
    quote: 'i stayed for what i thought was one song. the song is three notes long. my watch says eleven days. there was so much cake. i was never once hungry, and that should have told me everything.',
    alias: 'party_of_one',
  },
  {
    id: 'data-corrupted',
    code: 'FILE ▓▓▓▓',
    title: '[DATA CORRUPTED]',
    colloquial: '████████',
    survivalClass: 'CLASS ▓',
    classNote: '████████ // ████████ // ████████',
    corrupted: true,
    body: [
      'The subject level exhibits ████████████ behavior consistent with ████████. Wanderers entering the area report ██████████ and should under no circumstances ████████ the ████████.',
      'Recovered footage shows a room in which the wallpaper is ████████. The archivist notes that this should not be possible, as ████████████. Three members of the survey team ████████ and were recovered ████ days later, unwilling to ████████.',
      'The humming on this level does not come from the lights. The humming comes from ████████████. M.E.G. command has ████████ all further ████████.',
      'If you are reading this entry, you have already ████████████. The door you came through is ████████. Do not ████████. Do not ████████. ████████████ ████████████ ████████████.',
    ],
    quote: 'we wrote this file so that you would stop looking for this file. please. there are other files.',
    alias: 'archivist_▓',
  },
]

/* --------------------------------------------------------------------------
 * Pre-seeded logbook notes (wanderers' wall)
 * ------------------------------------------------------------------------*/
export interface SeedNote {
  text: string
  alias: string
  ago: string // fake timestamp label
}

export const SEED_NOTES: SeedNote[] = [
  { text: 'day 3. the hum changes key when i stop walking. so i don\'t stop walking.', alias: 'routepilot', ago: 'logged 41 days ago' },
  { text: 'found a meeting room with 40 chairs and a whiteboard that said SEE YOU SOON. marker still wet.', alias: 'yellowwall_jane', ago: 'logged 38 days ago' },
  { text: 'if you find almond water, drink it before you need it. trust me. trust me. trust', alias: 'wellwisher_9', ago: 'logged 33 days ago' },
  { text: 'the carpet is damp everywhere except one perfect dry rectangle in every room. i don\'t stand in them anymore.', alias: 'tile_sleeper', ago: 'logged 29 days ago' },
  { text: 'someone ahead of me is scratching arrows into the wallpaper. they all point the way i was already going.', alias: 'librarian_null', ago: 'logged 24 days ago' },
  { text: 'the lights went out for nine seconds. something in the dark was polite enough to pretend it wasn\'t there.', alias: 'kennel_psalm', ago: 'logged 19 days ago' },
  { text: 'my shadow was half a second late today. writing this down so it counts as evidence. not for me. for whoever is keeping the books.', alias: 'valve_keeper', ago: 'logged 14 days ago' },
  { text: 'i heard my mother\'s voice behind a door. i did not open it. i want it on record that i did not open it.', alias: 'sprint_gospel', ago: 'logged 9 days ago' },
  { text: 'the rooms are always available. the rooms are always available. i don\'t remember writing the first half of this note.', alias: 'archivist_▓', ago: 'logged 4 days ago' },
  { text: 'to whoever pins the next note: you are not the last one. that is the good news and the bad news.', alias: 'meridian_guest', ago: 'logged 1 day ago' },
]

/* --------------------------------------------------------------------------
 * Act 1 fake corporate content
 * ------------------------------------------------------------------------*/
export const CORPORATE = {
  company: 'Meridian Conference Solutions',
  tagline: 'Meeting Room Rental Since 1987',
  fax: '(414) 555-0187',
  faxDigits: '4145550187',
  rooms: [
    { name: 'Aster', sqft: 240, seats: 8, note: 'South-facing. Chalkboard. Excellent acoustics.' },
    { name: 'Birch', sqft: 410, seats: 16, note: 'Projector ready. Coffee service available.' },
    { name: 'Cascade', sqft: 690, seats: 40, note: 'Our flagship suite. Always available.' },
  ],
} as const
