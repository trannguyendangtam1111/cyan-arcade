/**
 * Flappy Bird's state, as plain data. The engine (`engine/flappyEngine.ts`) is the only thing that
 * changes it; everything else (the screen, the AI, the tests) only reads it.
 *
 * Positions are in world units on a 400 × 600 playfield, x to the right and y downwards; the screen
 * scales the playfield to fit. Times are in milliseconds of game time, which stops while paused.
 */

export type FlightStatus = 'ready' | 'playing' | 'over'

/** What ended the flight. */
export type CrashCause = 'pipe' | 'ground' | 'ceiling'

export interface Bird {
  /** Height of the bird's centre; its x never changes (see `BIRD_X`). */
  y: number
  /** Vertical speed in units per second; negative is upwards. */
  vy: number
}

/** One obstacle: a pipe from the top and one from the ground, with a gap between them. */
export interface PipePair {
  /** The pipe's place in the course: 0 for the first. */
  id: number
  /** Left edge on screen. Pipes move left as the bird flies. */
  x: number
  /** Centre of the gap. */
  gapY: number
  gapHeight: number
  width: number
  /** Whether the bird has flown past it (and scored for it). */
  passed: boolean
}

export interface FlappyState {
  status: FlightStatus
  /** The seed the course was made from: the same seed always makes the same course. */
  initialSeed: number
  /** The random generator's current state; the next pipe's gap comes from it. */
  seed: number
  bird: Bird
  /** The pipes on (or just beyond) the screen, left to right. */
  pipes: PipePair[]
  /** The id the next pipe will get, which is also how many pipes have been made. */
  nextPipeId: number
  /** One point per pipe flown past. */
  score: number
  flaps: number
  /** Fixed simulation steps taken since the first flap. */
  steps: number
  /** Game time since the first flap. */
  elapsedMs: number
  /** Game time not simulated yet: less than one step, carried to the next frame. */
  pendingMs: number
  /** How far the world has scrolled, for the ground and the scenery. */
  distance: number
  /** The highest the bird has been (smallest y), for the run's record. */
  highestY: number
  crash: CrashCause | null
}

export type FlappyAction =
  | { type: 'flap' }
  /** Time passed: `ms` of game time (already multiplied by any playback speed). */
  | { type: 'tick'; ms: number }
