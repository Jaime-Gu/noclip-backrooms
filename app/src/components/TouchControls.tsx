import { useEffect, useRef } from 'react'
import type { RaycasterEngine } from '@/engine/raycaster'

interface Props {
  engineRef: React.MutableRefObject<RaycasterEngine | null>
  onDrink: () => void
}

/**
 * Left virtual joystick (move) — writes directly into engine.touchX/touchY.
 * Right-half drag turning is handled by the engine's own pointer handlers.
 */
export function TouchControls({ engineRef, onDrink }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(-1)
  const centerRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const RADIUS = 44

    const onDown = (e: PointerEvent) => {
      if (activeRef.current !== -1) return
      activeRef.current = e.pointerId
      const rect = pad.getBoundingClientRect()
      centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      try {
        pad.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      e.preventDefault()
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activeRef.current) return
      let dx = e.clientX - centerRef.current.x
      let dy = e.clientY - centerRef.current.y
      const len = Math.hypot(dx, dy) || 1
      const clamped = Math.min(len, RADIUS)
      dx = (dx / len) * clamped
      dy = (dy / len) * clamped
      if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
      const eng = engineRef.current
      if (eng) {
        eng.touchX = dx / RADIUS
        eng.touchY = -dy / RADIUS
      }
      e.preventDefault()
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeRef.current) return
      activeRef.current = -1
      if (knobRef.current) knobRef.current.style.transform = 'translate(0, 0)'
      const eng = engineRef.current
      if (eng) {
        eng.touchX = 0
        eng.touchY = 0
      }
    }

    pad.addEventListener('pointerdown', onDown)
    pad.addEventListener('pointermove', onMove)
    pad.addEventListener('pointerup', onUp)
    pad.addEventListener('pointercancel', onUp)
    return () => {
      pad.removeEventListener('pointerdown', onDown)
      pad.removeEventListener('pointermove', onMove)
      pad.removeEventListener('pointerup', onUp)
      pad.removeEventListener('pointercancel', onUp)
    }
  }, [engineRef])

  return (
    <>
      <div
        ref={padRef}
        className="absolute bottom-8 left-6 z-40 w-[120px] h-[120px] rounded-full border border-white/15 bg-white/5 flex items-center justify-center"
        style={{ touchAction: 'none' }}
      >
        <div ref={knobRef} className="w-[52px] h-[52px] rounded-full bg-white/15 border border-white/25" />
      </div>
      <button
        onClick={onDrink}
        className="absolute bottom-8 right-20 z-40 w-[64px] h-[64px] rounded-full border border-white/15 bg-white/5 font-mono text-[9px] text-white/50 tracking-widest"
        style={{ touchAction: 'none' }}
      >
        DRINK
      </button>
    </>
  )
}
