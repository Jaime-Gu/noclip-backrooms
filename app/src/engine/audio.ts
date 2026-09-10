/* ============================================================================
 * NOCLIP audio engine — everything synthesized via Web Audio API.
 * No files, no samples. Master gain stays low by design.
 * ==========================================================================*/

import { CONFIG } from '@/config'
import { store } from '@/lib/storage'

type OscType = OscillatorType

const CONFIG_KNOCK = { min: CONFIG.KNOCK_TAPS_MIN, max: CONFIG.KNOCK_TAPS_MAX }

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private humGain: GainNode | null = null
  private humOsc: OscillatorNode | null = null
  private humOsc2: OscillatorNode | null = null
  private humHarmGain: GainNode | null = null
  private humBedFilter: BiquadFilterNode | null = null
  private whisperGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private started = false
  private muted = store.muted
  private detuneUntil = 0
  private stepToggle = false
  // level character
  private humBase = 60
  private reverbScale = 0
  private dripOn = false
  private nextDrip = 0
  // ducking (document overlays / pauses)
  private baseHumLevel = 0
  private duckTarget = 1
  // Level Fun soundscape (replaces the drone)
  private partyMode = false
  private murmurGain: GainNode | null = null
  private nextWaltz = 0

  /** Must be called from a user gesture (click/keydown). Idempotent. */
  start() {
    if (this.started) {
      this.ctx?.resume().catch(() => {})
      return
    }
    this.started = true
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx

    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : 0.55 // overall low volume
    master.connect(ctx.destination)
    this.master = master

    // --- shared noise buffer (2s of white noise) ---
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf

    // --- fluorescent hum: 60Hz + 120Hz (-12dB) + filtered noise bed ---
    const hum = ctx.createGain()
    hum.gain.value = 0.0 // fades in when told to
    hum.connect(master)
    this.humGain = hum

    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = 60
    const g1 = ctx.createGain()
    g1.gain.value = 0.28
    o1.connect(g1)
    g1.connect(hum)
    o1.start()
    this.humOsc = o1

    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = 120
    const g2 = ctx.createGain()
    g2.gain.value = 0.07 // ~ -12dB relative to fundamental
    o2.connect(g2)
    g2.connect(hum)
    o2.start()
    this.humOsc2 = o2
    this.humHarmGain = g2

    const bed = ctx.createBufferSource()
    bed.buffer = buf
    bed.loop = true
    const bedFilter = ctx.createBiquadFilter()
    bedFilter.type = 'lowpass'
    bedFilter.frequency.value = 400
    const bedGain = ctx.createGain()
    bedGain.gain.value = 0.045
    bed.connect(bedFilter)
    bedFilter.connect(bedGain)
    bedGain.connect(hum)
    bed.start()
    void bed
    this.humBedFilter = bedFilter

    // slow amplitude wobble on the whole hum bus
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.13
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.05
    lfo.connect(lfoGain)
    lfoGain.connect(hum.gain)
    lfo.start()
    void lfo

    // --- whisper layer (band-passed noise, breath-like AM) ---
    const wsrc = ctx.createBufferSource()
    wsrc.buffer = buf
    wsrc.loop = true
    const wbp = ctx.createBiquadFilter()
    wbp.type = 'bandpass'
    wbp.frequency.value = 900
    wbp.Q.value = 0.8
    const wg = ctx.createGain()
    wg.gain.value = 0 // controlled by sanity each frame
    const wlfo = ctx.createOscillator()
    wlfo.frequency.value = 0.37 // breath rate
    const wlg = ctx.createGain()
    wlg.gain.value = 0.5
    wlfo.connect(wlg)
    wlg.connect(wg.gain)
    wlfo.start()
    wsrc.connect(wbp)
    wbp.connect(wg)
    wg.connect(master)
    wsrc.start()
    void wsrc
    this.whisperGain = wg
  }

  setMuted(m: boolean) {
    this.muted = m
    store.setMuted(m)
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.08)
    }
  }
  isMuted() {
    return this.muted
  }

  /** Fade the hum/drone to a target level (0..1 scaled internally). */
  setHum(level: number, ramp = 1.5) {
    this.baseHumLevel = level
    this.applyHum(ramp)
  }

  private applyHum(ramp = 1.5) {
    if (!this.ctx || !this.humGain) return
    // on Level Fun the fluorescent drone is silent — the party has its own sound
    const target = this.partyMode ? 0 : this.baseHumLevel * 0.5 * this.duckTarget
    this.humGain.gain.setTargetAtTime(target, this.ctx.currentTime, ramp / 3)
  }

  /** Duck ambient to ~30% while a document overlay / pause is open. */
  setDuck(on: boolean) {
    this.duckTarget = on ? 0.3 : 1
    this.applyHum(0.4)
  }

  /** Reconfigure the drone for a new level (frequency, bed, drips, reverb). */
  configureHum(profile: { freq: number; harm2Gain: number; bedCutoff: number; drips: boolean; reverb: number; party?: boolean }) {
    this.humBase = profile.freq
    this.reverbScale = profile.reverb
    this.dripOn = profile.drips
    this.nextDrip = 0
    const wantParty = profile.party === true
    if (wantParty !== this.partyMode) {
      this.partyMode = wantParty
      if (wantParty) this.startParty()
      else this.stopParty()
    }
    this.applyHum(1.2)
    if (!this.ctx) return
    const t = this.ctx.currentTime
    if (this.humOsc) this.humOsc.frequency.setTargetAtTime(profile.freq, t, 0.6)
    if (this.humOsc2) this.humOsc2.frequency.setTargetAtTime(profile.freq * 2, t, 0.6)
    if (this.humHarmGain) this.humHarmGain.gain.setTargetAtTime(profile.harm2Gain, t, 0.6)
    if (this.humBedFilter) this.humBedFilter.frequency.setTargetAtTime(profile.bedCutoff, t, 0.6)
  }

  /* ----------------------------------------------------- Level Fun audio */

  /** Crowd murmur bed + music-box waltz scheduler. The drone stays silent. */
  private startParty() {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // a crowd that might be there — band-passed noise, very low, slow swell
    if (!this.murmurGain) {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.loop = true
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 430
      bp.Q.value = 0.6
      const g = ctx.createGain()
      g.gain.value = 0
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.09 // very slow swell
      const lg = ctx.createGain()
      lg.gain.value = 0.008
      lfo.connect(lg)
      lg.connect(g.gain)
      lfo.start()
      src.connect(bp)
      bp.connect(g)
      g.connect(this.master)
      src.start()
      this.murmurGain = g
    }
    this.murmurGain.gain.setTargetAtTime(0.02, t, 2)
    this.nextWaltz = t + 1.4
  }

  private stopParty() {
    if (this.murmurGain && this.ctx) {
      this.murmurGain.gain.setTargetAtTime(0, this.ctx.currentTime, 1)
    }
    this.nextWaltz = 0
  }

  /** Three flat notes on a music box. It has been playing for a long time. */
  private musicBoxNote(freq: number, when: number) {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = freq
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = freq * 2
    const g2 = ctx.createGain()
    g2.gain.value = 0.22
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 700
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(0.05, when + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.3)
    o1.connect(hp)
    o2.connect(g2)
    g2.connect(hp)
    hp.connect(g)
    g.connect(this.master)
    o1.start(when)
    o2.start(when)
    o1.stop(when + 1.4)
    o2.stop(when + 1.4)
  }

  /** Momentary silence (silhouette event): duck hum then restore. */
  cutHum(seconds: number) {
    if (!this.ctx || !this.humGain) return
    const t = this.ctx.currentTime
    const base = this.humGain.gain.value
    this.humGain.gain.cancelScheduledValues(t)
    this.humGain.gain.setValueAtTime(base, t)
    this.humGain.gain.setTargetAtTime(0.0001, t, 0.15)
    this.humGain.gain.setTargetAtTime(Math.max(base, 0.35 * this.duckTarget), t + seconds, 0.6)
  }

  /** Pitch-bend the hum (used by the Act 2 fall). targetSemitones can be negative. */
  bendHum(semitones: number, seconds: number) {
    if (!this.ctx || !this.humOsc || !this.humOsc2) return
    const t = this.ctx.currentTime
    const ratio = Math.pow(2, semitones / 12)
    this.humOsc.frequency.cancelScheduledValues(t)
    this.humOsc2.frequency.cancelScheduledValues(t)
    this.humOsc.frequency.setValueAtTime(this.humOsc.frequency.value, t)
    this.humOsc2.frequency.setValueAtTime(this.humOsc2.frequency.value, t)
    this.humOsc.frequency.exponentialRampToValueAtTime(60 * ratio, t + seconds)
    this.humOsc2.frequency.exponentialRampToValueAtTime(120 * ratio, t + seconds)
  }

  /** Event: hum detunes by a semitone for a while. */
  detune(semitones: number, seconds: number) {
    if (!this.ctx || !this.humOsc || !this.humOsc2) return
    const t = this.ctx.currentTime
    this.detuneUntil = t + seconds
    const ratio = Math.pow(2, semitones / 12)
    this.humOsc.frequency.setTargetAtTime(this.humBase * ratio, t, 0.3)
    this.humOsc2.frequency.setTargetAtTime(this.humBase * 2 * ratio, t, 0.3)
  }

  /** Whisper intensity from sanity (0..100). */
  setSanity(sanity: number) {
    if (!this.whisperGain || !this.ctx) return
    const w = Math.max(0, Math.min(1, (55 - sanity) / 55))
    // base breath envelope sits around the LFO; scale the ceiling with sanity loss
    this.whisperGain.gain.setTargetAtTime(w * 0.16, this.ctx.currentTime, 0.8)
  }

  /** Called once per frame from the game loop for cheap scheduled maintenance. */
  update() {
    if (!this.ctx || !this.humOsc || !this.humOsc2) return
    const t = this.ctx.currentTime
    if (this.detuneUntil > 0 && t > this.detuneUntil) {
      this.detuneUntil = 0
      this.humOsc.frequency.setTargetAtTime(this.humBase, t, 0.5)
      this.humOsc2.frequency.setTargetAtTime(this.humBase * 2, t, 0.5)
    }
    // boiler drips (Level 2)
    if (this.dripOn && t > this.nextDrip) {
      this.nextDrip = t + 1.5 + Math.random() * 3
      this.dripTick()
    }
    // the waltz — three notes, slightly flat, forever (Level Fun)
    if (this.partyMode && this.nextWaltz > 0 && t > this.nextWaltz) {
      const flat = 0.98 // everything here is tuned a little wrong
      const notes = [659.25, 523.25, 392].map((f) => f * flat * (1 + (Math.random() - 0.5) * 0.004))
      const gap = 0.4 + Math.random() * 0.06
      notes.forEach((f, i) => this.musicBoxNote(f, t + 0.35 + i * gap))
      this.nextWaltz = t + 4.4 + Math.random() * 1.6
    }
  }

  private dripTick() {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const pan = (Math.random() - 0.5) * 1.4
    // water plink
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(680 + Math.random() * 260, t)
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.09)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(g)
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = pan
      g.connect(p)
      p.connect(this.master)
    } else {
      g.connect(this.master)
    }
    osc.start(t)
    osc.stop(t + 0.15)
  }

  private blip(
    freqStart: number,
    freqEnd: number,
    dur: number,
    type: OscType,
    gainPeak: number,
    pan = 0,
    filterFreq = 0,
  ) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(1, freqStart), t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gainPeak, t + dur * 0.08)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    let node: AudioNode = osc
    if (filterFreq > 0) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = filterFreq
      node.connect(f)
      node = f
    }
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = pan
      node.connect(p)
      p.connect(g)
    } else {
      node.connect(g)
    }
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  /** Carpet-muffled footstep (with optional cavernous tail). */
  footstep(intensity = 1, when = 0) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime + when
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = this.stepToggle ? 620 : 500
    this.stepToggle = !this.stepToggle
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09 * intensity, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t, Math.random() * 1.5)
    src.stop(t + 0.1)
    // synthetic reverb tail — a second, softer, duller echo
    if (this.reverbScale > 0 && when === 0) {
      const t2 = t + 0.11
      const src2 = this.ctx.createBufferSource()
      src2.buffer = this.noiseBuffer
      const f2 = this.ctx.createBiquadFilter()
      f2.type = 'lowpass'
      f2.frequency.value = 320
      const g2 = this.ctx.createGain()
      g2.gain.setValueAtTime(0.0001, t2)
      g2.gain.exponentialRampToValueAtTime(0.05 * this.reverbScale * intensity, t2 + 0.02)
      g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.3)
      src2.connect(f2)
      f2.connect(g2)
      g2.connect(this.master)
      src2.start(t2, Math.random() * 1.5)
      src2.stop(t2 + 0.35)
    }
  }

  /** Distant thud from a stereo direction (-1..1). */
  distantThud(pan: number) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(50, t)
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.5)
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(200, t)
    f.frequency.exponentialRampToValueAtTime(60, t + 1.4)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6 + this.reverbScale * 1.2)
    osc.connect(f)
    f.connect(g)
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = pan
      g.connect(p)
      p.connect(this.master)
    } else {
      g.connect(this.master)
    }
    osc.start(t)
    osc.stop(t + 2 + this.reverbScale * 1.2)
  }

  /** Heavy carpet thud (the landing after the fall). */
  landThud() {
    this.distantThud(0)
    this.blip(90, 40, 0.35, 'triangle', 0.25, 0, 300)
  }

  /** Descending footstep sequence (stairwell transition). */
  descendSteps() {
    if (!this.ctx) return
    const offsets = [0, 0.3, 0.62, 0.97]
    offsets.forEach((o, i) => this.footstep(1 - i * 0.14, o))
    window.setTimeout(() => this.landThud(), 1250)
  }

  /** Low rumble swell (warehouse lights-off period). */
  rumble(seconds: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 110
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.1, t + Math.min(1.5, seconds * 0.3))
    g.gain.setValueAtTime(0.1, t + seconds - 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 35
    const g2 = this.ctx.createGain()
    g2.gain.setValueAtTime(0.0001, t)
    g2.gain.exponentialRampToValueAtTime(0.12, t + 1)
    g2.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    osc.connect(g2)
    g2.connect(this.master)
    src.start(t)
    src.stop(t + seconds + 0.1)
    osc.start(t)
    osc.stop(t + seconds + 0.1)
  }

  /** Steam burst hiss, stereo-positioned. */
  steamHiss(pan: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 700
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(1400, t)
    bp.frequency.exponentialRampToValueAtTime(600, t + 1.6)
    bp.Q.value = 0.5
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.06)
    g.gain.setValueAtTime(0.1, t + 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9)
    src.connect(hp)
    hp.connect(bp)
    bp.connect(g)
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(p)
      p.connect(this.master)
    } else {
      g.connect(this.master)
    }
    src.start(t, Math.random() * 1.2)
    src.stop(t + 2)
  }

  /** Pipe knocking — arrhythmic low taps from a random direction. */
  pipeKnock(pan: number) {
    if (!this.ctx || !this.master) return
    const taps = CONFIG_KNOCK.min + Math.floor(Math.random() * (CONFIG_KNOCK.max - CONFIG_KNOCK.min + 1))
    let at = this.ctx.currentTime
    for (let i = 0; i < taps; i++) {
      at += 0.14 + Math.random() * 0.3
      const osc = this.ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = 160 + Math.random() * 50
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.09, at + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 700
      osc.connect(f)
      f.connect(g)
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner()
        p.pan.value = Math.max(-1, Math.min(1, pan))
        g.connect(p)
        p.connect(this.master)
      } else {
        g.connect(this.master)
      }
      osc.start(at)
      osc.stop(at + 0.12)
    }
  }

  /** Supply crate opening — a soft wood-slide. */
  crateOpen() {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(1100, t)
    f.frequency.exponentialRampToValueAtTime(260, t + 0.3)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t, 0.4)
    src.stop(t + 0.4)
    this.blip(200, 120, 0.12, 'triangle', 0.07, 0, 500)
  }

  /** Almond water chime: two soft sine notes, +7 semitones. */
  chime() {
    if (!this.ctx) return
    this.blip(523.25, 523.25, 0.5, 'sine', 0.1)
    window.setTimeout(() => this.blip(523.25 * Math.pow(2, 7 / 12), 523.25 * Math.pow(2, 7 / 12), 0.7, 'sine', 0.08), 110)
  }

  /** Air draft — a soft cool whoosh from the direction of a stairwell. */
  airDraft(pan: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(280, t)
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.7)
    bp.frequency.exponentialRampToValueAtTime(350, t + 1.4)
    bp.Q.value = 0.5
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5)
    src.connect(bp)
    bp.connect(g)
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(p)
      p.connect(this.master)
    } else {
      g.connect(this.master)
    }
    src.start(t, Math.random() * 1.2)
    src.stop(t + 1.6)
  }

  /** Balloon pop — a sharp little report. It costs something. */
  balloonPop(pan: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1100
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    src.connect(hp)
    hp.connect(g)
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(p)
      p.connect(this.master)
    } else {
      g.connect(this.master)
    }
    src.start(t, Math.random() * 1.5)
    src.stop(t + 0.12)
    this.blip(900, 180, 0.09, 'triangle', 0.06, Math.max(-1, Math.min(1, pan)), 1600)
  }

  /** Sad party horn in the distance — a kazoo that lost the will to kazoo. */
  partyHorn(pan: number) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(330, t)
    osc.frequency.linearRampToValueAtTime(300, t + 0.3)
    osc.frequency.linearRampToValueAtTime(250, t + 0.75)
    // kazoo wobble
    const vib = this.ctx.createOscillator()
    vib.frequency.value = 17
    const vg = this.ctx.createGain()
    vg.gain.value = 7
    vib.connect(vg)
    vg.connect(osc.frequency)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1100
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.04)
    g.gain.setValueAtTime(0.05, t + 0.55)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85)
    osc.connect(lp)
    lp.connect(g)
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(p)
      p.connect(this.master)
    } else {
      g.connect(this.master)
    }
    vib.start(t)
    osc.start(t)
    vib.stop(t + 0.9)
    osc.stop(t + 0.9)
  }

  /** Soft paper-rustle when a document is picked up. */
  paper() {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 2200
    f.Q.value = 0.6
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + 0.25)
  }
}

/** Shared singleton — the whole site talks to one audio engine. */
export const audio = new AudioEngine()
