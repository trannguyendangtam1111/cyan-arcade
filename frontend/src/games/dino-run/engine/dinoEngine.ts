import { nextRandom } from '@/games/shared/random'
import type { DinoInput, DinoState, Obstacle, ObstacleKind } from '../types/dinoTypes'
import { overlaps, type Placed } from './collision'
import { levelFor, minGap, speedAt, SPEED, type Pattern } from './difficulty'
import { MAX_ADVANCE_MS, PHYSICS, RUNNER_X, STEP_MS, STEP_S, WORLD } from './physics'
import { BAT_DOWN, BAT_UP, DUCK_A, DUCK_B, JUMP, moundGroup, PILLAR, RUN_A, RUN_B, type Mask } from './shapes'

/**
 * Dino Run's rules as pure functions: state in, new state out, with no React, timers or randomness
 * of their own. Only the obstacle generator draws random numbers, from the seed in the state; the
 * screen's sparkle and dust use their own clock and never touch it. Time moves only when the caller
 * says how much has passed, in fixed steps (see `physics.ts`).
 */

/** Where the first obstacle stands when a run begins: well off screen, a moment away. */
export const FIRST_OBSTACLE_X = WORLD.width + 60
/** Obstacles are made this far past the right edge, before they come into view. */
const SPAWN_AHEAD = 240
/** An obstacle is forgotten once it is this far off the left edge. */
const OFF_SCREEN = 40
/** Bats fly at one of two heights: low enough to jump, or at head height, to duck under. */
export const BAT_LIFT = { low: 4, high: 28 } as const
/** A bat's wings beat every this many steps. */
const WING_STEPS = 18
/** Pip's legs alternate every this many units run. */
const STRIDE = 30
/** Floating-point slack when counting steps, in ms. */
const TIME_SLACK = 1e-6
/** Speed used to space the next obstacle: the speed a little way ahead, so gaps are never too short. */
const SPACING_LOOKAHEAD = 1600

/** A new run, waiting to start. Seeds are 31-bit, so a run's seed fits the numbers its result reports. */
export function createDinoRun(seed: number): DinoState {
  const start = (seed >>> 0) & 0x7fffffff
  const state: DinoState = {
    status: 'ready',
    initialSeed: start,
    seed: start,
    runner: { lift: 0, vy: 0, ducking: false },
    duckHeld: false,
    jumpBuffer: 0,
    obstacles: [],
    nextObstacleId: 0,
    distance: 0,
    steps: 0,
    elapsedMs: 0,
    pendingMs: 0,
    score: 0,
    jumps: 0,
    ducks: 0,
    cleared: 0,
    crash: null,
  }
  spawn(state)
  return state
}

export const onGround = (state: Readonly<DinoState>): boolean => state.runner.lift <= 0 && state.runner.vy <= 0

/**
 * Jump. The first jump also starts the run. In the air the press is remembered for a few steps and
 * happens on landing, so a press a moment early is not lost. After a crash nothing happens.
 */
export function pressJump(state: DinoState): DinoState {
  if (state.status === 'over') return state
  const next = copy(state)
  next.status = 'running'
  if (onGround(next)) jump(next)
  else next.jumpBuffer = PHYSICS.jumpBufferSteps
  return next
}

/** Starts the run without jumping (the duck key, or the start button). */
export function start(state: DinoState): DinoState {
  if (state.status !== 'ready') return state
  return { ...state, status: 'running' }
}

/** Holds or lets go of duck: on the ground Pip ducks, in the air Pip drops fast. */
export function setDuck(state: DinoState, held: boolean): DinoState {
  if (state.status === 'over' || state.duckHeld === held) return state
  const next = copy(state)
  next.duckHeld = held
  updateDucking(next)
  return next
}

/**
 * Lets `ms` of game time pass. `decide`, when given, is asked before every step what to do in it:
 * that is how the AI plays, through the same steps as a player. A player's presses come in between
 * calls instead, through {@link pressJump} and {@link setDuck}.
 */
export function advance(state: DinoState, ms: number, decide?: (state: Readonly<DinoState>) => DinoInput): DinoState {
  if (state.status !== 'running' || !(ms > 0)) return state
  const next = copy(state)
  next.pendingMs += Math.min(ms, MAX_ADVANCE_MS)
  // A hair of slack: frame times summed in floating point must not lose a step at a boundary.
  while (next.pendingMs >= STEP_MS - TIME_SLACK && next.status === 'running') {
    next.pendingMs = Math.max(0, next.pendingMs - STEP_MS)
    if (decide) apply(next, decide(next))
    step(next)
  }
  if (next.status !== 'running') next.pendingMs = 0
  return next
}

