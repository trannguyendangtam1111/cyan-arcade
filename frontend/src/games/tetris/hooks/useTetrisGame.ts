import { useEffect, useMemo, useRef, useState } from 'react'
import { aiActionDelay, type PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useEngine } from '@/games/shared/useEngine'
import { useFrameLoop } from '@/games/shared/useFrameLoop'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession } from '@/games/shared/usePlaySession'
import { useTicker } from '@/games/shared/useTicker'
import type { GameProps, GameStatus } from '@/games/types'
import type { TetrisAI, TetrisDecision } from '../ai/tetrisAi'
import { createTetrisGame, gravityDelay, updateTetris, type TimedRules } from '../engine/tetrisEngine'
import { PAUSE_ALLOWANCE_MS } from '../modes'
import { createStageGame, type ChallengeStage } from '../stages'
import type { TetrisAction, TetrisState } from '../types/tetrisTypes'
import { AI_FRAME_MS, playAiFrame, startAiClock } from './aiPlayback'
import { stepsDue } from './timedClock'

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

/**
 * Where a ranked timed run's server session stands. Its clock waits for the session: the server
 * times the run from the session's start, so game time played before it would count for nothing
 * there and could make a real run look faster than its session. `none`: no run yet, or one that
 * does not wait (Classic, unranked); `opening`: waiting for the server; `open`: the clock may run;
 * `failed`: the server could not open it, and the run never starts.
 */
export type RunConnection = 'none' | 'opening' | 'open' | 'failed'

/** The most recent line clear. `id` changes with every clear so its announcement replays. */
export interface LineClear {
  id: number
  label: string
}

/**
 * Everything about a game of Tetris that is not drawing: the engine state, gravity, keyboard input,
 * the Human and AI controllers, and reporting runs to the platform.
 * `TetrisGame.tsx` renders what this returns.
 *
 * @param timed makes every new game timed (see `TimedRules`); without it the game is Classic. Read
 * when a game is created, so a run keeps the rules it started with.
 * @param sessionMode the mode a human run is reported under when it begins (`ultra`, `sprint`);
 * without it, Classic. Its best on this device is kept apart from the others'. A timed run with a
 * mode is ranked against the server's clock: it starts once its session is open, and has the pause
 * allowance. A race (timed rules with a line goal: Sprint) is reported only when it reaches its goal,
 * its score the game time it took; its best on this device is the lowest.
 * @param stage a Challenge stage to play instead (its own clock, garbage and fixed seed; `timed` is
 * then the stage's): reported like a race, only once cleared, and under `sessionMode`, its mode
 * @param onStageCleared called once the server has recorded a human run's clear of the stage; never
 * for a refused or failed submission, and never for the AI
 */
