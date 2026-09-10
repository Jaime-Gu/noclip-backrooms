import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CONFIG, MEG_DOCS } from '@/config'
import { audio } from '@/engine/audio'
import { LEVELS, LEVEL_FUN } from '@/engine/levels'
import { RaycasterEngine, type HudState } from '@/engine/raycaster'
import { prefersReducedMotion, store } from '@/lib/storage'
import { MuteToggle, WakeUpButton } from '@/components/Chrome'
import { DocSheet } from '@/components/DocSheet'
import { TouchControls } from '@/components/TouchControls'

/**
 * THE WANDER — generic level page. Holds "current level" state, mounts the
 * engine with the level's theme, and handles descent transitions by
 * unmounting/remounting the engine with carry-over sanity and inventory.
 */
export default function Wander() {
  const navigate = useNavigate()
  const location = useLocation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<RaycasterEngine | null>(null)
  const [hud, setHud] = useState<HudState>({ sanity: 100, almond: 0, seconds: 0, files: 0, paused: false })
  const [docId, setDocId] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(true)
  const [fadeIn, setFadeIn] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [filesComplete, setFilesComplete] = useState(false)
  const [filesAlmost, setFilesAlmost] = useState(false)
  // descent state machine — "continue" remounts at the deepest level reached
  // (never Level Fun: the party is not a descent)
  const [level, setLevel] = useState(() => {
    const st = location.state as { continue?: boolean } | null
    return st?.continue ? Math.min(LEVELS.length - 1, Math.max(0, store.getDeepest())) : 0
  })
  const [mountKey, setMountKey] = useState(0)
  const [descendText, setDescendText] = useState<string | null>(null)
  const carryRef = useRef<{ sanity: number; almond: number } | null>(null)
  const filesSeenRef = useRef(-1)
  const reduced = useRef(prefersReducedMotion()).current
  const isTouch = useRef('ontouchstart' in window || navigator.maxTouchPoints > 0).current
  const resizeTimer = useRef(0)

  const theme = level === 3 ? LEVEL_FUN : LEVELS[level]

  useEffect(() => {
    document.title = theme.label
  }, [theme])

  /* ---- mount the engine (once per mountKey) ---- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    store.setVisited()
    const th = level === 3 ? LEVEL_FUN : LEVELS[level]
    const runSeed = (CONFIG.GLOBAL_SEED ^ (store.getRunCount() * 0x9e3779b9 + 0x1234567) ^ (level + 1) * 0x85ebca77) >>> 0
    const carry = carryRef.current
    const engine = new RaycasterEngine(canvas, {
      theme: th,
      runSeed,
      foundDocs: store.getDocs(),
      reducedMotion: reduced,
      initialSanity: carry?.sanity,
      initialAlmond: carry?.almond,
      graceSeconds: mountKey === 0 ? 4 : CONFIG.DESCENT_GRACE,
      callbacks: {
        onHud: setHud,
        onDocument: (id) => {
          store.addDoc(id)
          const doc = MEG_DOCS.find((d) => d.id === id)
          if (doc) {
            setToast(`archive updated — ${doc.code}`)
            window.setTimeout(() => setToast(null), CONFIG.TOAST_SECONDS * 1000)
          }
          setDocId(id)
        },
        onExit: (seconds, depth) => {
          store.setBestTime(seconds)
          store.setLastTime(seconds)
          store.setExitDepth(depth)
          store.incRunCount()
          setExiting(true)
          audio.setHum(0, 1)
          window.setTimeout(() => navigate('/'), 1000) // 1s black, then home
        },
        onDescend: (toLevel) => {
          const e = engineRef.current
          if (e) carryRef.current = e.getCarry()
          store.setDeepest(toLevel)
          // black + typewriter announcement, then mount the next level
          setDescendText(LEVELS[toLevel].announce)
          window.setTimeout(
            () => {
              setLevel(toLevel)
              setMountKey((k) => k + 1)
              setDescendText(null)
            },
            reduced ? 900 : CONFIG.DESCENT_TEXT_MS,
          )
        },
        onEnterParty: () => {
          const e = engineRef.current
          if (e) carryRef.current = e.getCarry()
          // the party is not a descent — deepest stays as it was
          setDescendText(LEVEL_FUN.announce)
          window.setTimeout(
            () => {
              setLevel(3)
              setMountKey((k) => k + 1)
              setDescendText(null)
            },
            reduced ? 900 : CONFIG.DESCENT_TEXT_MS,
          )
        },
        onLeaveParty: () => {
          const e = engineRef.current
          if (e) carryRef.current = e.getCarry()
          setDescendText(LEVELS[0].announce)
          window.setTimeout(
            () => {
              setLevel(0)
              setMountKey((k) => k + 1)
              setDescendText(null)
            },
            reduced ? 900 : CONFIG.DESCENT_TEXT_MS,
          )
        },
      },
    })
    engineRef.current = engine
    // debug hook for the curious (and for automated testing)
    if (window.location.search.includes('debug') || window.location.hash.includes('debug')) {
      ;(window as unknown as { __meg: RaycasterEngine }).__meg = engine
    }
    // initial resolution from the canvas display size
    const rect = canvas.getBoundingClientRect()
    if (rect.width > 0) engine.resize(rect.width, rect.height)
    engine.start()
    audio.start()
    audio.configureHum(th.hum)
    audio.setDuck(false)
    audio.setHum(0.55, 2.5)

    const t1 = window.setTimeout(() => setFadeIn(false), 80)
    const t2 = window.setTimeout(() => setShowHint(false), CONFIG.CONTROL_HINT_SECONDS * 1000)

    // debounced adaptive resolution
    const onResize = () => {
      window.clearTimeout(resizeTimer.current)
      resizeTimer.current = window.setTimeout(() => {
        const r = canvas.getBoundingClientRect()
        engineRef.current?.resize(r.width, r.height)
      }, 200)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(resizeTimer.current)
      window.removeEventListener('resize', onResize)
      engine.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountKey])

  /* ---- FILES flourishes: a nudge at 8/9, the door at 9/9 (6s each) ---- */
  useEffect(() => {
    const total = CONFIG.FILES_TOTAL
    if (hud.files === total && filesSeenRef.current !== total) {
      filesSeenRef.current = total
      setFilesComplete(true)
      const t = window.setTimeout(() => setFilesComplete(false), CONFIG.FILES_COMPLETE_SECONDS * 1000)
      return () => window.clearTimeout(t)
    }
    if (hud.files === total - 1 && filesSeenRef.current !== total - 1 && !store.getDocs().includes('level-fun')) {
      filesSeenRef.current = total - 1
      setFilesAlmost(true)
      const t = window.setTimeout(() => setFilesAlmost(false), CONFIG.FILES_COMPLETE_SECONDS * 1000)
      return () => window.clearTimeout(t)
    }
    filesSeenRef.current = hud.files
  }, [hud.files])

  const closeDoc = useCallback(() => {
    setDocId(null)
    engineRef.current?.resume()
  }, [])

  const doc = docId ? MEG_DOCS.find((d) => d.id === docId) : null
  const timecode = formatTimecode(hud.seconds)
  const sanityLow = hud.sanity < 20

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none" style={{ touchAction: 'none' }}>
      {/* the one canvas — engine renders here at reduced internal res */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'pixelated', opacity: fadeIn ? 0 : 1, transition: 'opacity 1.1s ease' }}
      />

      {/* REC + timecode */}
      <div
        className="absolute top-3 left-3 z-30 font-mono text-[13px] text-white/80 pointer-events-none"
        style={{ textShadow: '0 0 5px rgba(0,0,0,.9)' }}
      >
        <span className="nc-rec-dot text-[#ff4a4a]">●</span> REC{' '}
        <span className={sanityLow ? 'nc-timecode-glitch' : ''}>{timecode}</span>
      </div>

      <MuteToggle />
      <WakeUpButton />

      {/* level label — top-right under the mute toggle */}
      <div
        className="absolute top-8 right-2 z-30 font-mono text-[10px] tracking-[2px] text-white/35 pointer-events-none text-right"
        style={{ textShadow: '0 0 4px rgba(0,0,0,.9)' }}
      >
        {theme.label}
      </div>

      {/* sanity meter */}
      <div className="absolute bottom-3 left-3 z-30 pointer-events-none">
        <div className="font-mono text-[9px] tracking-[3px] text-white/45 mb-1" style={{ textShadow: '0 0 4px #000' }}>
          SANITY
        </div>
        <div className="w-[180px] h-[6px] bg-black/60 border border-white/20">
          <div
            className="h-full transition-[width] duration-300 ease-linear"
            style={{
              width: `${hud.sanity}%`,
              background: hud.sanity < 25 ? '#c9a227' : hud.sanity < 55 ? '#b8a356' : '#c9b464',
              boxShadow: hud.sanity < 25 ? '0 0 6px rgba(201,162,39,0.8)' : 'none',
            }}
          />
        </div>
        {hud.almond > 0 && (
          <div className="font-mono text-[10px] text-white/60 mt-1" style={{ textShadow: '0 0 4px #000' }}>
            ALMOND WATER ×{hud.almond} <span className="text-white/30">[space]</span>
          </div>
        )}
      </div>

      {/* FILES counter — bottom row, right of center, clear of touch controls */}
      <div
        className="absolute bottom-2 right-24 z-30 font-mono text-[10px] tracking-[2px] pointer-events-none text-right"
        style={{ textShadow: '0 0 4px #000' }}
      >
        {filesComplete ? (
          <span className="text-[#d8c27a]">FILES 9/9 — THE DOOR IS LOOKING FOR YOU</span>
        ) : filesAlmost ? (
          <span className="text-[#c9a8a8]">FILES 8/9 — ONE FILE IS AT THE PARTY</span>
        ) : (
          <span className="text-white/45">FILES {hud.files}/9</span>
        )}
      </div>

      {/* control hint (fades after 5s) */}
      {showHint && (
        <div
          className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 font-mono text-[11px] text-white/50 text-center pointer-events-none transition-opacity duration-1000"
          style={{ textShadow: '0 0 5px #000' }}
        >
          {isTouch ? 'left stick: move — right side: look' : 'WASD / arrows: move — drag or Q/E: look — space: drink'}
        </div>
      )}

      {/* archive toast — bottom-center, above touch controls */}
      {toast && (
        <div
          className="absolute bottom-40 left-1/2 -translate-x-1/2 z-40 font-mono text-[11px] text-[#e8e0c0] bg-black/70 border border-white/15 px-3 py-1 pointer-events-none nc-textfade"
          style={{ textShadow: '0 0 5px #000' }}
        >
          {toast}
        </div>
      )}

      {/* touch controls */}
      {isTouch && <TouchControls engineRef={engineRef} onDrink={() => engineRef.current?.drink()} />}

      {/* document overlay pauses the act (audio ducks via engine.pause) */}
      {doc && (
        <div className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center p-4 overflow-auto">
          <DocSheet doc={doc} onClose={closeDoc} />
        </div>
      )}

      {/* descent / party announcement (multi-line) */}
      {descendText && (
        <div className="absolute inset-0 z-50 bg-black flex items-center justify-center">
          <p className="font-mono text-white/85 text-[14px] nc-textfade text-center" style={{ whiteSpace: 'pre-line' }}>
            {descendText}
          </p>
        </div>
      )}

      {/* exit → 1s black */}
      {exiting && <div className="absolute inset-0 z-50 bg-black" />}
    </div>
  )
}

function formatTimecode(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}