/** An input's effect at the start of a step: the AI's way of pressing. */
function apply(state: DinoState, input: DinoInput): void {
  if (input.jump) {
    if (onGround(state)) jump(state)
    else if (state.jumpBuffer === 0) state.jumpBuffer = PHYSICS.jumpBufferSteps
  }
  if (input.duck !== state.duckHeld) {
    state.duckHeld = input.duck
    updateDucking(state)
  }
}

function jump(state: DinoState): void {
  state.runner = { lift: state.runner.lift, vy: PHYSICS.jumpVelocity, ducking: false }
  state.jumpBuffer = 0
  state.jumps++
}

function updateDucking(state: DinoState): void {
  const ducking = state.duckHeld && onGround(state)
  if (ducking && !state.runner.ducking) state.ducks++
  state.runner = { ...state.runner, ducking }
}

/** One fixed step on a state this module owns (a copy). */
function step(state: DinoState): void {
  moveRunner(state)
  const speed = speedAt(state.distance)
  scroll(state, speed * STEP_S)
  state.steps++
  state.elapsedMs = state.steps * STEP_MS
  state.score = Math.floor(state.distance / 10)

  const hit = state.obstacles.find((obstacle) => overlaps(runnerPlaced(state), obstaclePlaced(obstacle)))
  if (hit) {
    state.status = 'over'
    state.crash = hit.kind
    return
  }
  for (const obstacle of state.obstacles) {
    if (!obstacle.passed && obstacle.x + obstacleMask(obstacle).width < RUNNER_X) {
      obstacle.passed = true
      state.cleared++
    }
  }
  while (state.obstacles.length > 0 && state.obstacles[0].x + obstacleMask(state.obstacles[0]).width < -OFF_SCREEN) state.obstacles.shift()
  spawn(state)
}

function moveRunner(state: DinoState): void {
  if (state.jumpBuffer > 0) {
    if (onGround(state)) jump(state)
    else state.jumpBuffer--
  }
  const runner = state.runner
  if (!onGround(state)) {
    const gravity = PHYSICS.gravity * (state.duckHeld ? PHYSICS.fastFall : 1)
    const vy = runner.vy - gravity * STEP_S
    const lift = runner.lift + vy * STEP_S
    state.runner = lift <= 0 ? { lift: 0, vy: 0, ducking: false } : { lift, vy, ducking: false }
  }
  updateDucking(state)
}

function scroll(state: DinoState, dx: number): void {
  state.distance += dx
  for (const obstacle of state.obstacles) {
    obstacle.x -= dx
    obstacle.age++
  }
}

// --- Shapes in the world -----------------------------------------------------------------------------

/** Pip's shape now: ducking, in the air, or running (legs by the distance run). */
export function runnerMask(state: Readonly<DinoState>): Mask {
  const stride = Math.floor(state.distance / STRIDE) % 2 === 0
  if (state.runner.ducking) return stride ? DUCK_A : DUCK_B
  if (!onGround(state)) return JUMP
  if (state.status !== 'running') return RUN_A
  return stride ? RUN_A : RUN_B
}

export function obstacleMask(obstacle: Readonly<Obstacle>): Mask {
  switch (obstacle.kind) {
    case 'mound':
      return moundGroup(obstacle.count)
    case 'pillar':
      return PILLAR
    case 'bat':
      return Math.floor(obstacle.age / WING_STEPS) % 2 === 0 ? BAT_UP : BAT_DOWN
  }
}

export function runnerPlaced(state: Readonly<DinoState>): Placed {
  return { mask: runnerMask(state), x: RUNNER_X, bottom: WORLD.groundY - state.runner.lift }
}

export function obstaclePlaced(obstacle: Readonly<Obstacle>): Placed {
  return { mask: obstacleMask(obstacle), x: obstacle.x, bottom: WORLD.groundY - obstacle.lift }
}

// --- The generator -------------------------------------------------------------------------------

/**
 * Makes the obstacles that should exist by now, each from the seed, so a seed always gives the same
 * course. Each one keeps at least {@link minGap} (at the speed it will be met at) after the one before,
 * stretched by the level's spread, so no sequence is ever impossible.
 */
function spawn(state: DinoState): void {
  for (;;) {
    const previous = state.obstacles.at(-1)
    let x = FIRST_OBSTACLE_X
    if (previous) {
      const back = previous.x + obstacleMask(previous).width
      if (back > WORLD.width + SPAWN_AHEAD) return
      const reachedAt = state.distance + (back - RUNNER_X)
      const level = levelFor(Math.floor(reachedAt / 10))
      const spread = draw(state)
      const gap = minGap(speedAt(reachedAt + SPACING_LOOKAHEAD)) * (level.spread[0] + spread * (level.spread[1] - level.spread[0]))
      x = back + gap
    }
    const level = levelFor(Math.floor((state.distance + (x - RUNNER_X)) / 10))
    const pattern = pick(level.patterns, draw(state))
    state.obstacles.push(make(state.nextObstacleId++, pattern, x))
    if (!previous) return
  }
}

