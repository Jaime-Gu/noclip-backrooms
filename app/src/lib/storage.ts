import { LS } from '@/config'

export interface UserNote {
  text: string
  alias: string
  at: number // epoch ms
  mine: true
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — degrade silently */
  }
}

export const store = {
  get visited(): boolean {
    return safeGet(LS.VISITED) === '1'
  },
  setVisited() {
    safeSet(LS.VISITED, '1')
  },

  getDocs(): string[] {
    try {
      const raw = safeGet(LS.DOCS)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  },
  addDoc(id: string) {
    const docs = this.getDocs()
    if (!docs.includes(id)) {
      docs.push(id)
      safeSet(LS.DOCS, JSON.stringify(docs))
    }
  },

  getNotes(): UserNote[] {
    try {
      const raw = safeGet(LS.NOTES)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },
  addNote(note: UserNote) {
    const notes = this.getNotes()
    notes.push(note)
    safeSet(LS.NOTES, JSON.stringify(notes.slice(-50)))
  },

  getBestTime(): number {
    return parseInt(safeGet(LS.BEST_TIME) || '0', 10) || 0
  },
  setBestTime(sec: number) {
    if (sec > this.getBestTime()) safeSet(LS.BEST_TIME, String(sec))
  },

  getLastTime(): number {
    return parseInt(safeGet(LS.LAST_TIME) || '0', 10) || 0
  },
  setLastTime(sec: number) {
    safeSet(LS.LAST_TIME, String(sec))
  },

  getRunCount(): number {
    return parseInt(safeGet(LS.RUN_COUNT) || '0', 10) || 0
  },
  incRunCount(): number {
    const n = this.getRunCount() + 1
    safeSet(LS.RUN_COUNT, String(n))
    return n
  },

  getDeepest(): number {
    return parseInt(safeGet(LS.DEEPEST) || '0', 10) || 0
  },
  setDeepest(level: number) {
    if (level > this.getDeepest()) safeSet(LS.DEEPEST, String(level))
  },

  getExitDepth(): number {
    const v = safeGet(LS.EXIT_DEPTH)
    return v === null ? -1 : parseInt(v, 10) || 0
  },
  setExitDepth(level: number) {
    safeSet(LS.EXIT_DEPTH, String(level))
  },

  get muted(): boolean {
    return safeGet(LS.MUTED) === '1'
  },
  setMuted(m: boolean) {
    safeSet(LS.MUTED, m ? '1' : '0')
  },
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
