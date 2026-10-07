/**
 * Brick Breaker's collision maths: a ball is a circle, a brick and the paddle are rectangles. Pure
 * functions of numbers, so every bounce is exact and repeatable.
 */

export interface Contact {
  /** The direction to push the ball out, a unit vector. */
  nx: number
  ny: number
  /** How far the ball is inside. */
  depth: number
}

/**
 * Where a circle overlaps a rectangle, or `null` when it does not. Merely touching is not
 * overlapping, so a ball pushed out to the surface is free of it. A ball whose centre is inside
 * (only after a very fast step) is pushed out through the nearest side.
 */
export function circleRectContact(cx: number, cy: number, r: number, left: number, top: number, width: number, height: number): Contact | null {
  const right = left + width
  const bottom = top + height
  const px = Math.max(left, Math.min(cx, right))
  const py = Math.max(top, Math.min(cy, bottom))
  const dx = cx - px
  const dy = cy - py
  const distanceSq = dx * dx + dy * dy
  if (distanceSq >= r * r) return null
  if (distanceSq > 0) {
    const distance = Math.sqrt(distanceSq)
    return { nx: dx / distance, ny: dy / distance, depth: r - distance }
  }
  const sides: [number, number, number][] = [
    [cx - left, -1, 0],
    [right - cx, 1, 0],
    [cy - top, 0, -1],
    [bottom - cy, 0, 1],
  ]
  const [distance, nx, ny] = sides.reduce((nearest, side) => (side[0] < nearest[0] ? side : nearest))
  return { nx, ny, depth: distance + r }
}

const DEGREES = Math.PI / 180

/** A ball never flies flatter than this from the vertical (no endless side-to-side)... */
export const MAX_ANGLE = 62 * DEGREES
/** ...nor straighter than this (no endless up-and-down). */
export const MIN_ANGLE = 15 * DEGREES

/**
 * A velocity of `speed` in the direction of (vx, vy), turned just enough to keep its angle from the
 * vertical within [MIN_ANGLE, MAX_ANGLE].
 */
export function constrainVelocity(vx: number, vy: number, speed: number): { vx: number; vy: number } {
  const angle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, Math.atan2(Math.abs(vx), Math.abs(vy))))
  return { vx: (vx < 0 ? -1 : 1) * speed * Math.sin(angle), vy: (vy > 0 ? 1 : -1) * speed * Math.cos(angle) }
}

/** The steepest a magnet can lean a bounce, towards the way the paddle is moving. */
export const MAGNET_LEAN = 18 * DEGREES

/**
 * How the ball leaves the paddle: straight-ish up from the middle, at up to {@link MAX_ANGLE} from
 * the ends, by where it hit. `lean` (the magnet) turns it further, within the same limits.
 *
 * @param offset where the ball hit, −1 (left end) to 1 (right end)
 * @param fallback which way to go from a dead-centre hit: the way the ball was already going
 */
export function paddleBounce(offset: number, speed: number, fallback: number, lean = 0): { vx: number; vy: number } {
  const clamped = Math.max(-1, Math.min(1, offset))
  let angle = clamped * MAX_ANGLE + lean
  if (angle === 0) angle = (fallback < 0 ? -1 : 1) * MIN_ANGLE
  const magnitude = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, Math.abs(angle)))
  return { vx: Math.sign(angle) * speed * Math.sin(magnitude), vy: -speed * Math.cos(magnitude) }
}

/** (vx, vy) turned by `angle` radians, then kept within the angle limits. */
export function rotateVelocity(vx: number, vy: number, angle: number, speed: number): { vx: number; vy: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return constrainVelocity(vx * cos - vy * sin, vx * sin + vy * cos, speed)
}
