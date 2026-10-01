import { useMemo, useState } from 'react'
import { aiActionDelay, type PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession } from '@/games/shared/usePlaySession'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps, GameStatus } from '@/games/types'
import { createGame2048Ai, type Game2048Decision } from '../ai/game2048Ai'
import { applyMove, createGame2048, highestTile } from '../engine/game2048Engine'
import type { Game2048State, Move } from '../types/game2048Types'

/** Time between AI moves at 1x. */
const AI_MOVE_MS = 320
/** How long a tile slide takes for a human; the AI's slides shrink to fit its move delay. */
const SLIDE_MS = 110

const KEY_MOVES: Record<string, Move> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  w: 'UP',
  s: 'DOWN',
  a: 'LEFT',
  d: 'RIGHT',
}

const newGame = () => createGame2048(createSeed())

const details = (state: Game2048State) => ({ highestTile: highestTile(state.board), moves: state.moves })

/**
 * Everything about a game of 2048 that is not drawing: the engine state, keyboard input, the Human
 * and AI controllers, the win decision and reporting runs to the platform.
 * `Game2048.tsx` renders what this returns.
 */
export function useGame2048(props: GameProps) {
  const session = usePlaySession()
  const { mode, speed, paused } = session
  const { state, dispatch, reset, getState } = useEngine(newGame, applyMove)
  const run = useHumanRun('2048', props)
  const [decision, setDecision] = useState<Game2048Decision | null>(null)
  // Reaching 2048 wins the game. A human is then asked whether to keep going for a higher tile.
  const [keptGoing, setKeptGoing] = useState(false)
  const ai = useMemo(() => createGame2048Ai(), [])

  const isAi = mode === 'ai'
  const playing = state.status === 'playing'
  const aiDelay = aiActionDelay(AI_MOVE_MS, speed)

  // The AI controller: think about the current board, then make that move through the engine.
  // It plays straight through 2048 without stopping.
  useTicker(
    () => {
      const next = ai.decide(getState())
      setDecision(next)
      dispatch(next.action)
    },
    isAi && playing && !paused ? aiDelay : null,
  )

  const restart = () => {
    // A human run that reached 2048 is a finished, winning run, not an abandoned one.
    const current = getState()
    if (!isAi && current.won && current.status === 'playing') run.finish(current.score, details(current))

    reset(newGame())
    run.reset()
    setDecision(null)
    setKeptGoing(false)
    session.setPaused(false)
  }

  const changeMode = (next: PlayMode) => {
    if (next === mode) return
    session.setMode(next)
    restart()
  }

  // The human controller: same engine, the move just comes from a key or a swipe.
  const play = (move: Move) => {
    const current = getState()
    const awaitingWinDecision = current.won && !keptGoing
    if (isAi || current.status !== 'playing' || awaitingWinDecision) return

    run.begin() // the first input of a human game starts the run
    const after = dispatch(move)
    if (after.status === 'over') run.finish(after.score, details(after))
  }

  useKeyboard((event) => {
    const move = KEY_MOVES[event.key.length === 1 ? event.key.toLowerCase() : event.key]
    if (move) {
      if (isAi) return false
      play(move)
      return true
    }
    if (isAi && playing && (event.key === ' ' || event.key.toLowerCase() === 'p')) {
      session.togglePause()
      return true
    }
    return false
  })

  let status: GameStatus
  if (!playing) status = 'over'
  else if (!isAi && state.won && !keptGoing) status = 'won'
  else if (isAi && paused) status = 'paused'
  else status = 'playing'

  return {
    state,
    status,
    mode,
    isAi,
    speed,
    setSpeed: session.setSpeed,
    paused,
    togglePause: session.togglePause,
    changeMode,
    restart,
    play,
    /** Dismisses the win screen and lets the player chase a higher tile. */
    keepGoing: () => setKeptGoing(true),
    decision,
    highestTile: highestTile(state.board),
    best: run.best,
    newBest: run.newBest,
    slideMs: isAi ? Math.min(SLIDE_MS, aiDelay * 0.7) : SLIDE_MS,
  }
}