function make(id: number, pattern: Pattern, x: number): Obstacle {
  const of = (kind: ObstacleKind, lift: number, count: number): Obstacle => ({ id, kind, x, lift, count, age: 0, passed: false })
  switch (pattern) {
    case 'mound':
      return of('mound', 0, 1)
    case 'mounds-2':
      return of('mound', 0, 2)
    case 'mounds-3':
      return of('mound', 0, 3)
    case 'pillar':
      return of('pillar', 0, 1)
    case 'bat-low':
      return of('bat', BAT_LIFT.low, 1)
    case 'bat-high':
      return of('bat', BAT_LIFT.high, 1)
  }
}

function draw(state: DinoState): number {
  const random = nextRandom(state.seed)
  state.seed = random.seed
  return random.value
}

function pick(patterns: readonly [Pattern, number][], roll: number): Pattern {
  const total = patterns.reduce((sum, [, weight]) => sum + weight, 0)
  let left = roll * total
  for (const [pattern, weight] of patterns) {
    left -= weight
    if (left < 0) return pattern
  }
  return patterns[patterns.length - 1][0]
}

// --- Prediction (the AI) -------------------------------------------------------------------------

/**
 * A step of a prediction: the same physics, scrolling and collision as {@link advance}, on a copy,
 * but no new obstacles are made (a prediction only knows the obstacles already there) and nothing is
 * scored. `margin` grows every obstacle by that many units, for a safety distance.
 * @returns whether Pip would hit something in this step
 */
export function predictStep(sim: DinoState, input: DinoInput, margin: number): boolean {
  apply(sim, input)
  moveRunner(sim)
  scroll(sim, speedAt(sim.distance) * STEP_S)
  sim.steps++
  return sim.obstacles.some((obstacle) => overlaps(runnerPlaced(sim), obstaclePlaced(obstacle), margin))
}

/** A copy of the state for predictions, with only the given obstacles in it. */
export function forPrediction(state: Readonly<DinoState>, obstacles: readonly Obstacle[]): DinoState {
  return { ...copy(state), obstacles: obstacles.map((obstacle) => ({ ...obstacle })) }
}

/**
 * The course a seed makes, up to a distance, without anyone running it: each obstacle where the
 * runner would meet it (`at`, the distance run when its front reaches Pip's left edge). The very same
 * generator as a run, for checking courses for fairness over long distances.
 */
export function courseOf(seed: number, untilDistance: number): { at: number; obstacle: Obstacle; width: number }[] {
  const state = createDinoRun(seed)
  const seen = new Map<number, { at: number; obstacle: Obstacle; width: number }>()
  while (state.distance < untilDistance) {
    for (const obstacle of state.obstacles) {
      if (!seen.has(obstacle.id)) seen.set(obstacle.id, { at: state.distance + obstacle.x - RUNNER_X, obstacle: { ...obstacle }, width: obstacleMask(obstacle).width })
    }
    scroll(state, speedAt(state.distance) * STEP_S)
    while (state.obstacles.length > 0 && state.obstacles[0].x + obstacleMask(state.obstacles[0]).width < -OFF_SCREEN) state.obstacles.shift()
    spawn(state)
  }
  return [...seen.values()].filter((entry) => entry.at <= untilDistance)
}

// --- Results -------------------------------------------------------------------------------------

export const worldSpeed = (state: Readonly<DinoState>): number => speedAt(state.distance)

/** Whether the run is at top speed. */
export const atTopSpeed = (state: Readonly<DinoState>): boolean => speedAt(state.distance) >= SPEED.max

/**
 * What a finished run reports to the platform: a few whole numbers, never the frames. The server
 * checks them against each other, against the speed curve's fixed timing and against its own clock.
 */
export function runDetails(state: Readonly<DinoState>): Record<string, number> {
  const runMs = Math.round(state.elapsedMs)
  return {
    meters: state.score,
    runMs,
    seconds: Math.floor(runMs / 1000),
    level: levelFor(state.score).level,
    obstacles: state.cleared,
    jumps: state.jumps,
    ducks: state.ducks,
    seed: state.initialSeed,
  }
}

function copy(state: Readonly<DinoState>): DinoState {
  return { ...state, runner: { ...state.runner }, obstacles: state.obstacles.map((obstacle) => ({ ...obstacle })) }
}
