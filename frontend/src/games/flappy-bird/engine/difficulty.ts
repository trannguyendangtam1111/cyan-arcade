/**
 * How Flappy Bird gets harder: a fixed table, indexed by how many pipes the bird has passed.
 *
 * Everything about pipe number `n` (0 for the first) comes from the level for `n`: the gap it has,
 * how far it stands from the pipe before it, and how fast the world moves while the bird flies
 * towards it. Nothing depends on time, frame rate or the device, so a course is the same for every
 * player, and when each pipe is passed is fixed by the table alone (see {@link passTimeMs}). The
 * server's rules for the game (`gamerules/FlappyBirdRunRules.java`) use the same table to check a
 * submitted run: change one, change both.
 *
 * The first pipes are slow and wide open; the gap shrinks and the world speeds up a little at each
 * level. Even the last level leaves a gap five times the bird's size.
 */

export interface DifficultyLevel {
  level: number
  /** The first pipe (by number) this level applies to. */
  fromPipe: number
  /** How fast the world scrolls, in units per second. */
  speed: number
  gapHeight: number
  /** Distance from the previous pipe's left edge to this one's. */
  spacing: number
  /** How far a gap's centre may move from the previous gap's, up or down. */
  maxGapShift: number
}

export const DIFFICULTY: readonly DifficultyLevel[] = [
  { level: 1, fromPipe: 0, speed: 150, gapHeight: 172, spacing: 250, maxGapShift: 120 },
  { level: 2, fromPipe: 5, speed: 158, gapHeight: 164, spacing: 245, maxGapShift: 150 },
  { level: 3, fromPipe: 15, speed: 168, gapHeight: 156, spacing: 240, maxGapShift: 175 },
  { level: 4, fromPipe: 30, speed: 180, gapHeight: 148, spacing: 234, maxGapShift: 195 },
  { level: 5, fromPipe: 50, speed: 192, gapHeight: 141, spacing: 228, maxGapShift: 210 },
  { level: 6, fromPipe: 75, speed: 204, gapHeight: 135, spacing: 222, maxGapShift: 220 },
  { level: 7, fromPipe: 100, speed: 216, gapHeight: 130, spacing: 216, maxGapShift: 230 },
]

/** The level for pipe number `pipe`, which is also the level while `pipe` pipes have been passed. */
export function difficultyFor(pipe: number): DifficultyLevel {
  let current = DIFFICULTY[0]
  for (const level of DIFFICULTY) if (pipe >= level.fromPipe) current = level
  return current
}

export const levelFor = (pipesPassed: number): number => difficultyFor(pipesPassed).level

/** Where the course's pieces stand when a flight begins. Shared with the engine and the server rules. */
export const COURSE = {
  /** The bird's centre never leaves this x. */
  birdX: 120,
  /** Left edge of the first pipe when the flight begins. */
  firstPipeX: 460,
  pipeWidth: 70,
} as const

/**
 * Game time from the first flap until pipe number `pipe` is behind the bird, for any flight still
 * going by then. The world moves at its own pace whatever the bird does, so this is fixed: a flight
 * that scored `n` points lasted at least `passTimeMs(n - 1)` and less than `passTimeMs(n)`.
 */
export function passTimeMs(pipe: number): number {
  let seconds = (COURSE.firstPipeX + COURSE.pipeWidth - COURSE.birdX) / difficultyFor(0).speed
  for (let next = 1; next <= pipe; next++) {
    const level = difficultyFor(next)
    seconds += level.spacing / level.speed
  }
  return seconds * 1000
}
