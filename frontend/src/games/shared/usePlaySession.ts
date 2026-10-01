import { useCallback, useState } from 'react'
import type { AiSpeed, PlayMode } from './ai'

/** Who is playing, how fast the AI plays back, and whether the game is paused. */
export function usePlaySession() {
  const [mode, setMode] = useState<PlayMode>('human')
  const [speed, setSpeed] = useState<AiSpeed>(1)
  const [paused, setPaused] = useState(false)

  const togglePause = useCallback(() => setPaused((value) => !value), [])

  return { mode, setMode, speed, setSpeed, paused, setPaused, togglePause }
}

export type PlaySession = ReturnType<typeof usePlaySession>
