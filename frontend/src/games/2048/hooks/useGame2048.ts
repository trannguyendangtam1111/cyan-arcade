import { useMemo, useRef, useState } from 'react'
import { aiActionDelay, type PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession, type PlaySession } from '@/games/shared/usePlaySession'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps, GameStatus } from '@/games/types'
import type { Game2048AI, Game2048Decision } from '../ai/game2048Ai'
import {
  advanceClock,
  applyAiMove,
  applyMove,
  asksToKeepGoing,
  createGame2048,
  highestTile,
  moveLimitOutcome,
  movesLeft,
  puzzleOutcome,
  slide,
  timeAttackOutcome,
  timeLeftMs,
} from '../engine/game2048Engine'
import { createPuzzleGame, type PuzzleStage } from '../engine/game2048Puzzles'
import { PAUSE_ALLOWANCE_MS, type Game2048Ruleset } from '../modes'
import type { Game2048State, Move } from '../types/game2048Types'
import { useTimeAttackClock } from './useTimeAttackClock'

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

/**
 * Everything that changes a game: a human's move, an AI's move (which costs game time in a timed run,
 * whatever the playback speed) and steps of a human timed run's clock.
 */
type Game2048Action = { kind: 'move'; move: Move } | { kind: 'ai'; move: Move } | { kind: 'clock'; steps: number }

function update(state: Game2048State, action: Game2048Action): Game2048State {
  switch (action.kind) {
    case 'move':
      return applyMove(state, action.move)
    case 'ai':
      return applyAiMove(state, action.move)
    case 'clock':
      return advanceClock(state, action.steps)
  }
}

/**
 * Where a timed human run's server session stands. Its clock runs only once the server has opened the
 * session, so the server's count of the run's time never starts after the game time does.
 */
export type RunConnection = 'none' | 'opening' | 'open' | 'failed'

/** What a run reports: Classic's details, and for a timed run its game time and whether it ran out. */
const details = (state: Game2048State) => ({
  highestTile: highestTile(state.board),
  moves: state.moves,
  ...(state.clock && { gameMs: state.clock.elapsedMs, timeUp: state.clock.timeUp ? 1 : 0 }),
})

/**
 * Everything about a game of 2048 that is not drawing: the engine state, keyboard input, the Human
 * and AI controllers, the win decision, a timed run's clock and pauses, and reporting runs to the
 * platform. `Game2048.tsx` renders what this returns.
 *
 * @param shared who plays, at what speed and whether paused; given by a screen that keeps them across
 * rulesets, or kept here
 * @param ruleset the ruleset every game is played under (fixed for this hook's life); without it,
 * Classic. A human run is reported under its mode, and its best on this device is kept apart.
 * @param available whether a human run may begin: `false` while the server no longer declares the
 * ruleset's mode, so a run of it is never reported under another mode. The AI plays regardless.
 * @param onStageCleared a Puzzle stage: runs once the server has recorded a human clear of it, never
 * for a clear that was not sent, was refused or could not be saved, and never for the AI's
 */
