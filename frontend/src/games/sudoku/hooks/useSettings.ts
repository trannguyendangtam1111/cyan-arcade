import { useCallback, useState } from 'react'

/** The player's Sudoku preferences. Only how the board helps them: none of it changes the rules or the score. */
export interface SudokuSettings {
  /** Tint the selected cell's row, column and box. */
  highlightRelated: boolean
  /** Tint every cell with the selected digit. */
  highlightSame: boolean
  /** Mark digits that repeat in a row, column or box. */
  highlightConflicts: boolean
  /** Mark digits the server says are wrong (ranked games). */
  showMistakes: boolean
  /** Placing a digit removes it from the notes of the cells that see it. */
  autoRemoveNotes: boolean
  /** N, C, H, Escape and Ctrl+Z / Ctrl+Y. Digits, arrows and erasing always work. */
  keyboardShortcuts: boolean
}

export const DEFAULT_SETTINGS: SudokuSettings = {
  highlightRelated: true,
  highlightSame: true,
  highlightConflicts: true,
  showMistakes: true,
  autoRemoveNotes: true,
  keyboardShortcuts: true,
}

export const SETTINGS_KEY = 'cyan-arcade:sudoku-settings'

function load(): SudokuSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<SudokuSettings>
    const settings = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SudokuSettings)[]) {
      if (typeof stored[key] === 'boolean') settings[key] = stored[key]
    }
    return settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Settings kept in this browser (they are preferences, not account data). */
export function useSettings() {
  const [settings, setSettings] = useState<SudokuSettings>(load)

  const change = useCallback((key: keyof SudokuSettings, value: boolean) => {
    setSettings((current) => {
      const next = { ...current, [key]: value }
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {
        // Not saved; the setting still applies until the page is closed.
      }
      return next
    })
  }, [])

  return { settings, change }
}

const NOTES_KEY = 'cyan-arcade:sudoku-notes'
/** The marks this browser and the server last agreed on, per run: what a merge of the two starts from. */
const SYNCED_NOTES_KEY = 'cyan-arcade:sudoku-notes-synced'
/** Runs whose notes are kept: the daily and a practice game, and a little slack. */
const NOTES_KEPT = 4

function readNotes(key: string, runId: string): number[] | undefined {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, number[]>
    const notes = stored[runId]
    return Array.isArray(notes) && notes.length === 81 ? notes : undefined
  } catch {
    return undefined
  }
}

function keepNotes(key: string, runId: string, notes: readonly number[]) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, number[]>
    delete stored[runId]
    const kept = Object.entries(stored).slice(-(NOTES_KEPT - 1))
    window.localStorage.setItem(key, JSON.stringify(Object.fromEntries([...kept, [runId, [...notes]]])))
  } catch {
    // Notes are a convenience: without storage they last until the page is closed.
  }
}

/** The pencil marks saved for a run, so they survive a reload. */
export function loadNotes(runId: string): number[] | undefined {
  return readNotes(NOTES_KEY, runId)
}

export function saveNotes(runId: string, notes: readonly number[]) {
  keepNotes(NOTES_KEY, runId, notes)
}

/** A signed-in player's run: the marks this browser last saved to (or read from) the server. */
export function loadSyncedNotes(runId: string): number[] | undefined {
  return readNotes(SYNCED_NOTES_KEY, runId)
}

export function saveSyncedNotes(runId: string, notes: readonly number[]) {
  keepNotes(SYNCED_NOTES_KEY, runId, notes)
}

/** Marks this browser sent to the server with no answer seen yet, per run: they may have arrived. */
const SENT_NOTES_KEY = 'cyan-arcade:sudoku-notes-sent'
/** A save, and one sent after it as the page was left, and a little slack. */
const SENT_KEPT = 3

function readSent(): Record<string, number[][]> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(SENT_NOTES_KEY) ?? '{}')
    return stored && typeof stored === 'object' ? (stored as Record<string, number[][]>) : {}
  } catch {
    return {}
  }
}

function writeSent(stored: Record<string, number[][]>) {
  try {
    const kept = Object.entries(stored).filter(([, sent]) => sent.length > 0).slice(-NOTES_KEPT)
    if (kept.length === 0) window.localStorage.removeItem(SENT_NOTES_KEY)
    else window.localStorage.setItem(SENT_NOTES_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Without storage, a reload merges from the marks last agreed on.
  }
}

/** The marks sent for a run whose answers this browser never saw. */
export function loadSentNotes(runId: string): number[][] {
  const sent = readSent()[runId]
  return Array.isArray(sent) ? sent.filter((notes) => Array.isArray(notes) && notes.length === 81) : []
}

/** Marks about to go to the server: written before they are sent, so a page closed meanwhile knows. */
export function rememberSentNotes(runId: string, notes: readonly number[]) {
  const stored = readSent()
  const sent = (Array.isArray(stored[runId]) ? stored[runId] : []).filter((earlier) => JSON.stringify(earlier) !== JSON.stringify(notes))
  delete stored[runId]
  writeSent({ ...stored, [runId]: [...sent, [...notes]].slice(-SENT_KEPT) })
}

/** The server's answer has been seen: what it holds is known again. */
export function forgetSentNotes(runId: string) {
  const stored = readSent()
  if (!(runId in stored)) return
  delete stored[runId]
  writeSent(stored)
}
