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
  /** N, H, Escape and Ctrl+Z / Ctrl+Y. Digits, arrows and erasing always work. */
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
/** Runs whose notes are kept: the daily and a practice game, and a little slack. */
const NOTES_KEPT = 4

/** The pencil marks saved for a run, so they survive a reload. */
export function loadNotes(runId: string): number[] | undefined {
  try {
    const stored = JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? '{}') as Record<string, number[]>
    const notes = stored[runId]
    return Array.isArray(notes) && notes.length === 81 ? notes : undefined
  } catch {
    return undefined
  }
}

export function saveNotes(runId: string, notes: readonly number[]) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? '{}') as Record<string, number[]>
    delete stored[runId]
    const kept = Object.entries(stored).slice(-(NOTES_KEPT - 1))
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(Object.fromEntries([...kept, [runId, [...notes]]])))
  } catch {
    // Notes are a convenience: without storage they last until the page is closed.
  }
}
