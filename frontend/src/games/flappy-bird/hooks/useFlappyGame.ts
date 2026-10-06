import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession } from '@/games/shared/usePlaySession'
import type { GameProps, GameStatus } from '@/games/types'
import type { FlappyAI, FlappyDecision } from '../ai/flappyAi'
import { levelFor } from '../engine/difficulty'
import { advance, createFlappyGame, flap, runDetails, WORLD } from '../engine/flappyEngine'
import { canvasFrame } from '../render/canvasFrame'
import { drawScene } from '../render/drawScene'
import type { Outfit } from '../skins'
import type { CrashCause, FlappyState, FlightStatus } from '../types/flappyTypes'
import { useFrameLoop } from './useFrameLoop'

/** How long the AI waits on the start screen before taking off, and after a crash before trying again. */
const AI_TAKEOFF_MS = 600
const AI_RETRY_MS = 1400
/** After a crash, a flap this soon does not start a new game: it was meant for the old one. */
const RESTART_GRACE_MS = 450
/** How often the AI panel shows the AI's latest decision; it makes up to 30 a second. */
const DECISION_REFRESH_MS = 150

/** How the AI has done since AI mode was switched on. */
export interface AiStats {
  flights: number
  best: number
  totalPipes: number
  last: number | null
}

const NO_AI_STATS: AiStats = { flights: 0, best: 0, totalPipes: 0, last: null }

/** The few things the screen re-renders for. Everything else changes every frame and lives in a ref. */
interface Hud {
  status: FlightStatus
  score: number
  crash: CrashCause | null
}

const hudOf = (state: FlappyState): Hud => ({ status: state.status, score: state.score, crash: state.crash })

const newFlight = () => createFlappyGame(createSeed())

/**
 * Everything about a game of Flappy Bird that is not layout: the flight (in a ref, advanced by an
 * animation-frame loop and drawn straight onto the canvas, so React only re-renders when the score
 * or the status changes), human and AI control, pausing, and reporting human runs to the platform.
 * `FlappyBirdGame.tsx` lays out what this returns.
 */
