import { nextRandom } from '@/games/shared/random'
import type { Bird, CrashCause, FlappyAction, FlappyState, PipePair } from '../types/flappyTypes'
import { hitsPipe } from './collision'
import { COURSE, difficultyFor, levelFor } from './difficulty'

/**
 * Flappy Bird's rules as pure functions: `state in, new state out`, with no React, timers or
 * randomness of their own. The course comes from the seed in the state, and time only moves when
 * the caller says how much has passed.
 *
 * The world is simulated in fixed steps of {@link STEP_MS}, whatever the frame rate: a frame of 33 ms
 * (30 FPS) runs four steps, a frame of 7 ms (144 Hz) runs one step most of the time and keeps the
 * rest for the next frame. So the same flaps at the same moments give the same flight on every
 * screen, and the AI and the tests can run a flight step by step.
 */

export const WORLD = {
  width: 400,
  height: 600,
  /** Top of the ground. */
  groundY: 536,
} as const

/**
 * The bird's physics. Every skin flies with exactly these: skins change the picture only, and the
 * engine never sees which one is worn.
 */
export const PHYSICS = {
  /** Downward acceleration, units per second². */
  gravity: 1500,
  /** A flap sets the vertical speed to this (upwards), whatever it was. */
  flapVelocity: -470,
  /** Falling never gets faster than this. */
  maxFallSpeed: 720,
  /** The bird's collision circle. Its picture is drawn a little larger, which feels fair. */
  birdRadius: 13,
} as const

export const BIRD_X = COURSE.birdX
export const BIRD_START_Y = 280

/** One simulation step: 120 a second. */
export const STEP_MS = 1000 / 120
/** The most game time one call may simulate, so a stalled tab cannot make the game jump ahead. */
export const MAX_ADVANCE_MS = 1000

/** New pipes are made this far past the right edge of the screen, before they come into view. */
const SPAWN_AHEAD = 100
/** No gap comes closer than this to the ceiling or the ground. */
const GAP_MARGIN = 60
/** The first gap is near the middle: at most this far from it. */
const FIRST_GAP_SPREAD = 50
/** A pipe is forgotten once it is this far off the left edge. */
const OFF_SCREEN = 20

/**
 * A new flight, waiting for the first flap. Seeds are 31-bit, so a run's seed fits the whole
 * numbers its result reports.
 */
export function createFlappyGame(seed: number): FlappyState {
  const start = (seed >>> 0) & 0x7fffffff
  const state: FlappyState = {
    status: 'ready',
    initialSeed: start,
    seed: start,
    bird: { y: BIRD_START_Y, vy: 0 },
    pipes: [],
    nextPipeId: 0,
    score: 0,
    flaps: 0,
    steps: 0,
    elapsedMs: 0,
    pendingMs: 0,
    distance: 0,
    highestY: BIRD_START_Y,
    crash: null,
  }
  spawnPipes(state)
  return state
}

/** The bird flaps. The first flap also starts the flight; after a crash nothing happens. */
export function flap(state: FlappyState): FlappyState {
  if (state.status === 'over') return state
  return {
    ...state,
    status: 'playing',
    bird: { ...state.bird, vy: PHYSICS.flapVelocity },
    flaps: state.flaps + 1,
  }
}

/**
 * Lets `ms` of game time pass. `decide`, when given, is asked before every step whether to flap in
 * it: that is how the AI plays, with the same steps as a human. A human's flaps come in between
 * calls instead, through {@link flap}.
 */
export function advance(state: FlappyState, ms: number, decide?: (state: Readonly<FlappyState>) => boolean): FlappyState {
  if (state.status !== 'playing' || !(ms > 0)) return state
  const next = copy(state)
  next.pendingMs += Math.min(ms, MAX_ADVANCE_MS)
  while (next.pendingMs >= STEP_MS && next.status === 'playing') {
    next.pendingMs -= STEP_MS
    step(next, decide ? decide(next) : false)
  }
  if (next.status !== 'playing') next.pendingMs = 0
  return next
}

/** Every change to a flight, as one function: used by the game screen and the tests alike. */
export function updateFlappy(state: FlappyState, action: FlappyAction): FlappyState {
  switch (action.type) {
    case 'flap':
      return flap(state)
    case 'tick':
      return advance(state, action.ms)
  }
}

export const isGameOver = (state: FlappyState): boolean => state.status === 'over'
export const scoreOf = (state: FlappyState): number => state.score

/** Where the bird will be one step from now, flapping first or not. The AI predicts with this. */
export function stepBird(bird: Bird, flapNow: boolean): Bird {
  const dt = STEP_MS / 1000
  const vy = Math.min((flapNow ? PHYSICS.flapVelocity : bird.vy) + PHYSICS.gravity * dt, PHYSICS.maxFallSpeed)
  return { y: bird.y + vy * dt, vy }
}

