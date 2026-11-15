import { useCallback, useState } from 'react'

const storageKey = (gameSlug: string) => `cyan-arcade:high-score:${gameSlug}`

function read(gameSlug: string): number {
  try {
    const stored = Number(window.localStorage.getItem(storageKey(gameSlug)))
    return Number.isFinite(stored) && stored > 0 ? stored : 0
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The game still works without it.
    return 0
  }
}

/**
 * The player's best score for a game on this device, kept in `localStorage`.
 *
 * This is a convenience for guests. Once accounts exist, the best score can come from the server
 * instead without any game having to change.
 *
 * @param lowerIsBetter for a score that is a time to finish (Tetris Sprint): the lowest is the best,
 * and 0 still means there is none yet
 */
export function useHighScore(gameSlug: string, lowerIsBetter = false) {
  const [best, setBest] = useState(() => read(gameSlug))

  /** Reports a finished run. Returns `true` when it beat the previous best. */
  const record = useCallback(
    (score: number): boolean => {
      const previous = read(gameSlug)
      const beaten = lowerIsBetter ? score > 0 && (previous === 0 || score < previous) : score > previous
      if (!beaten) return false
      try {
        window.localStorage.setItem(storageKey(gameSlug), String(score))
      } catch {
        // Not persisted, but still shown for the rest of this visit.
      }
      setBest(score)
      return true
    },
    [gameSlug, lowerIsBetter],
  )

  return { best, record }
}
