import { useMemo, useState } from 'react'
import { aiActionDelay, type PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession } from '@/games/shared/usePlaySession'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps, GameStatus } from '@/games/types'
import type { TetrisAI, TetrisDecision } from '../ai/tetrisAi'
import { createTetrisGame, gravityDelay, updateTetris } from '../engine/tetrisEngine'
import type { TetrisAction, TetrisState } from '../types/tetrisTypes'

/** Time between AI actions (a rotation, a one-column move or the drop) at 1x. */
const AI_ACTION_MS = 120

const KEY_ACTIONS: Record<string, TetrisAction> = {
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp: 'ROTATE_CW',
  ArrowDown: 'SOFT_DROP',
  ' ': 'HARD_DROP',
  a: 'LEFT',
  d: 'RIGHT',
  w: 'ROTATE_CW',
  s: 'SOFT_DROP',
  x: 'ROTATE_CW',
  z: 'ROTATE_CCW',
}

const CLEAR_NAMES = ['', 'Single', 'Double', 'Triple', 'Tetris!']

/** The most recent line clear. `id` changes with every clear so its announcement replays. */
export interface LineClear {
  id: number
  label: string
}

const newGame = () => createTetrisGame(createSeed())

/**
 * Everything about a game of Tetris that is not drawing: the engine state, gravity, keyboard input,
 * the Human and AI controllers, and reporting runs to the platform.
 * `TetrisGame.tsx` renders what this returns.
 */
export function useTetrisGame(props: GameProps<TetrisAI>) {
  const session = usePlaySession()
  const { mode, speed, paused } = session
  const { state, dispatch, reset, getState } = useEngine(newGame, updateTetris)
  // A human game waits for the player to start it; the AI starts on its own.
  const run = useHumanRun('tetris', props)
  const { started } = run
  const [decision, setDecision] = useState<TetrisDecision | null>(null)
  const [lineClear, setLineClear] = useState<LineClear | null>(null)
  // Present only for players allowed to use AI mode (admins); see GameProps.ai.
  const createAi = props.ai
  const ai = useMemo(() => createAi?.(), [createAi])

  // AI mode needs an AI: without one (a player who is not an admin) the game is human-only.
  const isAi = mode === 'ai' && ai !== undefined
  const playing = state.status === 'playing'
  const running = playing && !paused && (isAi || started)

  /** Sends one action through the engine. Both controllers go through here. */
  const apply = (action: TetrisAction): TetrisState => {
    const before = getState()
    const after = dispatch(action)
    const cleared = after.lines - before.lines
    if (cleared > 0) setLineClear({ id: after.lines, label: CLEAR_NAMES[cleared] })
    return after
  }

  /** The human controller: every input and every gravity step is an engine action. */
  const act = (action: TetrisAction) => {
    if (getState().status !== 'playing') return
    const after = apply(action)
    if (after.status === 'over') run.finish(after.score, { lines: after.lines, level: after.level })
  }

  // Human mode: gravity pulls the piece down, faster at every level. AI mode: the AI plays one
  // action per step and there is no gravity, so the playback speed alone sets the pace.
  useTicker(
    () => {
      if (!isAi || !ai) {
        act('TICK')
        return
      }
      const before = getState()
      const next = ai.decide(before)
      setDecision(next)
      // Safety net: an action that changes nothing would stall playback, so drop instead.
      if (apply(next.action) === before) apply('HARD_DROP')
    },
    running ? (isAi ? aiActionDelay(AI_ACTION_MS, speed) : gravityDelay(state.level)) : null,
  )

  const restart = () => {
    reset(newGame())
    run.reset()
    setDecision(null)
    setLineClear(null)
    session.setPaused(false)
  }

  const changeMode = (next: PlayMode) => {
    if (next === mode) return
    session.setMode(next)
    restart()
  }

  /** Human input from the keyboard or the touch buttons. */
  const control = (action: TetrisAction) => {
    if (isAi || !playing || paused) return
    // The first input only starts the run; it does not also move the piece.
    if (!run.begin()) act(action)
  }

  const canPause = playing && (isAi || started)

  useKeyboard((event) => {
    const action = KEY_ACTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key]
    if (action) {
      if (isAi) return false
      control(action)
      return true
    }
    if (event.key.toLowerCase() === 'p' && canPause) {
      session.togglePause()
      return true
    }
    if (event.key === 'Enter' && !isAi && playing && !started) {
      run.begin()
      return true
    }
    return false
  })

  let status: GameStatus
  if (!playing) status = 'over'
  else if (!isAi && !started) status = 'ready'
  else if (paused) status = 'paused'
  else status = 'playing'

  // Show the AI's chosen placement only while it still applies to the piece on screen.
  const target = isAi && decision?.target?.result.pieces === state.pieces + 1 ? decision.target : null

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
    start: run.begin,
    control,
    decision,
    target,
    lineClear,
    best: run.best,
    newBest: run.newBest,
  }
}
