import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CONFIG } from '@/config'
import { audio } from '@/engine/audio'

/** First user interaction anywhere boots the audio engine (autoplay policy). */
export function useAudioBootstrap() {
  useEffect(() => {
    const boot = () => {
      audio.start()
      window.removeEventListener('pointerdown', boot)
      window.removeEventListener('keydown', boot)
      window.removeEventListener('wheel', boot)
    }
    window.addEventListener('pointerdown', boot)
    window.addEventListener('keydown', boot)
    window.addEventListener('wheel', boot, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', boot)
      window.removeEventListener('keydown', boot)
      window.removeEventListener('wheel', boot)
    }
  }, [])
}

/** Master mute toggle, top-right. Subtle mono text. */
export function MuteToggle() {
  const [muted, setMuted] = useState(audio.isMuted())
  return (
    <button
      onClick={() => {
        audio.start()
        const next = !muted
        audio.setMuted(next)
        setMuted(next)
      }}
      className="fixed top-2 right-2 z-[60] font-mono text-[10px] tracking-widest uppercase text-white/30 hover:text-white/70 transition-colors select-none"
      style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
      aria-label={muted ? 'unmute' : 'mute'}
    >
      {muted ? 'sound: off' : 'sound: on'}
    </button>
  )
}

/** Persistent escape hatch — exits to the archive index from anywhere. */
export function WakeUpButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/archive')}
      className="fixed bottom-2 right-3 z-[60] font-mono text-[10px] tracking-widest lowercase text-white/20 hover:text-white/55 transition-colors select-none"
      style={{ textShadow: '0 0 4px rgba(0,0,0,0.9)' }}
    >
      {CONFIG.WAKE_BUTTON_LABEL}
    </button>
  )
}
