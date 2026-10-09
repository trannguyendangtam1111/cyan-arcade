import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useFrameLoop } from '@/games/shared/useFrameLoop'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { useKeyboard } from '@/games/shared/useKeyboard'
import { usePlaySession } from '@/games/shared/usePlaySession'
import type { GameProps, GameStatus } from '@/games/types'
import type { DinoAiKit, DinoDecision, DinoStrategy } from '../ai/dinoAi'
import { levelFor } from '../engine/difficulty'
import { advance, createDinoRun, pressJump, runDetails, setDuck, start } from '../engine/dinoEngine'
import { WORLD } from '../engine/physics'
import { drawScene } from '../render/drawScene'
import type { Outfit } from '../skins'
import type { DinoState, ObstacleKind, RunStatus } from '../types/dinoTypes'

/** How long the AI waits before starting, and after a crash before running again. */
const AI_START_MS = 600
const AI_RETRY_MS = 1400
/** After a crash, a jump this soon does not start a new run: it was meant for the old one. */
const RESTART_GRACE_MS = 450
/** How often the AI panel shows the AI's latest decision; it decides 120 times a second. */
const DECISION_REFRESH_MS = 150

/** How the AI has done since AI mode was switched on. */
export interface AiStats {
  runs: number
  best: number
  total: number
  last: number | null
  /** Jumps and ducks in the current run. */
  jumps: number
  ducks: number
}

const NO_AI_STATS: AiStats = { runs: 0, best: 0, total: 0, last: null, jumps: 0, ducks: 0 }

/** What the screen re-renders for. Everything else changes every frame and lives in a ref. */
interface Hud {
  status: RunStatus
  score: number
  crash: ObstacleKind | null
  level: number
  cleared: number
}

const hudOf = (state: DinoState): Hud => ({ status: state.status, score: state.score, crash: state.crash, level: levelFor(state.score).level, cleared: state.cleared })

const newRun = () => createDinoRun(createSeed())

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Everything about a game of Dino Run that is not layout: the run (in a ref, advanced by an
 * animation-frame loop and drawn straight onto the canvas, so React re-renders only when the score
 * or the status changes), human and AI control, pausing, and reporting human runs to the platform.
 */