export function useGame2048(
  props: GameProps<Game2048AI>,
  shared?: PlaySession,
  ruleset?: Game2048Ruleset,
  available = true,
  onStageCleared?: (stage: PuzzleStage) => void,
) {
  const stage = ruleset?.stage
  // A Puzzle stage always starts from its own board and seed; the other rulesets from a new seed.
  const newGame = () => {
    if (stage) return createPuzzleGame(stage)
    return ruleset
      ? createGame2048(createSeed(), { moveLimit: ruleset.moveLimit, timeLimitMs: ruleset.timeLimitMs })
      : createGame2048(createSeed())
  }
  const own = usePlaySession()
  const session = shared ?? own
  const { mode, speed, paused } = session
  const { state, dispatch, reset, getState } = useEngine(newGame, update)
  const run = useHumanRun(ruleset ? `2048-${ruleset.mode}` : '2048', props)
  const [decision, setDecision] = useState<Game2048Decision | null>(null)
  // Reaching 2048 wins Classic. A human is then asked whether to keep going for a higher tile. Other
  // rulesets play straight on (`asksToKeepGoing`).
  const [keptGoing, setKeptGoing] = useState(false)
  // Present only for players allowed to use AI mode (admins); see GameProps.ai.
  const createAi = props.ai
  const ai = useMemo(() => createAi?.(), [createAi])

  // A timed run (Time Attack) keeps game time in its state; Classic and Moves Limit have no clock.
  const timed = ruleset?.timeLimitMs !== undefined
  const [connection, setConnection] = useState<RunConnection>('none')
  // Which run a session answer belongs to: a restart makes any answer still on its way irrelevant.
  const runToken = useRef(0)
  // When this device started the run's clock (the session open), for the pause allowance.
  const [clockStartedAt, setClockStartedAt] = useState<number | null>(null)
  // Set once a timed run has used up its pause allowance: it plays on, but is not submitted.
  const [unranked, setUnranked] = useState(false)
  // What was left of the pause allowance when a timed human run ended, for the finished run's stats.
  const [pauseLeftAtEnd, setPauseLeftAtEnd] = useState<number | null>(null)

  // AI mode needs an AI: without one (a player who is not an admin) the game is human-only.
  const isAi = mode === 'ai' && ai !== undefined
  const playing = state.status === 'playing'
  const aiDelay = aiActionDelay(AI_MOVE_MS, speed)
  const awaitingWinDecision = (current: Game2048State) => asksToKeepGoing(current) && current.won && !keptGoing
  const waitingForServer = connection === 'opening' || connection === 'failed'

  /**
   * What is left of a timed run's pause allowance, by this device's clock, at this game time: real
   * time since the clock started, less the game time played, is what the run has used (pauses, a
   * hidden tab, dropped frames). The server keeps its own count, from the session's start, which
   * decides; this one only tells the player and keeps a run the server would refuse from being sent.
   */
  function pauseLeftAt(gameMs: number): number {
    if (clockStartedAt === null) return PAUSE_ALLOWANCE_MS
    return PAUSE_ALLOWANCE_MS - Math.max(0, performance.now() - clockStartedAt - gameMs)
  }

  /** Reports a human run the engine has just ended, once. */
  const finishRun = (after: Game2048State) => {
    if (after.clock) setPauseLeftAtEnd(pauseLeftAt(after.clock.elapsedMs))
    // A timed run past its pause allowance is not sent: the server would refuse it.
    if (after.clock && (unranked || pauseLeftAt(after.clock.elapsedMs) <= 0)) {
      setUnranked(true)
      return
    }
    // A Puzzle stage counts only once cleared: running out of moves, or getting stuck, is a failed
    // attempt and never sent (the server would refuse it). A clear opens the next stage on this device
    // only once the server has recorded it (`onSaved`).
    if (stage) {
      if (puzzleOutcome(after) === 'cleared') run.finish(after.score, details(after), () => onStageCleared?.(stage))
      return
    }
    // Over: no move left, every move used (Moves Limit) or the time up (Time Attack). All are reported.
    run.finish(after.score, details(after))
  }

  /**
   * Begins the human run under its mode, once; the mode cannot change after that. A timed run asks
   * the platform for the session it has just opened, and its clock starts when the server has answered:
   * one session per run, never a second one while waiting.
   */
  const begin = () => {
    if (!(ruleset ? run.begin(ruleset.mode) : run.begin())) return
    if (!timed) return
    const opening = props.currentSession?.()
    if (!opening) {
      setClockStartedAt(performance.now())
      setConnection('open')
      return
    }
    const token = ++runToken.current
    setConnection('opening')
    opening.then(
      () => {
        if (runToken.current !== token) return
        setClockStartedAt(performance.now())
        setConnection('open')
      },
      () => {
        if (runToken.current === token) setConnection('failed')
      },
    )
  }

  // The AI controller: think about the current board, then make that move through the engine.
  // It plays straight through 2048 without stopping, and stops when the engine ends the run (with a
  // move limit, after its last move; timed, when its game time is up). Each of its moves costs a
  // timed run the same game time at every playback speed. It never reports a run.
  useTicker(
    () => {
      if (!ai) return
      const next = ai.decide(getState())
      setDecision(next)
      dispatch({ kind: 'ai', move: next.action })
    },
    isAi && playing && !paused ? aiDelay : null,
  )

  // A human timed run's clock: real time played as whole steps of game time, from the first valid move
  // (once the server has opened the run) while not paused and the tab is visible. Hiding the tab pauses
  // the run. Time running out between two moves ends and reports the run, once.
  const clock = useTimeAttackClock({
    active: timed && !isAi && run.started && connection === 'open' && playing,
    paused,
    onSteps: (steps) => {
      const before = getState()
      const after = dispatch({ kind: 'clock', steps })
      if (before.status === 'playing' && after.status === 'over') finishRun(after)
      // Dropped frames count against the allowance too (see `pauseLeftAt`).
      else if (after.clock && pauseLeftAt(after.clock.elapsedMs) <= 0) setUnranked(true)
    },
    onHidden: () => session.setPaused(true),
  })

  const restart = () => {
    // A human Classic run that reached 2048 is a finished, winning run, not an abandoned one. A run
    // of another ruleset is reported only once the engine ends it.
    const current = getState()
    if (!isAi && asksToKeepGoing(current) && current.won && current.status === 'playing') {
      run.finish(current.score, details(current))
    }

    runToken.current++
    setClockStartedAt(null)
    setConnection('none')
    setUnranked(false)
    setPauseLeftAtEnd(null)
    clock.reset()
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
    if (isAi || current.status !== 'playing' || awaitingWinDecision(current)) return
    if (!run.started && !available) return
    // A Puzzle stage opens its run with the first valid move: a move that changes nothing opens nothing.
    if (stage && !run.started && !slide(current.board, move).moved) return
    if (timed) {
      // A timed run takes no move while paused or before its clock can run.
      if (paused || waitingForServer) return
      // Its clock starts with the first valid move: a move that changes nothing does not start it.
      if (!run.started && !slide(current.board, move).moved) return
    }

    // The first input of a human game starts the run, under the ruleset's mode.
    begin()
    const after = dispatch({ kind: 'move', move })
    if (current.status === 'playing' && after.status === 'over') finishRun(after)
  }

  // A human timed run can be paused once its clock runs, which hides the board; the AI's playback can
  // always be paused. A human Classic or Moves Limit game is turn-based and has nothing to pause.
  const canPause = playing && (isAi || (timed && run.started && connection === 'open'))

  useKeyboard((event) => {
    const move = KEY_MOVES[event.key.length === 1 ? event.key.toLowerCase() : event.key]
    if (move) {
      if (isAi) return false
      play(move)
      return true
    }
    if (canPause && (event.key === ' ' || event.key.toLowerCase() === 'p')) {
      session.togglePause()
      return true
    }
    return false
  })

  let status: GameStatus
  if (!playing) status = 'over'
  else if (!isAi && awaitingWinDecision(state)) status = 'won'
  else if (paused && canPause) status = 'paused'
  else status = 'playing'

  // The pause allowance of a human timed run, re-read every quarter second while paused (the clock
  // stands still then, so nothing else re-renders). Once used up the run is unranked for good, even if
  // a later reading came out a hair above zero.
  const [, setPauseTick] = useState(0)
  const allowanceApplies = timed && !isAi && playing && connection === 'open'
  useTicker(
    () => {
      setPauseTick((tick) => tick + 1)
      const { clock: current } = getState()
      if (current && pauseLeftAt(current.elapsedMs) <= 0) setUnranked(true)
    },
    allowanceApplies && paused ? 250 : null,
  )
  const pauseLeftMs = allowanceApplies && state.clock ? pauseLeftAt(state.clock.elapsedMs) : null

  return {
    state,
    status,
    mode,
    isAi,
    aiAvailable: ai !== undefined,
    speed,
    setSpeed: session.setSpeed,
    paused,
    togglePause: session.togglePause,
    canPause,
    changeMode,
    restart,
    play,
    /** Dismisses the win screen and lets the player chase a higher tile. */
    keepGoing: () => setKeptGoing(true),
    decision,
    highestTile: highestTile(state.board),
    best: run.best,
    newBest: run.newBest,
    /** Whether the player has made the first move of this run. */
    started: run.started,
    /** Whether a human run is under way: the ruleset cannot change until it ends. */
    runInProgress: !isAi && run.started && playing,
    /** With a move limit, the valid moves left; `null` in Classic. */
    movesLeft: movesLeft(state),
    /** With a move limit, how the run stands (`limit-reached` or `stuck` once over); `null` in Classic. */
    outcome: moveLimitOutcome(state),
    /** The Puzzle stage played, if any. */
    stage,
    /** A Puzzle stage: how it stands (`cleared`, `out-of-moves` or `stuck` once over); else `null`. */
    puzzleOutcome: puzzleOutcome(state),
    /** Whether the run is timed (Time Attack). */
    timed,
    /** Timed: the game time left and how the run stands (`time-up` or `stuck` once over); else `null`. */
    timeLeftMs: timeLeftMs(state),
    timeOutcome: timeAttackOutcome(state),
    /**
     * A paused human timed run (also one paused by hiding the tab) shows no board, so a pause gives no
     * time to plan.
     */
    hideBoard: timed && !isAi && playing && run.started && clock.boardHidden,
    /**
     * What is left of a timed run's pause allowance, in ms, by this device's count (negative once used
     * up); `null` when none applies. The server keeps its own count, which decides.
     */
    pauseLeftMs,
    /** A finished timed human run: what was left of its pause allowance when it ended; else `null`. */
    pauseLeftAtEndMs: playing ? null : pauseLeftAtEnd,
    /** Whether this timed run has used up its pause allowance: it is played on, never submitted. */
    unranked: unranked || (pauseLeftMs !== null && pauseLeftMs <= 0),
    /** Where a timed human run's server session stands; its clock waits for it to be open. */
    connection,
    slideMs: isAi ? Math.min(SLIDE_MS, aiDelay * 0.7) : SLIDE_MS,
  }
}
