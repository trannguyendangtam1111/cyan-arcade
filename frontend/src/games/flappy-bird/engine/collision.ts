/**
 * Flappy Bird's collision geometry: the bird is a circle, a pipe pair is two rectangles, and the
 * playfield has a ceiling and the ground. Nothing here knows how anything looks: a skin changes the
 * picture, never these shapes.
 */
import type { PipePair } from '../types/flappyTypes'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Whether a circle overlaps a rectangle (touching counts). */
export function circleHitsRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
  // The rectangle's point nearest the centre: inside the circle means they overlap.
  const nearestX = Math.max(rect.left, Math.min(cx, rect.right))
  const nearestY = Math.max(rect.top, Math.min(cy, rect.bottom))
  const dx = cx - nearestX
  const dy = cy - nearestY
  return dx * dx + dy * dy <= radius * radius
}

/**
 * The two solid parts of a pipe pair, shifted `offsetX` along the course. The upper one reaches far
 * above the screen, so there is no way over the top.
 */
export function pipeRects(pipe: PipePair, offsetX = 0): [upper: Rect, lower: Rect] {
  const left = pipe.x + offsetX
  const right = left + pipe.width
  const gapTop = pipe.gapY - pipe.gapHeight / 2
  const gapBottom = pipe.gapY + pipe.gapHeight / 2
  return [
    { left, right, top: -10_000, bottom: gapTop },
    { left, right, top: gapBottom, bottom: 10_000 },
  ]
}

/**
 * Whether a bird at (`x`, `y`) touches a pipe pair. `margin` makes the bird that much bigger,
 * which the AI uses to keep clear; the game itself uses none.
 */
export function hitsPipe(x: number, y: number, radius: number, pipe: PipePair, offsetX = 0, margin = 0): boolean {
  // Most pipes are nowhere near: skip the arithmetic.
  if (x + radius + margin < pipe.x + offsetX || x - radius - margin > pipe.x + offsetX + pipe.width) return false
  const [upper, lower] = pipeRects(pipe, offsetX)
  return circleHitsRect(x, y, radius + margin, upper) || circleHitsRect(x, y, radius + margin, lower)
}