export function useTetrisGame(
  props: GameProps<TetrisAI>,
  timed?: TimedRules,
  sessionMode?: string,
  stage?: ChallengeStage,
  onStageCleared?: (stage: ChallengeStage) => void,
) {
  const newGame = () => (stage ? createStageGame(stage) : createTetrisGame(createSeed(), timed))
  const session = usePlaySession()
  const { mode, speed, paused, setPaused } = session
  const { state, dispatch, reset, getState } = useEngine(newGame, updateTetris)
  // A timed game's real time not yet played as steps (under one step). Kept across pauses.
  const pendingMs = useRef(0)
  // A run with an objective is timed to it, its best the lowest time: Sprint, and every stage.
  const race = timed?.lineGoal !== undefined || stage !== undefined
  // A human game waits for the player to start it; the AI starts on its own.
  const run = useHumanRun(sessionMode ? `tetris-${sessionMode}` : 'tetris', props, race)
  const { started } = run
  // A ranked timed run (Ultra): timed by the server as well, from its session's start.
  const serverTimed = timed !== undefined && sessionMode !== undefined
  const [connection, setConnection] = useState<RunConnection>('none')
  // Which run a session answer belongs to: a restart makes any answer still on its way irrelevant.
  const runToken = useRef(0)
  // When this device started the run's clock (the session open), for the pause allowance.
  const clockStartedAt = useRef<number | null>(null)
  // Set once a ranked run has used up its pause allowance: it plays on, but is not submitted.
  const [unranked, setUnranked] = useState(false)

  /**
   * Begins the human run under its mode, once; the mode cannot change after that. A ranked timed
   * run asks the platform for the session it has just opened and starts its clock when the server
   * has answered: one session per run, never a second one while waiting.
   */
  const begin = (): boolean => {
    if (!run.begin(sessionMode)) return false
    const opening = serverTimed ? props.currentSession?.() : undefined
    if (!opening) {
      clockStartedAt.current = performance.now()
      setConnection(serverTimed ? 'open' : 'none')
      return true
    }
    const token = ++runToken.current
    setConnection('opening')
    opening.then(
      () => {
        if (runToken.current !== token) return
        clockStartedAt.current = performance.now()
        setConnection('open')
      },
      () => {
        if (runToken.current === token) setConnection('failed')
      },
    )
    return true
  }
  const waitingForServer = connection === 'opening' || connection === 'failed'
  const [decision, setDecision] = useState<TetrisDecision | null>(null)
  const [lineClear, setLineClear] = useState<LineClear | null>(null)
  const aiClock = useRef(startAiClock())
  // Present only for players allowed to use AI mode (admins); see GameProps.ai.
  const createAi = props.ai
  const ai = useMemo(() => createAi?.(), [createAi])

  // AI mode needs an AI: without one (a player who is not an admin) the game is human-only.
  const isAi = mode === 'ai' && ai !== undefined
  const playing = state.status === 'playing'
  const running = playing && !paused && (isAi || (started && !waitingForServer))
  // A timed game keeps game time in its state; a Classic game has no clock.
  const isTimed = state.clock !== undefined

  /** What is left of a ranked timed run's pause allowance, by this device's clock, at this game time. */
  function pauseLeftAt(gameMs: number): number {
    if (!serverTimed || clockStartedAt.current === null) return PAUSE_ALLOWANCE_MS
    return PAUSE_ALLOWANCE_MS - Math.max(0, performance.now() - clockStartedAt.current - gameMs)
  }

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
    if (after.status === 'over') {
      const { clock } = after
      // A ranked run past its pause allowance is not sent: the server would refuse it.
      if (unranked || (clock && pauseLeftAt(clock.elapsedMs) <= 0)) {
        setUnranked(true)
        return
      }
      if (clock && after.challenge) {
        // A stage counts only once cleared, like a race: a top-out or a timeout is a failed attempt,
        // never sent (the server would refuse it). A clear is sent as its game time, and opens the next
        // stage on this device only once the server has recorded it (`onSaved`).
        if (clock.goalReached && stage) {
          run.finish(
            clock.elapsedMs,
            {
              lines: after.lines,
              pieces: after.pieces,
              gameMs: clock.elapsedMs,
              garbage: after.challenge.garbageCleared,
            },
            () => onStageCleared?.(stage),
          )
        }
        return
      }
      if (clock?.lineGoal != null) {
        // A race counts only once finished: a top-out or a timeout before the goal is a failed
        // attempt, never sent (the server would refuse it). A finished one is ranked by its game time.
        if (clock.goalReached) {
          run.finish(clock.elapsedMs, {
            lines: after.lines,
            level: after.level,
            pieces: after.pieces,
            gameMs: clock.elapsedMs,
          })
        }
        return
      }
      run.finish(after.score, {
        lines: after.lines,
        level: after.level,
        pieces: after.pieces,
        // A timed run also reports its game time and whether it ran out.
        ...(clock && { gameMs: clock.elapsedMs, timeUp: clock.timeUp ? 1 : 0 }),
      })
    }
  }

  // Human Classic mode: gravity pulls the piece down in real time, faster at every level. AI mode: the
  // same gravity in game time, one frame per step (see aiPlayback); the playback speed sets how long a
  // frame takes, so it changes the pace and never the game. A human timed game has no ticker: its
  // clock runs on the frame loop below.
  useTicker(
    () => {
      if (!isAi || !ai) {
        act('TICK')
        return
      }
      const decide = (current: TetrisState) => {
        const next = ai.decide(current)
        setDecision(next)
        return next.action
      }
      aiClock.current = playAiFrame(getState(), aiClock.current, decide, apply)
    },
    running ? (isAi ? aiActionDelay(AI_FRAME_MS, speed) : isTimed ? null : gravityDelay(state.level)) : null,
  )

  // Human timed mode: the real time of each frame (capped by useFrameLoop) is played as whole steps of
  // the game's clock, which bring gravity with them. Game time never runs ahead of real time; the part
  // of a step left over waits for the next frame, across pauses too. Stopped while paused, before the
  // first input and in Classic, so a Classic game runs no frame loop at all.
  useFrameLoop(
    (frameMs) => {
      const due = stepsDue(pendingMs.current, frameMs)
      pendingMs.current = due.pendingMs
      for (let step = 0; step < due.steps && getState().status === 'playing'; step++) act('STEP')
    },
    running && isTimed && !isAi,
  )

  // A timed run never goes on unseen: hiding the tab pauses it. Classic keeps its behaviour.
  const autoPause = isTimed && !isAi && running
  useEffect(() => {
    if (!autoPause) return
    const onVisibility = () => {
      if (document.hidden) setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [autoPause, setPaused])

  const restart = () => {
    runToken.current++
    clockStartedAt.current = null
    setConnection('none')
    setUnranked(false)
    pendingMs.current = 0
    aiClock.current = startAiClock()
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
    if (isAi || !playing || paused || waitingForServer) return
    // Gravity and the clock are the game's, never a player's input.
    if (action === 'TICK' || action === 'STEP') return
    // The first input only starts the run; it does not also move the piece.
    if (!begin()) act(action)
  }

  const canPause = playing && (isAi || (started && !waitingForServer))

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
      begin()
      return true
    }
    return false
  })

  let status: GameStatus
  if (!playing) status = 'over'
  else if (!isAi && !started) status = 'ready'
  else if (paused) status = 'paused'
  else status = 'playing'

  // A human timed run may take longer in real time than its game time by the pause allowance, no
  // more: real time since the run began, minus the game time played, is what it has used (pauses, a
  // hidden tab, dropped frames). Counted by this device from the run's first input, so never less
  // than the server counts from the session's start. Re-read every quarter second while paused.
  const [, setPauseTick] = useState(0)
  const allowanceApplies = serverTimed && !isAi && playing && connection === 'open'
  useTicker(() => setPauseTick((tick) => tick + 1), allowanceApplies && paused ? 250 : null)
  const pauseLeftMs = allowanceApplies && state.clock ? pauseLeftAt(state.clock.elapsedMs) : null
  // Used up: the run becomes unranked for good, even if a later reading came out a hair above zero.
  const usedUp = pauseLeftMs !== null && pauseLeftMs <= 0
  useEffect(() => {
    if (usedUp) setUnranked(true)
  }, [usedUp])

  // Show the AI's chosen placement only while it still applies to the piece on screen.
  const target = isAi && decision?.target?.result.pieces === state.pieces + 1 ? decision.target : null

  return {
    state,
    status,
    isTimed,
    // A paused timed run shows neither the board nor the next pieces, so a pause gives no time to plan.
    hideBoard: isTimed && !isAi && status === 'paused',
    /**
     * What is left of a ranked timed run's pause allowance, in ms, by this device's count (negative
     * once used up); `null` when none applies. The server keeps its own count, which decides.
     */
    pauseLeftMs,
    /** Whether this ranked run has used up its pause allowance: it is played on, never submitted. */
    unranked,
    /** Where the run's server session stands; a ranked timed run waits for it to be open. */
    connection,
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
    start: begin,
    control,
    decision,
    target,
    lineClear,
    best: run.best,
    newBest: run.newBest,
  }
}
