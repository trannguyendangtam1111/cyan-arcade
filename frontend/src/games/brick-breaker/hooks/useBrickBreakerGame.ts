import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { PlayMode } from '@/games/shared/ai'
import { createSeed } from '@/games/shared/random'
import { useFrameLoop } from '@/games/shared/useFrameLoop'
import { useHumanRun } from '@/games/shared/useHumanRun'
import { usePlaySession } from '@/games/shared/usePlaySession'
import type { GameProps, GameStatus } from '@/games/types'
import type { BrickAI, BrickDecision } from '../ai/brickAi'
import { ARENA } from '../engine/arena'
import { advance, createBrickBreakerGame, runDetails, updateBrickBreaker } from '../engine/brickEngine'
import { Juice } from '../effects/juice'
import { drawScene } from '../render/drawScene'
import type { Outfit } from '../skins'
import type { BrickAction, BrickState, GamePhase, LevelBonus, RunStats } from '../types/brickTypes'

/** After the AI's run ends, it starts a new one after this long. */
const AI_RETRY_MS = 1800
/** After a game over, a launch this soon does not start a new game: it was meant for the old one. */
const RESTART_GRACE_MS = 600
/** How often the AI panel shows the AI's latest decision. */
const DECISION_REFRESH_MS = 200

/** How the AI has done since AI mode was switched on. */
export interface AiStats {
  runs: number
  bestScore: number
  bestLevel: number
  lastScore: number | null
}

const NO_AI_STATS: AiStats = { runs: 0, bestScore: 0, bestLevel: 0, lastScore: null }

/** The few things the page re-renders for; everything else changes every frame and lives in a ref. */
interface Hud {
  phase: GamePhase
  started: boolean
  score: number
  level: number
  levelName: string
  lives: number
  bonus: LevelBonus | null
  /** The run's totals, once it is over. */
  summary: RunStats | null
}

const hudOf = (state: BrickState): Hud => ({
  phase: state.phase,
  started: state.started,
  score: state.score,
  level: state.level,
  levelName: state.levelName,
  lives: state.lives,
  bonus: state.phase === 'cleared' ? state.lastBonus : null,
  summary: state.phase === 'over' ? state.stats : null,
})

const sameHud = (a: Hud, b: Hud) =>
  a.phase === b.phase && a.started === b.started && a.score === b.score && a.level === b.level && a.lives === b.lives && a.bonus === b.bonus && a.summary === b.summary

const MOVE_KEYS: Record<string, -1 | 1> = { ArrowLeft: -1, a: -1, ArrowRight: 1, d: 1 }
const LAUNCH_KEYS = new Set([' ', 'ArrowUp', 'w'])

const newGame = () => createBrickBreakerGame(createSeed())

/**
 * Everything about a game of Brick Breaker that is not layout: the game (in a ref, advanced by an
 * animation-frame loop and drawn straight onto the canvas with its effects, so React re-renders
 * only when the score, the lives or the phase change), pointer, touch and keyboard control, the AI,
 * pausing, and reporting human runs to the platform.
 */
