import { useCallback, useState } from 'react'

/**
 * How the Chess screen is laid out, a preference of this device like the board's orientation. None
 * of it changes a game: hiding a panel keeps the match, the position being looked at and the moves.
 */
export interface ChessSettings {
  /** The evaluation bar beside (or, on a phone, above) the board. */
  evalBar: boolean
  /** The engine analysis panel (admins). */
  analysis: boolean
  /** Move-quality labels in the move list and on the board. */
  moveLabels: boolean
  /** Arrows and highlighted squares drawn on the board. */
  annotations: boolean
  /** The move list open (else folded to its heading). */
  moveList: boolean
  /** Coach Mode: Stockfish judges each move as it is played (signed-in players). */
  coach: boolean
}

export const DEFAULT_CHESS_SETTINGS: ChessSettings = {
  evalBar: true,
  analysis: false,
  moveLabels: true,
  annotations: true,
  moveList: true,
  coach: false,
}

export const CHESS_SETTINGS_KEY = 'cyan-arcade:chess:settings'

function load(): ChessSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CHESS_SETTINGS_KEY) ?? '{}') as Partial<ChessSettings>
    const settings = { ...DEFAULT_CHESS_SETTINGS }
    for (const key of Object.keys(DEFAULT_CHESS_SETTINGS) as (keyof ChessSettings)[]) {
      if (typeof stored[key] === 'boolean') settings[key] = stored[key]
    }
    return settings
  } catch {
    return { ...DEFAULT_CHESS_SETTINGS }
  }
}

/** The display settings, kept in this browser (preferences, not account data). */
export function useChessSettings() {
  const [settings, setSettings] = useState<ChessSettings>(load)

  const change = useCallback((key: keyof ChessSettings, value: boolean) => {
    setSettings((current) => {
      const next = { ...current, [key]: value }
      try {
        window.localStorage.setItem(CHESS_SETTINGS_KEY, JSON.stringify(next))
      } catch {
        // Not saved; the setting still applies until the page is closed.
      }
      return next
    })
  }, [])

  return { settings, change }
}
