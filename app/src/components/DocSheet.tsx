import { useState } from 'react'
import type { MegDoc } from '@/config'

/**
 * M.E.G. dossier page: monospace on scanned paper, stamped header,
 * survival-class table, redaction bars (reveal 300ms on hover).
 */
export function DocSheet({ doc, onClose }: { doc: MegDoc; onClose?: () => void }) {
  return (
    <div className="nc-paper relative max-w-[680px] w-full font-docmono text-[#23211a] text-[13px] leading-relaxed shadow-2xl p-6 sm:p-10 my-4">
      {/* coffee ring stain */}
      <div className="nc-coffee-ring" />

      {/* stamped header */}
      <div className="border-2 border-[#7a2018] text-[#7a2018] px-3 py-1 inline-block rotate-[-1.5deg] mb-4">
        <div className="text-[11px] tracking-[3px] font-bold">M.E.G. — MAJOR EXPLORER GROUP</div>
        <div className="text-[9px] tracking-[5px]">INTERNAL // DO NOT DISTRIBUTE</div>
      </div>

      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="text-[10px] tracking-[2px] text-[#6a6452]">{doc.code}</div>
        {onClose && (
          <button
            onClick={onClose}
            className="font-docmono text-[11px] text-[#7a2018] border border-[#7a2018]/40 px-2 py-[2px] hover:bg-[#7a2018]/10 shrink-0"
          >
            [ close ]
          </button>
        )}
      </div>

      <h2 className="text-[17px] font-bold tracking-wide mb-3">{doc.title}</h2>

      {/* survival class table */}
      <table className="border-collapse mb-4 text-[11px]">
        <tbody>
          <tr>
            <td className="border border-[#8a8268] px-2 py-[2px] bg-[#e4ddc4] font-bold w-[130px]">SURVIVAL CLASS</td>
            <td className="border border-[#8a8268] px-2 py-[2px]">{doc.survivalClass}</td>
          </tr>
          <tr>
            <td className="border border-[#8a8268] px-2 py-[2px] bg-[#e4ddc4] font-bold">CONDITIONS</td>
            <td className="border border-[#8a8268] px-2 py-[2px]">{doc.classNote}</td>
          </tr>
          <tr>
            <td className="border border-[#8a8268] px-2 py-[2px] bg-[#e4ddc4] font-bold">COLLOQUIAL</td>
            <td className="border border-[#8a8268] px-2 py-[2px] italic">
              {doc.corrupted ? <Redact text={doc.colloquial} /> : `“${doc.colloquial}”`}
            </td>
          </tr>
        </tbody>
      </table>

      {/* body */}
      <div className="space-y-3">
        {doc.body.map((p, i) => (
          <p key={i}>{doc.corrupted ? <CorruptedParagraph text={p} /> : p}</p>
        ))}
      </div>

      {/* field report */}
      <div className="mt-5 border-l-2 border-[#8a8268] pl-3">
        <div className="text-[10px] tracking-[2px] text-[#6a6452] mb-1">FIELD REPORT — VERBATIM</div>
        <p className="italic text-[12px]">“{doc.quote}”</p>
        <p className="text-[11px] mt-1 text-[#4a4636]">
          — wanderer alias: <span className="font-bold">{doc.alias}</span>
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between text-[9px] tracking-[2px] text-[#8a8268]">
        <span>M.E.G. ARCHIVE — COPY {Math.abs(hashCode(doc.id)) % 900 + 100}/900</span>
        <span className="rotate-[1deg] border border-[#7a2018]/50 text-[#7a2018]/70 px-2 py-[1px]">VERIFIED ▓▓/▓▓/▓▓</span>
      </div>
    </div>
  )
}

/** Black bar that reveals its text for 300ms on hover, then re-redacts. */
export function Redact({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      className={`nc-redact ${revealed ? 'nc-redact-open' : ''}`}
      onMouseEnter={() => {
        setRevealed(true)
        window.setTimeout(() => setRevealed(false), 300)
      }}
      onTouchStart={() => {
        setRevealed(true)
        window.setTimeout(() => setRevealed(false), 300)
      }}
    >
      {text}
    </span>
  )
}

/** Renders a paragraph, turning ████ runs into live redaction bars. */
function CorruptedParagraph({ text }: { text: string }) {
  const parts = text.split(/(█+)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('█') ? <Redact key={i} text={'▓'.repeat(Math.min(part.length, 12))} /> : <span key={i}>{part}</span>,
      )}
    </>
  )
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
