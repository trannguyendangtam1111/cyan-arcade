/**
 * Dino Run's world and physics, in world units (the playfield is {@link WORLD} wide and tall) and
 * seconds. Every skin runs with exactly these numbers: skins change pictures only.
 *
 * The world is simulated in fixed steps of {@link STEP_MS} whatever the frame rate, so the same
 * inputs at the same steps give the same run on a 30 Hz phone and a 144 Hz monitor.
 */

export const WORLD = {
  width: 600,
  height: 300,
  /** Top of the ground, where Pip's feet are when running. */
  groundY: 250,
} as const

/** One simulation step: 120 a second. */
export const STEP_MS = 1000 / 120
export const STEP_S = STEP_MS / 1000

/** The most game time one call may simulate: a stalled tab cannot make the run jump ahead. */
export const MAX_ADVANCE_MS = 1000

export const PHYSICS = {
  /** Downward acceleration, units per second². */
  gravity: 2600,
  /** A jump sets the upward speed to this. */
  jumpVelocity: 840,
  /** Holding duck in the air multiplies gravity by this: a fast drop. */
  fastFall: 3.2,
  /** A jump pressed this many steps before landing still happens, on landing. */
  jumpBufferSteps: 10,
} as const

/** Pip's left edge never moves; the world scrolls past. */
export const RUNNER_X = 80

/** How long a jump keeps Pip in the air, in seconds, without a fast drop. */
export const AIRTIME_S = (2 * PHYSICS.jumpVelocity) / PHYSICS.gravity

/** The highest Pip's feet get, in world units. */
export const JUMP_HEIGHT = (PHYSICS.jumpVelocity * PHYSICS.jumpVelocity) / (2 * PHYSICS.gravity)
