import { useState } from 'react'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps } from '@/games/types'
import {
  createMinesweeper,
  minesLeft,
  minesweeperDetails,
  minesweeperScore,
  updateMinesweeper,
} from '../engine/minesweeperEngine'
import type { MinesweeperState } from '../types/minesweeperTypes'

/** What a tap or a click does: uncover the cell, or put a flag on it. Right click always flags. */
export type Tool = 'reveal' | 'flag'

const newGame = () => createMinesweeper(createSeed())

/** How often the clock on screen catches up while a game is on. */
const CLOCK_TICK_MS = 250

const isOver = (state: MinesweeperState) => state.status === 'won' || state.status === 'lost'

/**
 * Everything about a game of Minesweeper that is not drawing: the engine state, the reveal/flag
 * tool, the clock, and reporting the run to the platform. `MinesweeperGame.tsx` renders it.
 *
 * The run begins with the first reveal (when the mines are laid) and ends when the board is
 * cleared or a mine goes off; its score and details come from the engine.
 */
export function useMinesweeperGame(props: GameProps) {
  const { state, dispatch, reset, getState } = useEngine(newGame, updateMinesweeper)
  const run = useHumanRun('minesweeper', props)
  const [tool, setTool] = useState<Tool>('reveal')
  const [seconds, setSeconds] = useState(0)

  useTicker(() => setSeconds(Math.floor(run.elapsedMs() / 1000)), state.status === 'playing' ? CLOCK_TICK_MS : null)

  const reveal = (index: number) => {
    const before = getState()
    if (isOver(before)) return
    const after = dispatch({ type: 'REVEAL', index })
    if (after === before) return
    // The first reveal of a game starts the run, and the clock.
    if (before.status === 'ready') run.begin()
    if (isOver(after)) {
      const final = Math.floor(run.elapsedMs() / 1000)
      setSeconds(final)
      run.finish(minesweeperScore(after, final), minesweeperDetails(after, final))
    }
  }

  const flag = (index: number) => {
    dispatch({ type: 'FLAG', index })
  }

  /** A tap or a left click: whatever the tool says. */
  const act = (index: number) => (tool === 'flag' ? flag(index) : reveal(index))

  const restart = () => {
    reset(newGame())
    run.reset()
    setSeconds(0)
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
    seconds,
    minesLeft: minesLeft(state),
    score: minesweeperScore(state, seconds),
    best: run.best,
    newBest: run.newBest,
  }
}
