import { createSeed } from '@/games/shared/random'
import { BOARDS, type BoardName } from './engine/minesweeperEngine'
import type { MinesweeperConfig } from './types/minesweeperTypes'

/**
 * The timed races Minesweeper can be played as besides Classic, each a mode of its own on the server
 * (`gamerules.MinesweeperRunRules`), offered only while the server declares it. A race is a board of
 * its own, cleared as fast as possible: ranked by game time in milliseconds, lowest first. Classic is
 * the points game on Beginner's board.
 */
export interface MinesweeperRuleset {
  /** The mode ID, as the server declares it. */
  mode: 'beginner' | 'intermediate' | 'expert'
  name: string
  board: BoardName
  config: MinesweeperConfig
  /** What the player is asked to do, in a sentence. */
  objective: string
}

export const CLASSIC = 'classic'

const race = (mode: MinesweeperRuleset['mode'], name: string): MinesweeperRuleset => {
  const config = BOARDS[mode]
  const size = `${config.rows} × ${config.columns}`
  return {
    mode,
    name,
    board: mode,
    config,
    objective: `Clear the ${size} board with ${config.mines} mines as fast as you can. The clock starts with your first square and never stops.`,
  }
}

export const TIMED_MODES: readonly MinesweeperRuleset[] = [
  race('beginner', 'Beginner'),
  race('intermediate', 'Intermediate'),
  race('expert', 'Expert'),
]

/** A timed ruleset by mode, or `undefined` for Classic and anything else. */
export const findTimedMode = (mode: string) => TIMED_MODES.find((option) => option.mode === mode)

/** Where a mode's leaderboard is: each timed mode has its own, fastest first. */
export const leaderboardPath = (mode: string) =>
  mode === CLASSIC ? '/leaderboard?game=minesweeper' : `/leaderboard?game=minesweeper&mode=${encodeURIComponent(mode)}`

/**
 * The seed of a timed game: below 2^31. A run reports its seed for the server to lay the same mines
 * again, and the platform takes only details from 0 up; the generator lays the same mines from it.
 */
export const createTimedSeed = () => createSeed() >>> 1
