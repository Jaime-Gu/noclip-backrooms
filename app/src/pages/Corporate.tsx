import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CONFIG, CORPORATE } from '@/config'
import { audio } from '@/engine/audio'
import { prefersReducedMotion, store } from '@/lib/storage'
import { MuteToggle, WakeUpButton } from '@/components/Chrome'

/**
 * ACT 1 — "the front". A dated corporate homepage that is almost fine.
 * Wrongness escalates with scroll depth + dwell time (see CONFIG.ACT1_*).
 * After the ending (lastTime > 0) this page renders its "loop closed" variant.
 */
export default function Corporate() {
  const navigate = useNavigate()
  const reduced = useRef(prefersReducedMotion()).current
  const ending = store.getLastTime() > 0
  // ending wrongness scales with the depth the player escaped from
  const exitDepth = ending ? Math.max(0, store.getExitDepth()) : -1
  const deep1 = exitDepth >= 1 // all rooms OCCUPIED, wrong-font counter
  const deep2 = exitDepth >= 2 // mustard walls in the clip-art, ∞ tagline

  const [stage, setStage] = useState(ending ? 3 : 0)
  const [counter, setCounter] = useState(ending ? store.getLastTime() : CONFIG.ACT1_HIT_COUNTER)
  const [faxDigits, setFaxDigits] = useState<string>(CORPORATE.faxDigits)
  const [flashYellow, setFlashYellow] = useState(false)
  const [doubleCursor, setDoubleCursor] = useState(false)
  const [bigPage, setBigPage] = useState(false)
  const [loosening, setLoosening] = useState(false)
  const fallingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef({ lastY: 0, lastFaxShuffle: 0 })

  const goFall = useCallback(() => {
    if (fallingRef.current) return
    fallingRef.current = true
    navigate('/fall')
  }, [navigate])

  /* ---- title ---- */
  useEffect(() => {
    document.title = ending ? 'Meridian Conference Solutions - Home.' : 'Meridian Conference Solutions - Home'
  }, [ending])

  /* ---- scroll-driven stage machine ---- */
  useEffect(() => {
    if (ending) return // the loop-closed page is quiet (mostly)
    const onScroll = () => {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      const frac = max > 0 ? el.scrollTop / max : 0
      setStage((prev) => {
        let s = prev
        if (frac >= CONFIG.ACT1_STAGE1 && s < 1) s = 1
        if (frac >= CONFIG.ACT1_STAGE2 && s < 2) s = 2
        if (frac >= CONFIG.ACT1_STAGE3 && s < 3) s = 3
        if (frac >= CONFIG.ACT1_STAGE4 && s < 4) s = 4
        return s
      })

      // fax digits quietly rearrange when scrolled, not when watched
      if (frac >= CONFIG.ACT1_STAGE2) {
        const now = performance.now()
        const moving = Math.abs(el.scrollTop - scrollRef.current.lastY) > 2
        if (moving && now - scrollRef.current.lastFaxShuffle > 1400 && Math.random() < 0.6) {
          scrollRef.current.lastFaxShuffle = now
          setFaxDigits((d) => {
            const a = d.split('')
            const i = 1 + Math.floor(Math.random() * (a.length - 2))
            const j = 1 + Math.floor(Math.random() * (a.length - 2))
            ;[a[i], a[j]] = [a[j], a[i]]
            return a.join('')
          })
        }
      }
      scrollRef.current.lastY = el.scrollTop
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ending])

  /* ---- dwell-time nudge: even without scrolling, things slowly worsen ---- */
  useEffect(() => {
    if (ending) return
    const t = window.setInterval(() => {
      setStage((prev) => Math.min(4, prev + (Math.random() < 0.25 ? 1 : 0)))
    }, 22000)
    return () => window.clearInterval(t)
  }, [ending])

  /* ---- stage 1: hit counter increments on its own ---- */
  useEffect(() => {
    if (stage < 1 || ending) return
    const t = window.setInterval(() => setCounter((c) => c + 1), 2600 + Math.random() * 2200)
    return () => window.clearInterval(t)
  }, [stage, ending])

  /* ---- stage 2: wallpaper flash (2 frames, rate-limited, off if reduced) ---- */
  useEffect(() => {
    if (stage !== 2 || reduced) return
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      setFlashYellow(true)
      window.setTimeout(() => setFlashYellow(false), 66) // ~2 frames at 30fps
    }, 900)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [stage, reduced])

  /* ---- stage 3: the second cursor appears briefly ---- */
  useEffect(() => {
    if (stage < 3 || reduced) return
    const on = window.setTimeout(() => setDoubleCursor(true), 1500)
    const off = window.setTimeout(() => setDoubleCursor(false), 4200)
    return () => {
      window.clearTimeout(on)
      window.clearTimeout(off)
    }
  }, [stage, reduced])

  /* ---- stage 4: the page reports 40,000px. the hum begins. ---- */
  useEffect(() => {
    if (stage < 4 || ending) return
    setBigPage(true)
    audio.start()
    audio.setHum(0.42, 7) // very quiet, slow fade-in
  }, [stage, ending])

  /* ---- stage 5: at the bottom of the endless page, the floor gives out ---- */
  useEffect(() => {
    if (!bigPage || fallingRef.current) return
    const onScroll = () => {
      const el = document.documentElement
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
        window.removeEventListener('scroll', onScroll)
        setLoosening(true)
        window.setTimeout(goFall, reduced ? 400 : 2600)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [bigPage, goFall, reduced])

  /* ---- ghost cursor follower ---- */
  const ghostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!doubleCursor) return
    const onMove = (e: MouseEvent) => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX + 14}px`
        ghostRef.current.style.top = `${e.clientY + 9}px`
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [doubleCursor])

  const faxDisplay = `(${faxDigits.slice(0, 3)}) ${faxDigits.slice(3, 6)}-${faxDigits.slice(6)}`
  const visited = store.visited

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-[#f4f1e6] font-serif98 text-[#1a1a1a] text-[15px] leading-snug"
      style={{ cursor: doubleCursor ? 'none' : undefined }}
    >
      <MuteToggle />
      <WakeUpButton />
      {doubleCursor && (
        <div ref={ghostRef} className="fixed z-[70] pointer-events-none text-[13px]" style={{ left: 0, top: 0 }}>
          ▲
        </div>
      )}

      <div className={`mx-auto max-w-[760px] px-2 pb-40 ${loosening ? 'nc-loosen' : ''}`}>
        {/* masthead */}
        <div className="bevel-out bg-[#e7e2cf] mt-2 px-3 py-2 flex items-center gap-3 nc-tile">
          <OfficeIllustration extraDoor={ending} mustard={deep2} />
          <div>
            <h1 className="text-[26px] font-bold text-[#1d2b6b] leading-none">{CORPORATE.company}</h1>
            <p className="text-[13px] italic text-[#555] mt-1">
              {deep2 ? 'Meeting Room Rental Since ∞' : CORPORATE.tagline}
            </p>
          </div>
        </div>

        {/* marquee */}
        <div className="bevel-in bg-[#fffef5] mt-1 overflow-hidden whitespace-nowrap py-1 nc-tile">
          <div className="nc-marquee inline-block text-[13px] text-[#7a1f1f]">
            *** NOW BOOKING FOR Q3 *** ASK ABOUT OUR CATERED LUNCH OPTIONS *** NEW: OVERHEAD PROJECTORS IN ALL SUITES
            *** THE ROOMS ARE ALWAYS AVAILABLE *** CALL OUR FAX LINE ANY TIME ***
          </div>
        </div>

        {/* nav */}
        <div className="bevel-out bg-[#d8d3be] mt-1 px-3 py-1 text-[14px] nc-tile">
          <a href="#/" className="nc-link">Home</a>
          {' | '}
          <a href="#rooms" className={`nc-link ${stage >= 1 ? 'nc-link-off' : ''}`}>Our Rooms</a>
          {' | '}
          <a href="#contact" className="nc-link">Contact Us</a>
          {' | '}
          <a href="#careers" className="nc-link">Careers</a>
          {' | '}
          <a href="#/archive" className="nc-link">Site Map</a>
          {(stage >= 3 || ending) && (
            <>
              {' | '}
              <button onClick={goFall} className="nc-link nc-link-rooms bg-transparent border-0 p-0 font-serif98 text-[14px]">
                Rooms?
              </button>
            </>
          )}
        </div>

        {visited && !ending && (
          <div className="text-right mt-1">
            <a href="#/fall" className="nc-link text-[12px]">skip intro →</a>
          </div>
        )}

        {/* welcome */}
        <div className="bevel-out bg-[#fffef8] mt-2 p-4 nc-tile">
          <h2 className="text-[18px] font-bold text-[#1d2b6b] mb-2">Welcome!</h2>
          <p>
            Thank you for visiting the online home of <b>{CORPORATE.company}</b>. For over fifteen years we have
            provided clean, quiet, and affordable meeting spaces for businesses of every size. Whether you need a
            room for an afternoon or a permanent satellite office, our friendly staff is standing by to assist you.
          </p>
          <p className="mt-2">
            Our facilities feature comfortable seating, ample parking, and complimentary coffee service. All rooms are
            climate controlled and professionally cleaned between sessions.
          </p>
          {stage >= 3 && (
            <p className="mt-2 nc-repeat">
              The rooms are always available. The rooms are always available. The rooms are always available. The rooms
              are always available.
            </p>
          )}
          <p className="mt-2">
            Please browse our room listings below, and do not hesitate to reach out by phone or fax. We look forward
            to hosting your next meeting!
          </p>
        </div>

        {/* rooms */}
        <div id="rooms" className="bevel-out bg-[#fffef8] mt-2 p-4 nc-tile">
          <h2 className="text-[18px] font-bold text-[#1d2b6b] mb-2">Our Meeting Rooms</h2>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#d8d3be]">
                <th className="bevel-cell text-left px-2 py-1">Room</th>
                <th className="bevel-cell text-left px-2 py-1">Size</th>
                <th className="bevel-cell text-left px-2 py-1">Seats</th>
                <th className="bevel-cell text-left px-2 py-1">Details</th>
                <th className="bevel-cell text-left px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {CORPORATE.rooms.map((r) => {
                const isCascade = r.name === 'Cascade'
                return (
                  <tr key={r.name}>
                    <td className="bevel-cell px-2 py-1 font-bold">
                      {isCascade ? (
                        <button onClick={goFall} className="nc-link bg-transparent border-0 p-0 font-serif98 font-bold text-[14px]">
                          {r.name}
                        </button>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td className="bevel-cell px-2 py-1">{r.sqft} sq ft</td>
                    <td className="bevel-cell px-2 py-1">{r.seats}</td>
                    <td className="bevel-cell px-2 py-1">{r.note}</td>
                    <td className="bevel-cell px-2 py-1">
                      {(isCascade && ending) || deep1 ? (
                        <span className="text-[#7a1f1f] font-bold">OCCUPIED</span>
                      ) : (
                        <span className="text-[#1f6b2e]">Available</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* room photo placeholders */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {CORPORATE.rooms.map((r, i) => (
              <div key={r.name} className="bevel-in bg-[#ccc] h-[72px] flex items-center justify-center text-[11px] text-[#777] overflow-hidden">
                {i === 1 && flashYellow ? (
                  <div className="w-full h-full nc-wallpaper-flash" />
                ) : (
                  <span>[ photo: {r.name.toLowerCase()}.gif ]</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* contact */}
        <div id="contact" className="bevel-out bg-[#fffef8] mt-2 p-4 nc-tile">
          <h2 className="text-[18px] font-bold text-[#1d2b6b] mb-2">Contact Us</h2>
          <p>
            1140 Halloway Business Park, Suite B<br />
            Reservations: (414) 555-0163<br />
            Fax: <span className="nc-fax">{faxDisplay}</span>
            <br />
            Email: frontdesk@meridian-conf.example.com
          </p>
          <p className="mt-2 text-[13px] text-[#555]">
            Our fax line is monitored 24 hours. If the line rings longer than usual, please stay on the line. Someone
            is always on the other end.
          </p>
        </div>

        {/* careers */}
        <div id="careers" className="bevel-out bg-[#fffef8] mt-2 p-4 nc-tile">
          <h2 className="text-[18px] font-bold text-[#1d2b6b] mb-2">Careers</h2>
          <p>
            Meridian is always seeking dependable front-desk staff. Applicants must be comfortable working alone in
            quiet environments for extended periods. Familiarity with our building is not required; orientation is
            provided on the first day, and every day after that.
          </p>
        </div>

        {/* counter + footer */}
        <div className="bevel-out bg-[#e7e2cf] mt-2 p-3 text-center text-[12px] text-[#555] nc-tile">
          <div className="flex items-center justify-center gap-2">
            <span>You are visitor number</span>
            <span
              className={`nc-counter bg-black text-[#7fff7f] px-2 py-[1px] tracking-[2px] ${
                deep1 ? 'font-serif98 italic' : 'font-mono'
              }`}
            >
              {String(counter).padStart(6, '0')}
            </span>
          </div>
          <p className="mt-2">Best viewed in 800×600 with Netscape Navigator 3.0 or Internet Explorer 4.0</p>
          <p className="mt-1">© 1996–{ending ? '∞' : '2003'} Meridian Conference Solutions. All rights reserved.</p>
          {ending && <p className="mt-3 text-[#999] italic">you can stop scrolling now.</p>}
        </div>

        {/* stage 4: below the footer there is only more page */}
        {bigPage && (
          <div className="nc-more-page mt-2 text-center text-[12px] text-[#b0a888]">
            <p className="pt-10">more meeting solutions below</p>
            <div style={{ height: `${CONFIG.ACT1_FINAL_HEIGHT}px` }} className="nc-endless">
              <p className="pt-[600px]">please keep scrolling</p>
              <p className="pt-[1200px]">our rooms are always available</p>
              <p className="pt-[2400px]">there is no bottom to this page</p>
              <p className="pt-[6000px]">the floor is the last thing that holds you</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---- clip-art office illustration (flat vector, mustard walls) ---- */
function OfficeIllustration({ extraDoor, mustard }: { extraDoor: boolean; mustard: boolean }) {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" className="shrink-0 border border-[#999] bg-[#efe9d2]">
      {/* wall — turns full mustard after an escape from the pipes */}
      <rect x="0" y="0" width="96" height="44" fill={mustard ? '#B8A356' : '#C9B464'} />
      {mustard && <rect x="0" y="0" width="96" height="44" fill="rgba(90,70,20,0.25)" />}
      {/* floor */}
      <rect x="0" y="44" width="96" height="20" fill="#8A7A42" />
      {/* picture frame */}
      <rect x="8" y="8" width="18" height="14" fill="#f5f0dd" stroke="#7a6a40" strokeWidth="1" />
      <rect x="11" y="11" width="12" height="8" fill="#b8c8d8" />
      {/* door 1 */}
      <rect x="36" y="12" width="16" height="32" fill="#9a8a55" stroke="#6a5a30" strokeWidth="1" />
      <circle cx="49" cy="29" r="1.4" fill="#d8cba0" />
      {/* plant */}
      <rect x="60" y="34" width="8" height="10" fill="#7a6a40" />
      <ellipse cx="64" cy="30" rx="7" ry="8" fill="#5a7038" />
      {/* desk */}
      <rect x="74" y="34" width="18" height="4" fill="#8a6a40" />
      <rect x="76" y="38" width="3" height="6" fill="#6a5028" />
      <rect x="87" y="38" width="3" height="6" fill="#6a5028" />
      <rect x="80" y="29" width="8" height="5" fill="#d8d8d8" stroke="#888" strokeWidth="0.5" />
      {/* the extra doorway that appears after the loop closes */}
      {extraDoor && <rect x="26" y="20" width="9" height="24" fill="#3a3420" stroke="#6a5a30" strokeWidth="1" />}
    </svg>
  )
}