export function useFlappyGame(props: GameProps<FlappyAI>, outfit: Outfit) {
  const session = usePlaySession()
  const { mode, speed, paused, setPaused } = session
  const run = useHumanRun('flappy-bird', props)
  // Present only for players allowed to use AI mode (admins); see GameProps.ai.
  const createAi = props.ai
  const ai = useMemo(() => createAi?.(), [createAi])
  const isAi = mode === 'ai' && ai !== undefined

  const [initial] = useState(newFlight)
  const flight = useRef(initial)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const outfitRef = useRef(outfit)
  const [hud, setHud] = useState<Hud>(() => hudOf(initial))
  const [customizing, setCustomizing] = useState(false)
  const [decision, setDecision] = useState<FlappyDecision | null>(null)
  const [aiStats, setAiStats] = useState<AiStats>(NO_AI_STATS)
  const latestDecision = useRef<FlappyDecision | null>(null)
  const clocks = useRef({ waiting: 0, sinceDecision: 0, crashedAt: 0 })

  const sync = useCallback((state: FlappyState) => {
    setHud((shown) =>
      shown.status === state.status && shown.score === state.score && shown.crash === state.crash ? shown : hudOf(state),
    )
  }, [])

  const draw = useCallback((nowMs: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // One scale across and down (see canvasFrame): the picture is the world, unstretched.
    const scale = canvas.width / WORLD.width
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawScene(ctx, flight.current, outfitRef.current, nowMs / 1000)
  }, [])

  // A new outfit shows at once, even while nothing moves (paused, or after a crash).
  useEffect(() => {
    outfitRef.current = outfit
    draw(performance.now())
  }, [outfit, draw])

  // The canvas has as many pixels as the screen shows (up to 2 per CSS pixel), at the playfield's shape.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const frame = canvasFrame(canvas.clientWidth, window.devicePixelRatio)
      canvas.width = frame.width
      canvas.height = frame.height
      draw(performance.now())
    }
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    fit()
    return () => observer.disconnect()
  }, [draw])

  const restart = useCallback(() => {
    flight.current = newFlight()
    clocks.current = { waiting: 0, sinceDecision: 0, crashedAt: 0 }
    run.reset()
    setPaused(false)
    setDecision(null)
    latestDecision.current = null
    sync(flight.current)
    draw(performance.now())
  }, [run, setPaused, sync, draw])

  const onFrame = (elapsedMs: number, nowMs: number) => {
    const before = flight.current
    let state = before
    if (isAi && ai) {
      if (state.status === 'ready') {
        clocks.current.waiting += elapsedMs
        if (clocks.current.waiting >= AI_TAKEOFF_MS) state = flap(state)
      } else if (state.status === 'playing') {
        // Playback speed only changes how much game time passes per frame. The AI still decides
        // before every step of it, exactly as at 1x.
        state = advance(state, elapsedMs * speed, (current) => {
          const next = ai.decide(current)
          if (next.strategy !== 'waiting') latestDecision.current = next
          return next.action === 'flap'
        })
        clocks.current.sinceDecision += elapsedMs
        if (clocks.current.sinceDecision >= DECISION_REFRESH_MS) {
          clocks.current.sinceDecision = 0
          setDecision(latestDecision.current)
        }
      } else {
        clocks.current.waiting += elapsedMs
        if (clocks.current.waiting >= AI_RETRY_MS) {
          state = newFlight()
          clocks.current.waiting = 0
        }
      }
      if (before.status === 'playing' && state.status === 'over') {
        const pipes = state.score
        clocks.current.waiting = 0
        setAiStats((stats) => ({
          flights: stats.flights + 1,
          best: Math.max(stats.best, pipes),
          totalPipes: stats.totalPipes + pipes,
          last: pipes,
        }))
      }
    } else if (state.status === 'playing') {
      state = advance(state, elapsedMs)
      if (state.status === 'over') {
        clocks.current.crashedAt = nowMs
        run.finish(state.score, runDetails(state))
      }
    }
    flight.current = state
    sync(state)
    draw(nowMs)
  }

  // Frames run while something moves: the bird bobbing on the start screen, a flight, and, in AI
  // mode, the pause between one flight and the next. Paused, crashed or customizing: nothing runs.
  const looping = !paused && !customizing && (hud.status !== 'over' || isAi)
  useFrameLoop(onFrame, looping)

  /** A human flap. The first one starts the flight and the run. Returns whether the input was used. */
  const flapNow = (): boolean => {
    if (isAi) return false
    if (paused || customizing) return true
    const state = flight.current
    if (state.status === 'over') {
      if (performance.now() - clocks.current.crashedAt >= RESTART_GRACE_MS) restart()
      return true
    }
    if (state.status === 'ready') run.begin()
    flight.current = flap(state)
    sync(flight.current)
    return true
  }

  const canPause = hud.status === 'playing'

  const togglePause = useCallback(() => {
    if (flight.current.status === 'playing') session.togglePause()
  }, [session])

  const changeMode = (next: PlayMode) => {
    if (next === mode) return
    session.setMode(next)
    setAiStats(NO_AI_STATS)
    restart()
  }

  // A flight in progress pauses itself when the tab is hidden: nobody loses to a notification.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && flight.current.status === 'playing') setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [setPaused])

  useKeyboard((event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (key === ' ' || key === 'ArrowUp' || key === 'w') return flapNow()
    if ((key === 'p' || key === 'Escape') && canPause) {
      togglePause()
      return true
    }
    if (key === 'Enter' && hud.status === 'over' && !isAi) {
      restart()
      return true
    }
    return false
  }, !customizing)

  const openCustomize = () => {
    // Choosing a look mid-flight pauses it; the game is the same either way.
    if (flight.current.status === 'playing' && !isAi) setPaused(true)
    setCustomizing(true)
  }

  let status: GameStatus
  if (hud.status === 'over') status = 'over'
  else if (hud.status === 'ready') status = 'ready'
  else if (paused) status = 'paused'
  else status = 'playing'

  return {
    canvasRef,
    status,
    score: hud.score,
    crash: hud.crash,
    level: levelFor(hud.score),
    best: run.best,
    newBest: run.newBest,
    mode,
    isAi,
    aiAvailable: ai !== undefined,
    changeMode,
    speed,
    setSpeed: session.setSpeed,
    paused,
    canPause,
    togglePause,
    restart,
    flap: flapNow,
    decision,
    aiStats,
    customizing,
    openCustomize,
    closeCustomize: () => setCustomizing(false),
  }
}
