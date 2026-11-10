import { useCallback, useState } from 'react'
import { ADVENTURE_STAGES } from './engine/snakeAdventure'

/**
 * How far a player has come through the Snake Adventure stages on this device: the highest stage
 * cleared, kept in `localStorage`. Stage 1 is always open; each clear opens the next. Progress is the
 * device's only (v1): another browser, or cleared site data, starts again at stage 1.
 *
 * Only a human clear the server has recorded counts: the game records it from the run's `onSaved`,
 * which AI autoplay never reaches (it never submits a run).
 */
export const PROGRESS_KEY = 'cyan-arcade:snake-adventure:cleared'

const LAST_STAGE = ADVENTURE_STAGES.length

/** The highest stage cleared on this device, 0 for none. Anything unreadable counts as none. */
export function readCleared(): number {
  try {
    const stored = Number(window.localStorage.getItem(PROGRESS_KEY))
    return Number.isInteger(stored) && stored > 0 ? Math.min(stored, LAST_STAGE) : 0
  } catch {
    // Storage can be unavailable (private mode, blocked cookies): every stage but the first stays locked.
    return 0
  }
}

/** The highest stage open to play: the one after the highest cleared. */
export const highestUnlocked = (cleared: number) => Math.min(cleared + 1, LAST_STAGE)

/**
 * Records a clear of a stage and returns the highest stage cleared. A stage beyond the next one
 * cannot have been played here, so it opens nothing; clearing an earlier one again changes nothing.
 */
export function recordCleared(stageId: number): number {
  const cleared = readCleared()
  if (stageId !== cleared + 1) return cleared
  try {
    window.localStorage.setItem(PROGRESS_KEY, String(stageId))
  } catch {
    // Not persisted: the next stage is open for the rest of this visit only.
  }
  return stageId
}

/** The device's Adventure progress, and a way to record a saved clear. */
export function useAdventureProgress() {
  const [cleared, setCleared] = useState(readCleared)
  const markCleared = useCallback((stageId: number) => {
    recordCleared(stageId)
    // Held for this visit even where storage refuses it.
    setCleared((current) => (stageId === current + 1 ? stageId : current))
  }, [])
  return { cleared, highestUnlocked: highestUnlocked(cleared), markCleared }
}
