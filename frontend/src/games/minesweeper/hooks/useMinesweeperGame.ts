import { useRef, useState } from 'react'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps } from '@/games/types'
import {
  TIMED_LIMIT_MS,
  createMinesweeper,
  minesLeft,
  minesweeperDetails,
  minesweeperScore,
  minesweeperTimedDetails,
  updateMinesweeper,
} from '../engine/minesweeperEngine'
import { createTimedSeed, type MinesweeperRuleset } from '../modes'
import type { MinesweeperState } from '../types/minesweeperTypes'

/** What a tap or a click does: uncover the cell, or put a flag on it. Right click always flags. */
export type Tool = 'reveal' | 'flag'

/** How often the clock on screen catches up while a game is on: Classic counts seconds, a race hundredths. */
const CLOCK_TICK_MS = 250
const TIMED_TICK_MS = 50

const isOver = (state: MinesweeperState) => state.status === 'won' || state.status === 'lost'

/**
 * A run's server session: not asked for yet, being opened, open, or refused / unreachable. The first
 * reveal and the clock wait for `open`.
 */
type Connection = 'none' | 'opening' | 'open' | 'failed'

/**
 * Everything about a game of Minesweeper that is not drawing: the engine state, the reveal/flag
 * tool, the clock, and reporting the run to the platform. `MinesweeperGame.tsx` renders it.
 *
 * The run begins with the first reveal (when the mines are laid) and ends when the board is
 * cleared or a mine goes off; its score and details come from the engine.
 *
 * Classic scores points. A timed ruleset (Beginner, Intermediate, Expert) is a race on its own board:
 * its clock is the time since the first reveal by `performance.now()`, which keeps running in a hidden
 * tab, and only a cleared board within {@link TIMED_LIMIT_MS} is reported, as its game time in
 * milliseconds with the seed and first cell the server lays the mines from. A loss, or a board still
 * covered when the limit is reached, is never sent.
 *
 * In every mode, the first reveal opens the run's server session and waits for it: the cell is
 * uncovered and the clock starts only once the server has answered, so a slow session start never
 * counts as game time (the server holds a race's milliseconds, and Classic's seconds, to its own
 * session time). Until then the board takes no input; if the session cannot be opened, the board stays
 * covered, no run is played, and the game is set up again with `restart`.
 *
 * @param ruleset the race played, or none for Classic
 * @param available whether the server still declares the ruleset: a run of one it no longer declares
 * does not start (it is never played as Classic instead)
 */
export function useMinesweeperGame(props: GameProps, ruleset?: MinesweeperRuleset, available = true) {
  const newGame = () =>
    ruleset ? createMinesweeper(createTimedSeed(), ruleset.config) : createMinesweeper(createSeed())
  const { state, dispatch, reset, getState } = useEngine(newGame, updateMinesweeper)
  const run = useHumanRun(ruleset ? `minesweeper-${ruleset.mode}` : 'minesweeper', props, ruleset !== undefined)
  const [tool, setTool] = useState<Tool>('reveal')
  const [elapsedMs, setElapsedMs] = useState(0)
  // A race whose clock reached the limit before the board was cleared: it ends there, unsent.
  const [timedOut, setTimedOut] = useState(false)
  const [connection, setConnection] = useState<Connection>('none')
  // Which run a session answer belongs to: a restart makes any answer still on its way irrelevant.
  const runToken = useRef(0)
  // When the run's clock started (its session open, its first cell uncovered); null before that.
  const clockStartedAt = useRef<number | null>(null)
  const seconds = Math.floor(elapsedMs / 1000)

  /** Game time, from the clock's start. */
  const gameTime = () => (clockStartedAt.current === null ? run.elapsedMs() : performance.now() - clockStartedAt.current)

  const playing = state.status === 'playing' && !timedOut
  useTicker(
    () => {
      const now = gameTime()
      if (ruleset && now >= TIMED_LIMIT_MS) {
        setElapsedMs(TIMED_LIMIT_MS)
        setTimedOut(true)
        return
      }
      // Classic shows whole seconds: the same value again re-renders nothing.
      setElapsedMs(ruleset ? now : Math.floor(now / 1000) * 1000)
    },
    playing ? (ruleset ? TIMED_TICK_MS : CLOCK_TICK_MS) : null,
  )

  const reveal = (index: number) => {
    const before = getState()
    if (isOver(before) || timedOut) return
    if (before.status === 'ready') {
      // A ruleset the server no longer declares cannot start a run.
      if (available) startRun(before, index)
      return
    }
    settle(dispatch({ type: 'REVEAL', index }))
  }

  /**
   * The first reveal: opens the run's session under its mode (once; the run's start is guarded against
   * a second click) and uncovers the cell when the server has answered, starting the clock at that
   * moment. Without a platform session to wait for, it starts at once.
   */
  const startRun = (before: MinesweeperState, index: number) => {
    if (updateMinesweeper(before, { type: 'REVEAL', index }) === before) return
    if (!(ruleset ? run.begin(ruleset.mode) : run.begin())) return
    const open = () => {
      clockStartedAt.current = performance.now()
      setConnection('open')
      settle(dispatch({ type: 'REVEAL', index }))
    }
    const opening = props.currentSession?.()
    if (!opening) {
      open()
      return
    }
    const token = ++runToken.current
    setConnection('opening')
    opening.then(
      () => {
        if (runToken.current === token && getState().status === 'ready') open()
      },
      () => {
        if (runToken.current === token) setConnection('failed')
      },
    )
  }

  /** After a reveal: a finished game is reported (a race only when cleared within the limit). */
  const settle = (after: MinesweeperState) => {
    if (!isOver(after)) return
    if (ruleset) {
      const gameMs = Math.max(1, Math.floor(gameTime()))
      setElapsedMs(gameMs)
      // Only a cleared board within the limit is a finished race; anything else is not sent.
      if (after.status !== 'won' || gameMs > TIMED_LIMIT_MS) {
        if (gameMs > TIMED_LIMIT_MS) setTimedOut(true)
        return
      }
      run.finish(gameMs, minesweeperTimedDetails(after, gameMs))
      return
    }
    const final = Math.floor(gameTime() / 1000)
    setElapsedMs(final * 1000)
    run.finish(minesweeperScore(after, final), minesweeperDetails(after, final))
  }

  const flag = (index: number) => {
    if (timedOut) return
    dispatch({ type: 'FLAG', index })
  }

  /** A tap or a left click: whatever the tool says. */
  const act = (index: number) => (tool === 'flag' ? flag(index) : reveal(index))

  const restart = () => {
    runToken.current++
    clockStartedAt.current = null
    setConnection('none')
    reset(newGame())
    run.reset()
    setElapsedMs(0)
    setTimedOut(false)
    setTool('reveal')
  }

  return {
    state,
    tool,
    setTool,
    act,
    reveal,
    flag,
    restart,
    /** Classic's clock, in whole seconds. */
    seconds,
    /** A race's clock, in milliseconds. */
    elapsedMs,
    timed: ruleset !== undefined,
    timedOut,
    /** The first reveal is waiting for the run's server session. */
    starting: connection === 'opening',
    /** The run's session could not be opened: nothing was played, and `restart` sets it up again. */
    startFailed: connection === 'failed',
    /** A run is under way: started, and not over. The mode cannot change until it is. */
    runInProgress: run.started && !isOver(state) && !timedOut && connection !== 'failed',
    minesLeft: minesLeft(state),
    score: minesweeperScore(state, seconds),
    /** The device's best: Classic's highest score, a race's lowest time (0 for none yet). */
    best: run.best,
    newBest: run.newBest,
  }
}
