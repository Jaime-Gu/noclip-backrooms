import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { SEED_NOTES } from '@/config'
import { store, type UserNote } from '@/lib/storage'
import { MuteToggle, WakeUpButton } from '@/components/Chrome'

interface DisplayNote {
  text: string
  alias: string
  stamp: string
  mine: boolean
  at: number
}

/**
 * THE LOGBOOK — wanderers' wall. Yellowed paper scraps pinned on a dark
 * board. Pre-seeded notes plus whatever visitors pin (localStorage).
 */
export default function Logbook() {
  const navigate = useNavigate()
  const [userNotes, setUserNotes] = useState<UserNote[]>([])
  const [text, setText] = useState('')
  const [alias, setAlias] = useState('')

  useEffect(() => {
    document.title = "Wanderers' Wall"
    setUserNotes(store.getNotes())
  }, [])

  const notes = useMemo<DisplayNote[]>(() => {
    const seeded: DisplayNote[] = SEED_NOTES.map((n, i) => ({
      text: n.text,
      alias: n.alias,
      stamp: n.ago,
      mine: false,
      at: -i, // stable order; user notes always newer
    }))
    const mine: DisplayNote[] = userNotes.map((n) => ({
      text: n.text,
      alias: n.alias,
      stamp: timeAgo(n.at),
      mine: true,
      at: n.at,
    }))
    return [...mine, ...seeded].sort((a, b) => b.at - a.at)
  }, [userNotes])

  const pin = () => {
    const clean = text.trim().slice(0, 140)
    if (!clean) return
    const note: UserNote = {
      text: clean,
      alias: alias.trim().slice(0, 24) || 'anonymous_wanderer',
      at: Date.now(),
      mine: true,
    }
    store.addNote(note)
    setUserNotes(store.getNotes())
    setText('')
  }

  return (
    <div className="min-h-screen nc-board text-[#d8d2b8] font-docmono">
      <MuteToggle />
      <WakeUpButton />

      <div className="max-w-[1000px] mx-auto px-4 py-8">
        <div className="border border-[#3a3628] p-4 mb-6 bg-black/30">
          <div className="text-[10px] tracking-[4px] text-[#8a8268]">M.E.G. COMMUNITY BOARD</div>
          <h1 className="text-[20px] tracking-[5px] mt-1">WANDERERS&apos; WALL</h1>
          <p className="text-[11px] text-[#6a6452] mt-1">
            notes pinned by those who passed through. newest first. nothing here is verified. everything here is true.
          </p>
          <div className="flex gap-4 mt-3 text-[12px]">
            <button onClick={() => navigate('/archive')} className="nc-arch-link">
              [ archive ]
            </button>
            <button onClick={() => navigate('/')} className="nc-arch-link">
              [ surface ]
            </button>
          </div>
        </div>

        {/* pin form */}
        <div className="border border-[#3a3628] bg-black/30 p-4 mb-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            maxLength={140}
            rows={3}
            placeholder="leave a note for whoever comes next…"
            className="w-full bg-[#efe9d2] text-[#23211a] font-docmono text-[13px] p-3 resize-none outline-none placeholder:text-[#8a8268]"
          />
          <div className="flex items-center justify-between mt-2 gap-3">
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value.slice(0, 24))}
              placeholder="alias (optional)"
              className="bg-[#efe9d2] text-[#23211a] font-docmono text-[12px] px-2 py-1 outline-none placeholder:text-[#8a8268] w-48"
            />
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#6a6452]">{140 - text.length} left</span>
              <button
                onClick={pin}
                disabled={!text.trim()}
                className="text-[12px] border border-[#8a8268] px-3 py-1 hover:bg-[#8a8268]/15 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                [ pin it ]
              </button>
            </div>
          </div>
        </div>

        {/* the wall */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
          {notes.map((n, i) => (
            <div
              key={i}
              className="nc-scrap break-inside-avoid mb-4 p-4 font-docmono text-[12px] leading-relaxed"
              style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}
            >
              <div className="nc-pin" />
              <p className="text-[#2c2818] mt-1">{n.text}</p>
              <div className="mt-3 flex items-center justify-between text-[10px] text-[#6a5a30]">
                <span className="font-bold">
                  — {n.alias}
                  {n.mine && <span className="ml-1 text-[#7a2018]">(you)</span>}
                </span>
                <span>{n.stamp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function timeAgo(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000)
  if (mins < 1) return 'pinned just now'
  if (mins < 60) return `pinned ${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `pinned ${hours} h ago`
  return `pinned ${Math.floor(hours / 24)} days ago`
}
