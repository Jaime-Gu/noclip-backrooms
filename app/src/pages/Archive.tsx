import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CONFIG, MEG_DOCS } from '@/config'
import { store } from '@/lib/storage'
import { DocSheet } from '@/components/DocSheet'
import { MuteToggle, WakeUpButton } from '@/components/Chrome'

/**
 * THE ARCHIVE — M.E.G. dossier index.
 * Documents recovered in the field are permanently filed here (localStorage).
 * Unrecovered entries exist on paper but stay sealed.
 */
export default function Archive() {
  const navigate = useNavigate()
  const [found, setFound] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [continuing, setContinuing] = useState(false)
  const deepest = store.getDeepest()

  useEffect(() => {
    document.title = 'M.E.G. Archive — Internal'
    setFound(store.getDocs())
  }, [])

  const openDoc = openId ? MEG_DOCS.find((d) => d.id === openId) : null

  return (
    <div className="min-h-screen bg-[#14130f] text-[#c9c2a8] font-docmono">
      <MuteToggle />
      <WakeUpButton />

      {/* hidden continue — near-invisible until focused/hovered. the building
          remembers how deep you went; the party never counts. */}
      {deepest >= 1 && !continuing && (
        <button
          onClick={() => {
            setContinuing(true)
            window.setTimeout(() => navigate('/level', { state: { continue: true } }), CONFIG.CONTINUE_FADE * 1000)
          }}
          className="fixed bottom-2 left-3 z-[60] font-mono text-[10px] tracking-widest text-white/[0.05] hover:text-white/30 focus:text-white/45 focus:outline-none transition-colors select-none"
          aria-label={`continue from level ${deepest}`}
        >
          ▼{deepest}
        </button>
      )}
      {continuing && <div className="fixed inset-0 z-[70] bg-black" />}

      <div className="max-w-[900px] mx-auto px-4 py-8">
        {/* masthead */}
        <div className="border border-[#4a4636] p-4 mb-6 bg-[#1b1a15]">
          <div className="text-[10px] tracking-[4px] text-[#8a8268]">MAJOR EXPLORER GROUP</div>
          <h1 className="text-[22px] tracking-[6px] text-[#d8d2b8] mt-1">THE ARCHIVE</h1>
          <div className="text-[11px] text-[#6a6452] mt-1">
            internal dossier index — {found.length}/{MEG_DOCS.length} documents recovered
            {store.getDeepest() > 0 && <> — deepest descent on record: LEVEL {store.getDeepest()}</>}
          </div>
          <div className="flex gap-4 mt-3 text-[12px]">
            <button onClick={() => navigate('/')} className="nc-arch-link">
              [ surface ]
            </button>
            <button onClick={() => navigate('/logbook')} className="nc-arch-link">
              [ wanderers&apos; wall ]
            </button>
            <button onClick={() => navigate('/level')} className="nc-arch-link">
              [ descend again ]
            </button>
          </div>
        </div>

        {openDoc ? (
          <div className="flex justify-center">
            <DocSheet doc={openDoc} onClose={() => setOpenId(null)} />
          </div>
        ) : (
          <div className="grid gap-3">
            {MEG_DOCS.map((d) => {
              const isFound = found.includes(d.id)
              return (
                <button
                  key={d.id}
                  onClick={() => isFound && setOpenId(d.id)}
                  className={`text-left border p-3 transition-colors ${
                    isFound
                      ? 'border-[#4a4636] bg-[#1b1a15] hover:border-[#8a8268] cursor-pointer'
                      : 'border-[#2a281f] bg-[#171610] cursor-not-allowed opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] tracking-[2px] text-[#6a6452]">
                        {isFound ? d.code : 'FILE ▓▓▓▓'}
                      </span>
                      <div className="text-[14px] text-[#d8d2b8] mt-[2px]">
                        {isFound ? d.title : '▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓'}
                      </div>
                      <div className="text-[11px] text-[#6a6452] mt-[2px]">
                        {isFound ? (
                          <>
                            class {d.survivalClass.replace('CLASS ', '')} — “{d.colloquial}”
                          </>
                        ) : (
                          'FILE ▓▓▓▓ — RECOVER IN THE FIELD'
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] tracking-[2px] px-2 py-[2px] border shrink-0 ${
                        isFound ? 'border-[#5a7a4a] text-[#8ab070]' : 'border-[#4a3520] text-[#a07040]'
                      }`}
                    >
                      {isFound ? 'RECOVERED' : 'SEALED'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <p className="text-[10px] text-[#4a4636] mt-8 text-center tracking-[2px]">
          the archive keeps books on all of us — even you, now
        </p>
      </div>
    </div>
  )
}