export function useDinoGame(props: GameProps<DinoAiKit>, outfit: Outfit) {
  const session = usePlaySession()
  const { mode, speed, paused, setPaused } = session
  const run = useHumanRun('dino-run', props)
  // Present only for players allowed to use AI mode (admins); see GameProps.ai.
  const createKit = props.ai
  const kit = useMemo(() => createKit?.(), [createKit])
  const [strategy, setStrategy] = useState<DinoStrategy>('balanced')
  const ai = useMemo(() => kit?.forStrategy(strategy), [kit, strategy])
  const isAi = mode === 'ai' && ai !== undefined

  const [initial] = useState(newRun)
  const game = useRef(initial)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const outfitRef = useRef(outfit)
  const [hud, setHud] = useState<Hud>(() => hudOf(initial))
  const [customizing, setCustomizing] = useState(false)
  const [decision, setDecision] = useState<DinoDecision | null>(null)
  const [aiStats, setAiStats] = useState<AiStats>(NO_AI_STATS)
  const latestDecision = useRef<DinoDecision | null>(null)
  const clocks = useRef({ waiting: 0, sinceDecision: 0, crashedAt: 0 })
  const bestRef = useRef(run.best)

  useEffect(() => {
    bestRef.current = run.best
  }, [run.best])

  const sync = useCallback((state: DinoState) => {
    const next = hudOf(state)
    setHud((shown) =>
      shown.status === next.status && shown.score === next.score && shown.crash === next.crash && shown.level === next.level && shown.cleared === next.cleared ? shown : next,
    )
  }, [])

  const draw = useCallback((nowMs: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // One scale across and down: the picture is the world, unstretched.
    const scale = canvas.width / WORLD.width
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawScene(ctx, game.current, outfitRef.current, { time: nowMs / 1000, best: bestRef.current, reducedMotion: prefersReducedMotion() })
  }, [])

  useEffect(() => {
    outfitRef.current = outfit
    draw(performance.now())
  }, [outfit, draw])

  // The canvas has as many pixels as the screen shows (up to 2 per CSS pixel), at the world's shape.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      canvas.width = width
      canvas.height = Math.round((width * WORLD.height) / WORLD.width)
      draw(performance.now())
    }
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    fit()
    return () => observer.disconnect()
  }, [draw])

  const restart = useCallback(() => {
    game.current = newRun()
    clocks.current = { waiting: 0, sinceDecision: 0, crashedAt: 0 }
    run.reset()
    setPaused(false)
    setDecision(null)
    latestDecision.current = null
    sync(game.current)
    draw(performance.now())
  }, [run, setPaused, sync, draw])

  const onFrame = (elapsedMs: number, nowMs: number) => {
    const before = game.current
    let state = before
    if (isAi && ai) {
      if (state.status === 'ready') {
        clocks.current.waiting += elapsedMs
        if (clocks.current.waiting >= AI_START_MS) state = start(state)
      } else if (state.status === 'running' && !paused) {
        // Playback speed only changes how much game time passes per frame. The AI still decides
        // before every step of it, exactly as at 1x.
        state = advance(state, elapsedMs * speed, (current) => {
          const next = ai.decide(current)
          if (next.threat !== null || next.reason === 'drop') latestDecision.current = next
          return next.input
        })
        clocks.current.sinceDecision += elapsedMs
        if (clocks.current.sinceDecision >= DECISION_REFRESH_MS) {
          clocks.current.sinceDecision = 0
          setDecision(latestDecision.current)
          setAiStats((stats) => (stats.jumps === state.jumps && stats.ducks === state.ducks ? stats : { ...stats, jumps: state.jumps, ducks: state.ducks }))
        }
      } else if (state.status === 'over') {
        clocks.current.waiting += elapsedMs
        if (clocks.current.waiting >= AI_RETRY_MS) {
          state = newRun()
          clocks.current.waiting = 0
        }
      }
      if (before.status === 'running' && state.status === 'over') {
        const score = state.score
        clocks.current.waiting = 0
        setAiStats((stats) => ({ ...stats, runs: stats.runs + 1, best: Math.max(stats.best, score), total: stats.total + score, last: score }))
      }
    } else if (state.status === 'running' && !paused && !customizing) {
      state = advance(state, elapsedMs)
      if (state.status === 'over') {
        clocks.current.crashedAt = nowMs
        run.finish(state.score, runDetails(state))
      }
    }
    game.current = state
    sync(state)
    draw(nowMs)
  }

  useFrameLoop(onFrame, true)

  /** A human jump. The first one starts the run. Returns whether the input was used. */
  const jump = (): boolean => {
    if (isAi) return false
    if (paused || customizing) return true
    const state = game.current
    if (state.status === 'over') {
      if (performance.now() - clocks.current.crashedAt >= RESTART_GRACE_MS) restart()
      return true
    }
    if (state.status === 'ready') run.begin()
    game.current = pressJump(state)
    sync(game.current)
    return true
  }

  /** A human holding or letting go of duck. Holding it also starts a run that is waiting. */
  const duck = (held: boolean): boolean => {
    if (isAi || paused || customizing) return !isAi
    let state = game.current
    if (state.status === 'over') return true
    if (state.status === 'ready' && held) {
      run.begin()
      state = start(state)
    }
    game.current = setDuck(state, held)
    sync(game.current)
    return true
  }

  const canPause = hud.status === 'running'

  const togglePause = useCallback(() => {
    if (game.current.status === 'running') session.togglePause()
  }, [session])

  const changeMode = (next: PlayMode) => {
    if (next === mode) return
    session.setMode(next)
    setAiStats(NO_AI_STATS)
    restart()
  }

  const chooseStrategy = (next: DinoStrategy) => {
    setStrategy(next)
    setAiStats(NO_AI_STATS)
    restart()
  }

  // A run in progress pauses itself when the tab is hidden: nobody loses to a notification.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && game.current.status === 'running') setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [setPaused])

  useKeyboard((event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (key === ' ' || key === 'ArrowUp' || key === 'w') return event.repeat ? !isAi : jump()
    if (key === 'ArrowDown' || key === 's') return event.repeat ? !isAi : duck(true)
    if ((key === 'p' || key === 'Escape') && canPause) {
      togglePause()
      return true
    }
    if ((key === 'Enter' || key === 'r') && hud.status === 'over' && !isAi) {
      restart()
      return true
    }
    return false
  }, !customizing)

  // Letting go of the duck key stands Pip up again.
  const duckRef = useRef(duck)
  useEffect(() => {
    duckRef.current = duck
  })
  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') duckRef.current(false)
    }
    window.addEventListener('keyup', onKeyUp)
    return () => window.removeEventListener('keyup', onKeyUp)
  }, [])

  const openCustomize = () => {
    // Choosing a look mid-run pauses it; the run is the same either way.
    if (game.current.status === 'running' && !isAi) setPaused(true)
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
    level: hud.level,
    cleared: hud.cleared,
    best: run.best,
    newBest: run.newBest,
    mode,
    isAi,
    aiAvailable: kit !== undefined,
    changeMode,
    strategy,
    chooseStrategy,
    speed,
    setSpeed: session.setSpeed,
    paused,
    canPause,
    togglePause,
    restart,
    jump,
    duck,
    decision,
    aiStats,
    customizing,
    openCustomize,
    closeCustomize: () => setCustomizing(false),
  }
}
