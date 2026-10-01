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
 */
export function useHighScore(gameSlug: string) {
  const [best, setBest] = useState(() => read(gameSlug))

  /** Reports a finished run. Returns `true` when it beat the previous best. */
  const record = useCallback(
    (score: number): boolean => {
      if (score <= read(gameSlug)) return false
      try {
        window.localStorage.setItem(storageKey(gameSlug), String(score))
      } catch {
        // Not persisted, but still shown for the rest of this visit.
      }
      setBest(score)
      return true
    },
    [gameSlug],
  )

  return { best, record }
}
