import { PX, type Mask } from './shapes'

/** A mask placed in the world: its left edge and the y of its bottom edge (y grows downwards). */
export interface Placed {
  mask: Mask
  x: number
  bottom: number
}

/**
 * Whether two placed masks share a pixel. Each row of a mask is the strip from its first to its last
 * filled pixel, so the test follows the drawn outline row by row: corners a sprite leaves empty never
 * collide, and two sprites only touching edges do not either.
 *
 * `margin` grows the second shape by that many world units on every side. The game always uses 0;
 * the AI uses more to keep a safety distance.
 */
export function overlaps(a: Placed, b: Placed, margin = 0): boolean {
  const aTop = a.bottom - a.mask.height
  const bTop = b.bottom - b.mask.height
  // The whole boxes first: most of the time they are far apart.
  if (a.x >= b.x + b.mask.width + margin || b.x - margin >= a.x + a.mask.width) return false
  if (aTop >= b.bottom + margin || bTop - margin >= a.bottom) return false

  for (let i = 0; i < a.mask.spans.length; i++) {
    const aSpan = a.mask.spans[i]
    if (!aSpan) continue
    const ay0 = aTop + i * PX
    const ay1 = ay0 + PX
    const ax0 = a.x + aSpan[0] * PX
    const ax1 = a.x + (aSpan[1] + 1) * PX
    for (let j = 0; j < b.mask.spans.length; j++) {
      const bSpan = b.mask.spans[j]
      if (!bSpan) continue
      const by0 = bTop + j * PX - margin
      const by1 = bTop + (j + 1) * PX + margin
      if (by1 <= ay0 || by0 >= ay1) continue
      const bx0 = b.x + bSpan[0] * PX - margin
      const bx1 = b.x + (bSpan[1] + 1) * PX + margin
      if (bx1 > ax0 && bx0 < ax1) return true
    }
  }
  return false
}
