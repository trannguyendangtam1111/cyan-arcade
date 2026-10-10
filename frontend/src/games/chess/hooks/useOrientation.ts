import { useCallback, useState } from 'react'
import type { Side } from '../types/chessTypes'

export const ORIENTATION_KEY = 'cyan-arcade:chess:orientation'

function stored(): Side {
  try {
    return window.localStorage.getItem(ORIENTATION_KEY) === 'BLACK' ? 'BLACK' : 'WHITE'
  } catch {
    return 'WHITE'
  }
}

/** Which side is at the bottom of the board: a preference of this device, nothing more. */
export function useOrientation() {
  const [orientation, setOrientation] = useState<Side>(stored)
  const flip = useCallback(() => {
    setOrientation((current) => {
      const next: Side = current === 'WHITE' ? 'BLACK' : 'WHITE'
      try {
        window.localStorage.setItem(ORIENTATION_KEY, next)
      } catch {
        // Not remembered; the board still turns.
      }
      return next
    })
  }, [])
  /** Puts a side at the bottom (the player's, in a game against Stockfish). */
  const orient = useCallback((side: Side) => {
    setOrientation(side)
    try {
      window.localStorage.setItem(ORIENTATION_KEY, side)
    } catch {
      // Not remembered; the board still turns.
    }
  }, [])
  return { orientation, flip, orient }
}
