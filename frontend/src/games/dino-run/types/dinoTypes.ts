/** Dino Run's state, as the engine keeps it. Plain data: the engine's functions make every change. */

export type RunStatus = 'ready' | 'running' | 'over'

/**
 * - `mound`: low, on the ground (alone or in a group of up to three): jump it.
 * - `pillar`: tall, on the ground: jump it, in good time.
 * - `bat`: flying low enough to have to jump it, or at head height, to duck under (or jump over).
 */
export type ObstacleKind = 'mound' | 'pillar' | 'bat'

export interface Runner {
  /** Height of Pip's feet above the ground, in world units (0 on the ground). */
  lift: number
  /** Vertical speed, upwards positive, in units per second. */
  vy: number
  ducking: boolean
}

export interface Obstacle {
  id: number
  kind: ObstacleKind
  /** Left edge, in world units. Everything scrolls left as the world moves. */
  x: number
  /** Height of the obstacle's bottom above the ground: 0 for anything standing on it. */
  lift: number
  /** Mounds in a group (1 to 3); 1 for anything else. */
  count: number
  /** Steps since it was made: a bat's wings beat by it. */
  age: number
  /** Whether Pip is past it (it has been cleared and counted). */
  passed: boolean
}

export interface DinoState {
  status: RunStatus
  /** The seed the run started with, reported with its result. */
  initialSeed: number
  /** The generator's seed now. Only the obstacle generator draws from it. */
  seed: number
  runner: Runner
  /** Whether duck is held: on the ground Pip ducks, in the air Pip drops fast. */
  duckHeld: boolean
  /** Steps a jump pressed in the air waits to happen on landing. */
  jumpBuffer: number
  obstacles: Obstacle[]
  nextObstacleId: number
  /** World units run. The score is a tenth of it. */
  distance: number
  steps: number
  /** Game time run, in ms: a whole number of steps. It stops while paused. */
  elapsedMs: number
  /** Time handed over but not yet simulated (less than a step). */
  pendingMs: number
  score: number
  jumps: number
  ducks: number
  /** Obstacles cleared. */
  cleared: number
  crash: ObstacleKind | null
}

/** What a player (or the AI) does during one step. */
export interface DinoInput {
  jump: boolean
  duck: boolean
}
