import { useMemo, useState } from 'react'
import { aiActionDelay, type PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession } from '@/games/shared/usePlaySession'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps, GameStatus } from '@/games/types'
import { createSnakeAi, type SnakeDecision } from '../ai/snakeAi'
import type { EatenFood } from '../components/SnakeBoard'
import { createSnakeGame, snakeLevel, tickDelay, updateSnake } from '../engine/snakeEngine'
import type { Direction } from '../types/snakeTypes'

/** Time between AI steps at 1x. The AI's pace is set by the speed control, not by the level. */
const AI_STEP_MS = 140

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  w: 'UP',
  s: 'DOWN',
  a: 'LEFT',
  d: 'RIGHT',
}

const newGame = () => createSnakeGame({ seed: createSeed() })

/**
 * Everything about a game of Snake that is not drawing: the engine state, the game loop, keyboard
 * input, the Human and AI controllers, the high score and reporting runs to the platform.
 * `SnakeGame.tsx` renders what this returns.
 */
export function useSnakeGame(props: GameProps) {
  const session = usePlaySession()
  const { mode, speed, paused } = session
  const { state, dispatch, reset, getState } = useEngine(newGame, updateSnake)
  // A human game waits for the first input; the AI starts on its own.
  const run = useHumanRun('snake', props)
  const { started } = run
  const [decision, setDecision] = useState<SnakeDecision | null>(null)
  const [eaten, setEaten] = useState<EatenFood | null>(null)
  const ai = useMemo(() => createSnakeAi(), [])

  const isAi = mode === 'ai'
  const playing = state.status === 'playing'
  const running = playing && !paused && (isAi || started)

  // Human and AI share this loop and the engine; they differ only in where the turn comes from.
  useTicker(
    () => {
      const before = getState()
      if (before.status !== 'playing') return

      if (isAi) {
        const next = ai.decide(before)
        setDecision(next)
        dispatch({ type: 'turn', direction: next.action })
      }
      const after = dispatch({ type: 'tick' })

      if (after.score > before.score) setEaten({ ...after.snake[0], id: after.score })
      if (!isAi && after.status !== 'playing') {
        run.finish(after.score, { length: after.snake.length, level: snakeLevel(after.score) })
      }
    },
    running ? (isAi ? aiActionDelay(AI_STEP_MS, speed) : tickDelay(state.score)) : null,
  )

  const restart = () => {
    reset(newGame())
    run.reset()
    setDecision(null)
    setEaten(null)
    session.setPaused(false)
  }

  const changeMode = (next: PlayMode) => {
    if (next === mode) return
    session.setMode(next)
    restart()
  }

  /** Human input. The first one also starts the run. */
  const steer = (direction: Direction) => {
    if (isAi || !playing || paused) return
    run.begin()
    dispatch({ type: 'turn', direction })
  }

  const canPause = playing && (isAi || started)

  useKeyboard((event) => {
    const direction = KEY_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key]
    if (direction) {
      if (isAi) return false
      steer(direction)
      return true
    }
    if ((event.key === ' ' || event.key.toLowerCase() === 'p') && canPause) {
      session.togglePause()
      return true
    }
    return false
  })

  let status: GameStatus
  if (state.status === 'won') status = 'won'
  else if (state.status === 'over') status = 'over'
  else if (!isAi && !started) status = 'ready'
  else if (paused) status = 'paused'
  else status = 'playing'

  return {
    state,
    status,
    mode,
    isAi,
    speed,
    setSpeed: session.setSpeed,
    paused,
    canPause,
    togglePause: session.togglePause,
    changeMode,
    restart,
    steer,
    decision,
    eaten,
    level: snakeLevel(state.score),
    best: run.best,
    newBest: run.newBest,
  }
}