export function useBrickBreakerGame(props: GameProps<BrickAI>, outfit: Outfit) {
  const session = usePlaySession()
  const { mode, speed, paused, setPaused } = session
  const run = useHumanRun('brick-breaker', props)
  const createAi = props.ai
  const ai = useMemo(() => createAi?.(), [createAi])
  const isAi = mode === 'ai' && ai !== undefined

  const [initial] = useState(newGame)
  const game = useRef(initial)
  const juice = useRef(new Juice())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const outfitRef = useRef(outfit)
  const [hud, setHud] = useState<Hud>(() => hudOf(initial))
  const [customizing, setCustomizing] = useState(false)
  const [decision, setDecision] = useState<BrickDecision | null>(null)
  const [aiStats, setAiStats] = useState<AiStats>(NO_AI_STATS)
  const clocks = useRef({ overFor: 0, sinceDecision: 0, overAt: 0 })
  const heldKeys = useRef<string[]>([])

  const sync = useCallback((state: BrickState) => {
    const next = hudOf(state)
    setHud((shown) => (sameHud(shown, next) ? shown : next))
  }, [])

  const draw = useCallback((nowMs: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // One scale across and down: the picture is the world, unstretched.
    const scale = canvas.width / ARENA.width
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawScene(ctx, game.current, outfitRef.current, juice.current, nowMs / 1000)
  }, [])

  useEffect(() => {
    outfitRef.current = outfit
    draw(performance.now())
  }, [outfit, draw])

  // As many canvas pixels as the screen shows (up to 2 per CSS pixel), at the arena's shape.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      canvas.height = Math.round((canvas.width * ARENA.height) / ARENA.width)
      draw(performance.now())
    }
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    fit()
    return () => observer.disconnect()
  }, [draw])

  const apply = useCallback(
    (action: BrickAction) => {
      game.current = updateBrickBreaker(game.current, action)
      sync(game.current)
    },
    [sync],
  )

  const restart = useCallback(() => {
    game.current = newGame()
    juice.current.reset()
    clocks.current = { overFor: 0, sinceDecision: 0, overAt: 0 }
    run.reset()
    setPaused(false)
    setDecision(null)
    sync(game.current)
    draw(performance.now())
  }, [run, setPaused, sync, draw])

  const onFrame = (elapsedMs: number, nowMs: number) => {
    const before = game.current
    let state = before
    if (isAi && ai) {
      if (state.phase === 'over') {
        clocks.current.overFor += elapsedMs
        if (clocks.current.overFor >= AI_RETRY_MS) {
          state = newGame()
          juice.current.reset()
          clocks.current.overFor = 0
        }
      } else {
        // Speed only changes how much game time passes per frame; the AI still decides before every step.
        state = advance(state, elapsedMs * speed, (current) => ai.getNextAction(current))
        clocks.current.sinceDecision += elapsedMs
        if (clocks.current.sinceDecision >= DECISION_REFRESH_MS) {
          clocks.current.sinceDecision = 0
          setDecision(ai.decide(state))
        }
      }
      if (before.phase !== 'over' && state.phase === 'over') {
        const final = state
        setAiStats((stats) => ({
          runs: stats.runs + 1,
          bestScore: Math.max(stats.bestScore, final.score),
          bestLevel: Math.max(stats.bestLevel, final.level),
          lastScore: final.score,
        }))
      }
    } else {
      state = advance(state, elapsedMs)
      if (before.phase !== 'over' && state.phase === 'over') {
        clocks.current.overAt = nowMs
        run.finish(state.score, runDetails(state))
      }
    }
    game.current = state
    juice.current.absorb(state.events, outfitRef.current, state)
    juice.current.update(elapsedMs, state)
    sync(state)
    draw(nowMs)
  }

  // Frames run while anything moves: always, except paused, customizing, or after a human's game over.
  const looping = !paused && !customizing && (hud.phase !== 'over' || isAi)
  useFrameLoop(onFrame, looping)

  /** Launches the ball (the first launch begins the run), or starts a new game after a game over. */
  const launch = useCallback((): boolean => {
    if (isAi) return false
    if (paused || customizing) return true
    const state = game.current
    if (state.phase === 'over') {
      if (performance.now() - clocks.current.overAt >= RESTART_GRACE_MS) restart()
      return true
    }
    if (state.phase === 'serving') {
      if (!state.started) run.begin()
      apply({ type: 'launch' })
    }
    return true
  }, [isAi, paused, customizing, restart, run, apply])

  /** The arena x under a pointer. */
  const worldX = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return ((event.clientX - rect.left) / rect.width) * ARENA.width
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (isAi || paused || customizing) return
    apply({ type: 'aim', x: worldX(event) })
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (isAi) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // No text selection, no scrolling: the pointer is the paddle now.
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    if (!paused && !customizing) apply({ type: 'aim', x: worldX(event) })
    launch()
    // Keep following a finger that drags off the arena. Only a nicety: a pointer that is already gone
    // (released before this ran) cannot be captured, and that must never stop the game.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Nothing to capture.
    }
  }

  const canPause = hud.phase === 'playing' || hud.phase === 'serving' || hud.phase === 'cleared'

  const togglePause = useCallback(() => {
    if (game.current.phase !== 'over') session.togglePause()
  }, [session])

  const changeMode = (next: PlayMode) => {
    if (next === mode) return
    session.setMode(next)
    setAiStats(NO_AI_STATS)
    restart()
  }

  // Held keys move the paddle; the last one pressed wins while two are down.
  useEffect(() => {
    if (customizing) return
    const ignored = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return true
      const target = event.target
      if (!(target instanceof HTMLElement)) return false
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return true
      return (event.key === ' ' || event.key === 'Enter') && target.closest('button, a') !== null
    }
    const keyOf = (event: KeyboardEvent) => (event.key.length === 1 ? event.key.toLowerCase() : event.key)
    const steerFromHeld = () => {
      const last = heldKeys.current.at(-1)
      apply({ type: 'steer', direction: last ? MOVE_KEYS[last] : 0 })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (ignored(event)) return
      const key = keyOf(event)
      let used = false
      if (key in MOVE_KEYS) {
        used = !isAi
        if (used && !heldKeys.current.includes(key)) {
          heldKeys.current.push(key)
          if (!paused) steerFromHeld()
        }
      } else if (LAUNCH_KEYS.has(key)) {
        used = launch()
      } else if ((key === 'p' || key === 'Escape') && game.current.phase !== 'over') {
        togglePause()
        used = true
      } else if (key === 'Enter' && game.current.phase === 'over' && !isAi) {
        restart()
        used = true
      }
      if (used) {
        event.preventDefault()
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const key = keyOf(event)
      if (!(key in MOVE_KEYS)) return
      heldKeys.current = heldKeys.current.filter((held) => held !== key)
      steerFromHeld()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [customizing, isAi, paused, launch, togglePause, restart, apply])

  // A game in progress pauses itself when the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && game.current.started && game.current.phase !== 'over') setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [setPaused])

  const openCustomize = () => {
    if (!isAi && game.current.started && game.current.phase !== 'over') setPaused(true)
    setCustomizing(true)
  }

  let status: GameStatus
  if (hud.phase === 'over') status = 'over'
  else if (!hud.started && !isAi) status = 'ready'
  else if (paused) status = 'paused'
  else status = 'playing'

  return {
    canvasRef,
    status,
    phase: hud.phase,
    score: hud.score,
    level: hud.level,
    levelName: hud.levelName,
    lives: hud.lives,
    bonus: hud.bonus,
    summary: hud.summary,
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
    launch,
    onPointerMove,
    onPointerDown,
    decision,
    aiStats,
    customizing,
    openCustomize,
    closeCustomize: () => setCustomizing(false),
  }
}
