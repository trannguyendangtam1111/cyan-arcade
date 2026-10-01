/**
 * Seeded pseudo-random numbers for game engines.
 *
 * Engines keep the current `seed` in their state and thread it through every random decision,
 * which makes `update(state, action)` a pure function: the same state and action always produce
 * the same next state. That is what lets humans, AIs, tests and replays share one engine.
 */
export interface RandomResult<T = number> {
  value: T
  /** Pass this to the next call. */
  seed: number
}

/** One step of the mulberry32 generator. `value` is uniform in [0, 1). */
export function nextRandom(seed: number): RandomResult {
  const next = (seed + 0x6d2b79f5) | 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next }
}

/** Uniform integer in [0, maxExclusive). */
export function randomInt(seed: number, maxExclusive: number): RandomResult {
  const result = nextRandom(seed)
  return { value: Math.floor(result.value * maxExclusive), seed: result.seed }
}

/** A fresh, non-deterministic seed for starting a new game. */
export function createSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