/** What a bird at height `y` hits, if anything, with the pipes moved `offsetX` along. */
export function crashAt(y: number, pipes: readonly PipePair[], offsetX = 0, margin = 0): CrashCause | null {
  const radius = PHYSICS.birdRadius
  if (pipes.some((pipe) => hitsPipe(BIRD_X, y, radius, pipe, offsetX, margin))) return 'pipe'
  if (y + radius + margin >= WORLD.groundY) return 'ground'
  if (y - radius - margin <= 0) return 'ceiling'
  return null
}

/** The pipes still ahead of the bird or around it, nearest first. */
export function pipesAhead(state: Readonly<FlappyState>): PipePair[] {
  return state.pipes.filter((pipe) => pipe.x + pipe.width > BIRD_X - PHYSICS.birdRadius)
}

/** How fast the world scrolls right now. */
export const worldSpeed = (state: Readonly<FlappyState>): number => difficultyFor(state.score).speed

/**
 * What a finished flight reports to the platform: a few whole numbers, never the frames. The
 * server checks them against each other, against the course's fixed timing and against the time
 * it measured itself.
 */
export function runDetails(state: FlappyState): Record<string, number> {
  const flightMs = Math.round(state.elapsedMs)
  return {
    pipes: state.score,
    flaps: state.flaps,
    flightMs,
    seconds: Math.floor(flightMs / 1000),
    level: levelFor(state.score),
    seed: state.initialSeed,
  }
}

/**
 * A flight as an object, for code that prefers calling methods to threading states:
 * `const engine = createFlappyEngine(seed); engine.flap(); engine.update(16)`.
 */
export function createFlappyEngine(seed: number) {
  let state = createFlappyGame(seed)
  return {
    startGame: () => {
      if (state.status === 'ready') state = flap(state)
    },
    flap: () => {
      state = flap(state)
    },
    update: (deltaMs: number) => {
      state = advance(state, deltaMs)
    },
    getState: (): FlappyState => state,
    isGameOver: () => isGameOver(state),
    getScore: () => scoreOf(state),
  }
}

/** One fixed step, on a state this module owns (a copy made by {@link advance}). */
function step(state: FlappyState, flapNow: boolean): void {
  if (flapNow) state.flaps++
  state.bird = stepBird(state.bird, flapNow)

  const dx = (worldSpeed(state) * STEP_MS) / 1000
  state.distance += dx
  for (const pipe of state.pipes) pipe.x -= dx
  state.steps++
  state.elapsedMs = state.steps * STEP_MS
  state.highestY = Math.min(state.highestY, state.bird.y)

  const crash = crashAt(state.bird.y, state.pipes)
  if (crash) {
    state.status = 'over'
    state.crash = crash
    if (crash === 'ground') state.bird = { ...state.bird, y: WORLD.groundY - PHYSICS.birdRadius }
    return
  }

  // A point for each pipe that is now entirely behind the bird's centre, and only once.
  for (const pipe of state.pipes) {
    if (!pipe.passed && pipe.x + pipe.width < BIRD_X) {
      pipe.passed = true
      state.score++
    }
  }
  while (state.pipes.length > 0 && state.pipes[0].x + state.pipes[0].width < -OFF_SCREEN) state.pipes.shift()
  spawnPipes(state)
}

/** Makes the pipes that should exist by now, each from the seed, so the course is the same every time. */
function spawnPipes(state: FlappyState): void {
  for (;;) {
    const previous = state.pipes.at(-1)
    const level = difficultyFor(state.nextPipeId)
    const x = previous ? previous.x + level.spacing : COURSE.firstPipeX
    if (previous && x > WORLD.width + SPAWN_AHEAD) return

    const lowest = GAP_MARGIN + level.gapHeight / 2
    const highest = WORLD.groundY - GAP_MARGIN - level.gapHeight / 2
    const middle = (lowest + highest) / 2
    const from = previous ? Math.max(lowest, previous.gapY - level.maxGapShift) : middle - FIRST_GAP_SPREAD
    const to = previous ? Math.min(highest, previous.gapY + level.maxGapShift) : middle + FIRST_GAP_SPREAD
    const random = nextRandom(state.seed)
    state.seed = random.seed
    state.pipes.push({
      id: state.nextPipeId,
      x,
      gapY: Math.round(from + random.value * (to - from)),
      gapHeight: level.gapHeight,
      width: COURSE.pipeWidth,
      passed: false,
    })
    state.nextPipeId++
    if (!previous) return
  }
}

function copy(state: FlappyState): FlappyState {
  return { ...state, bird: { ...state.bird }, pipes: state.pipes.map((pipe) => ({ ...pipe })) }
}
