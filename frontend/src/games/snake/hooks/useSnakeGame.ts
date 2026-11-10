import { useMemo, useRef, useState } from 'react'
import { aiActionDelay, type PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession, type PlaySession } from '@/games/shared/usePlaySession'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps, GameStatus } from '@/games/types'
import type { SnakeAI, SnakeDecision } from '../ai/snakeAi'
import type { EatenFood } from '../components/SnakeBoard'
import { createAdventureGame, type AdventureStage } from '../engine/snakeAdventure'
import { createSnakeGame, snakeLevel, tickDelay, updateSnake } from '../engine/snakeEngine'
import type { SnakeMap } from '../engine/snakeMaps'
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

/** An Adventure stage to play, and what to do once the server has recorded a human clear of it. */
export interface AdventurePlay {
  stage: AdventureStage
  onCleared: (stage: AdventureStage) => void
}

/**
 * Everything about a game of Snake that is not drawing: the engine state, the game loop, keyboard
 * input, the Human and AI controllers, the high score and reporting runs to the platform.
 * `SnakeGame.tsx` renders what this returns.
 *
 * @param shared who plays, at what speed and whether paused; given by a screen that keeps them across
 * games of different maps, or kept here
 * @param map the map every game is played on (fixed for this hook's life); without it, Classic
 * @param sessionMode the mode a human run is reported under when it begins (the map's); without it,
 * Classic. Its best on this device is kept apart from the others'.
 * @param available whether a human run may begin: `false` while the server no longer declares the
 * map's mode, so a run of the map is never reported under another mode. The AI plays regardless.
 * @param adventure an Adventure stage (fixed for this hook's life): its board, fixed seed and objective.
 * Only a human clear is reported, as its game time, and `onCleared` runs once the server has recorded
 * it; a crash or a used-up move limit is never reported. Its best time on this device is the lowest.
 */
export function useSnakeGame(
  props: GameProps<SnakeAI>,
  shared?: PlaySession,
  map?: SnakeMap,
  sessionMode?: string,
  available = true,
  adventure?: AdventurePlay,
) {
  const stage = adventure?.stage
  const newGame = () => (stage ? createAdventureGame(stage) : createSnakeGame({ seed: createSeed(), map }))
  const own = usePlaySession()
  const session = shared ?? own
  const { mode, speed, paused } = session
  const { state, dispatch, reset, getState } = useEngine(newGame, updateSnake)
  // A human game waits for the first input; the AI starts on its own.
  const run = useHumanRun(sessionMode ? `snake-${sessionMode}` : 'snake', props, stage !== undefined)
  const { started } = run
  const [decision, setDecision] = useState<SnakeDecision | null>(null)
  const [eaten, setEaten] = useState<EatenFood | null>(null)
  // Game time: each move counts the human tick at the score it was made at (`tickDelay`), whoever
  // plays and at whatever speed, so a stage's time is the same as the server works it out.
  const gameMsRef = useRef(0)
  const [gameMs, setGameMs] = useState(0)
  // Present only for players allowed to use AI mode (admins); see GameProps.ai.
  const createAi = props.ai
  const ai = useMemo(() => createAi?.(), [createAi])

  // AI mode needs an AI: without one (a player who is not an admin) the game is human-only.
  const isAi = mode === 'ai' && ai !== undefined
  const playing = state.status === 'playing'
  const running = playing && !paused && (isAi || started)

  // Human and AI share this loop and the engine; they differ only in where the turn comes from.
  useTicker(
    () => {
      const before = getState()
      if (before.status !== 'playing') return

      if (isAi && ai) {
        const next = ai.decide(before)
        setDecision(next)
        dispatch({ type: 'turn', direction: next.action })
      }
      const after = dispatch({ type: 'tick' })

      if (after.steps > before.steps) {
        gameMsRef.current += tickDelay(before.score)
        if (stage) setGameMs(gameMsRef.current)
      }
      if (after.score > before.score) setEaten({ ...after.snake[0], id: after.score })
      if (isAi || after.status === 'playing') return
      if (stage) {
        // A stage counts only once cleared: a crash or a used-up move limit is a failed attempt, never
        // sent (the server would refuse it). A clear is sent as its game time, and opens the next stage
        // on this device only once the server has recorded it (`onSaved`).
        if (after.status === 'won') {
          const time = gameMsRef.current
          run.finish(
            time,
            { apples: after.score, length: after.snake.length, level: snakeLevel(after.score), steps: after.steps, gameMs: time },
            () => adventure?.onCleared(stage),
          )
        }
        return
      }
      run.finish(after.score, { length: after.snake.length, level: snakeLevel(after.score) })
    },
    running ? (isAi ? aiActionDelay(AI_STEP_MS, speed) : tickDelay(state.score)) : null,
  )

  const restart = () => {
    reset(newGame())
    run.reset()
    setDecision(null)
    setEaten(null)
    gameMsRef.current = 0
    setGameMs(0)
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
    if (!started && !available) return
    if (sessionMode) run.begin(sessionMode)
    else run.begin()
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
    aiAvailable: ai !== undefined,
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
    /** Whether a human run is under way: the map cannot change until it ends. */
    runInProgress: !isAi && started && playing,
    best: run.best,
    newBest: run.newBest,
    /** The game time so far, in milliseconds (kept for an Adventure stage). */
    gameMs,
  }
}
