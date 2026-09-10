import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { audio } from '@/engine/audio'
import { prefersReducedMotion } from '@/lib/storage'
import { MuteToggle, WakeUpButton } from '@/components/Chrome'

type Phase = 'detach' | 'tunnel' | 'black' | 'text'

const FALL_TEXT = ['You noclipped out of reality.', 'Level 0.', 'Do not lose your mind.']

/**
 * ACT 2 — the noclip fall (≤ 6s).
 * Fragments of the corporate page float up past the camera, then a tunnel of
 * mustard rectangles rushes by, the hum bends down, one carpet thud, silence,
 * typewriter text, then the raycaster.
 */
export default function Fall() {
  const navigate = useNavigate()
  const reduced = useRef(prefersReducedMotion()).current
  const [phase, setPhase] = useState<Phase>(reduced ? 'black' : 'detach')
  const [typed, setTyped] = useState<string[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timers = useRef<number[]>([])
  const doneRef = useRef(false)

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  useEffect(() => {
    document.title = 'Meridian Conference Solutions - Home'
    const finish = () => {
      if (doneRef.current) return
      doneRef.current = true
      navigate('/level')
    }

    if (reduced) {
      // simple 2s fade to black + the same text, then the level
      later(() => setPhase('text'), 600)
      FALL_TEXT.forEach((line, i) => later(() => setTyped((p) => [...p, line]), 800 + i * 500))
      later(finish, 2600)
      return () => timers.current.forEach(clearTimeout)
    }

    // full sequence (total ≈ 5.6s)
    audio.start()
    later(() => setPhase('tunnel'), 1500)
    later(() => {
      audio.bendHum(-9, 2.2) // the hum pitch-bends down as you fall
    }, 1600)
    later(() => {
      audio.landThud() // one heavy carpet-thud
      setPhase('black')
      audio.setHum(0, 0.3)
    }, 3900)
    later(() => setPhase('text'), 5000) // 1s of black + silence
    FALL_TEXT.forEach((line, i) => later(() => setTyped((p) => [...p, line]), 5100 + i * 430))
    later(finish, 6000)
    return () => timers.current.forEach(clearTimeout)
  }, [navigate, reduced])

  /* ---- tunnel of rushing mustard rectangles ---- */
  useEffect(() => {
    if (phase !== 'tunnel') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const resize = () => {
      canvas.width = Math.min(window.innerWidth, 640)
      canvas.height = Math.min(window.innerHeight, 480)
    }
    resize()
    window.addEventListener('resize', resize)

    interface Rect {
      z: number
      w: number
      h: number
    }
    const rects: Rect[] = []
    for (let i = 0; i < 26; i++) {
      rects.push({ z: i * 0.42 + 0.1, w: 0.6 + Math.random() * 0.8, h: 0.4 + Math.random() * 0.7 })
    }
    let raf = 0
    let last = performance.now()
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const w = canvas.width
      const h = canvas.height
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      for (const r of rects) {
        r.z -= dt * 7
        if (r.z < 0.15) {
          r.z += 26 * 0.42
          r.w = 0.6 + Math.random() * 0.8
          r.h = 0.4 + Math.random() * 0.7
        }
        const scale = 1 / r.z
        const rw = r.w * 220 * scale
        const rh = r.h * 150 * scale
        const shade = Math.max(0.12, Math.min(1, 1.4 - r.z * 0.13))
        const cr = Math.floor(0xc9 * shade)
        const cg = Math.floor(0xb4 * shade)
        const cb = Math.floor(0x64 * shade)
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`
        ctx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh)
        ctx.strokeStyle = `rgba(40,34,12,${Math.min(0.9, shade)})`
        ctx.lineWidth = Math.max(1, 2 * scale * 0.2)
        ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [phase])

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <MuteToggle />
      <WakeUpButton />
      {phase === 'detach' && (
        <div className="absolute inset-0" style={{ perspective: '600px' }}>
          {/* fragments of the front page, detaching and floating up */}
          {FRAGMENTS.map((f, i) => (
            <div
              key={i}
              className="nc-fragment absolute left-1/2 top-1/2 bevel-out bg-[#fffef8] font-serif98 text-[#1a1a1a] px-4 py-2 text-[14px]"
              style={
                {
                  '--tx': `${f.x}px`,
                  '--ty': `${f.y}px`,
                  '--r': `${f.r}deg`,
                  '--delay': `${f.d}s`,
                  marginLeft: `${f.x * 0.4}px`,
                  marginTop: `${f.y * 0.3}px`,
                } as React.CSSProperties
              }
            >
              {f.text}
            </div>
          ))}
          <div className="nc-bgfade absolute inset-0 bg-black" />
        </div>
      )}

      {phase === 'tunnel' && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />}

      {phase === 'text' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="font-mono text-white/85 text-[13px] leading-7 text-center nc-textfade">
            {typed.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const FRAGMENTS = [
  { text: 'Meridian Conference Solutions', x: -220, y: -160, r: -14, d: 0 },
  { text: 'Our Meeting Rooms', x: 180, y: -120, r: 9, d: 0.12 },
  { text: 'Aster — 240 sq ft', x: -140, y: 60, r: 21, d: 0.22 },
  { text: 'Cascade', x: 240, y: 100, r: -8, d: 0.3 },
  { text: 'Fax: (414) 555-0187', x: -60, y: 180, r: 33, d: 0.18 },
  { text: 'The rooms are always available.', x: 40, y: -40, r: -27, d: 0.38 },
  { text: '004617', x: -260, y: 20, r: 12, d: 0.45 },
  { text: '© 1996–2003', x: 120, y: 220, r: -19, d: 0.5 },
]
