import { describe, expect, it } from 'vitest'
import { JOURNEY, SCENE_COLUMNS, SCENE_ROWS, SCENERY, type SceneryId } from '@/games/shared/pixel/scenery'
import { BAT_LIFT, obstacleMask } from '../engine/dinoEngine'
import { WORLD } from '../engine/physics'
import { PX } from '../engine/shapes'
import type { ObstacleKind } from '../types/dinoTypes'
import { contrast, GRAPHIC_CONTRAST, parseColour } from './contrast'
import { OBSTACLES, obstacleColours, type Palette } from '.'

/**
 * Obstacles against the worlds they run through. Each world's scenery is painted pixel for pixel, as
 * the game paints it, and every obstacle is checked against every scenery pixel that can be behind it:
 * the backdrop scrolls, so any column of the world can pass behind any obstacle, but only the rows at
 * the obstacle's own height. An obstacle is told apart from a pixel when its outline or its body has
 * at least 3:1 contrast with it, WCAG's bar for graphics that must be seen.
 */

/** The scenery's art row at the game's ground line (see `render/drawScene.ts`). */
const SCENERY_GROUND_ROW = 288
const FIRST_SKY_ROW = SCENERY_GROUND_ROW - WORLD.groundY / PX

/** The world's scenery as colours, one per art pixel, blending see-through paint as a canvas would. */
function paintScenery(world: SceneryId): string[] {
  const pixels: [number, number, number][] = Array.from({ length: SCENE_COLUMNS * SCENE_ROWS }, () => [0, 0, 0])
  const ctx = {
    fillStyle: '#000000',
    globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) {
      const colour = parseColour(String(this.fillStyle))
      if (!colour) return
      const alpha = colour[3] * this.globalAlpha
      for (let row = Math.max(0, Math.floor(y)); row < Math.min(SCENE_ROWS, Math.ceil(y + h)); row++) {
        for (let col = Math.max(0, Math.floor(x)); col < Math.min(SCENE_COLUMNS, Math.ceil(x + w)); col++) {
          const under = pixels[row * SCENE_COLUMNS + col]
          pixels[row * SCENE_COLUMNS + col] = [0, 1, 2].map((i) => under[i] * (1 - alpha) + colour[i] * alpha) as [number, number, number]
        }
      }
    },
  }
  SCENERY[world].paint(ctx as unknown as CanvasRenderingContext2D)
  return pixels.map((rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`)
}

/** Every obstacle the course makes, with the art rows its picture covers. */
const PLACES: { name: string; kind: ObstacleKind; rows: [number, number] }[] = (
  [
    ['mound', 'mound', 0],
    ['pillar', 'pillar', 0],
    ['low bat', 'bat', BAT_LIFT.low],
    ['high bat', 'bat', BAT_LIFT.high],
  ] as const
).map(([name, kind, lift]) => {
  const mask = obstacleMask({ id: 0, kind, x: 0, lift, count: 1, age: 0, passed: false })
  const bottom = WORLD.groundY - lift
  return { name, kind, rows: [FIRST_SKY_ROW + (bottom - mask.height) / PX, FIRST_SKY_ROW + bottom / PX] }
})

/** The lowest separation between a palette and any scenery pixel in those rows. */
function weakest(scenery: string[], palette: Palette, [from, to]: [number, number]): number {
  let worst = Infinity
  for (let row = from; row < to; row++) {
    for (let col = 0; col < SCENE_COLUMNS; col++) {
      const behind = scenery[row * SCENE_COLUMNS + col]
      worst = Math.min(worst, Math.max(contrast(palette.o, behind), contrast(palette.a, behind)))
    }
  }
  return worst
}

const SCENERIES = new Map(JOURNEY.map((world) => [world, paintScenery(world)]))

describe('Dino Run obstacles', () => {
  it('stand out from every world on the journey, in every obstacle look', () => {
    const weak: string[] = []
    for (const world of JOURNEY) {
      for (const look of OBSTACLES) {
        const colours = obstacleColours(look, world)
        for (const place of PLACES) {
          const worst = weakest(SCENERIES.get(world)!, colours[place.kind], place.rows)
          if (worst < GRAPHIC_CONTRAST) weak.push(`${place.name} (${look.name}) in ${world}: ${worst.toFixed(2)}`)
        }
      }
    }
    expect(weak).toEqual([])
  })

  it('include a bat that shows up against the Dark Moon night', () => {
    const moon = SCENERIES.get('moon')!
    const bat = obstacleColours(OBSTACLES[0], 'moon').bat
    for (const place of PLACES.filter((p) => p.kind === 'bat')) {
      // Both its dark outline and its light wings: the bat is a light shape in a dark ring, not a dark one on dark.
      expect(weakest(moon, bat, place.rows)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST)
      expect(weakest(moon, { o: bat.a, a: bat.a }, place.rows)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST)
    }
    // The measure is not idle: a bat in the night's own purple would vanish, and it says so.
    expect(weakest(moon, { o: '#2a1650', a: '#3b1f6e' }, PLACES[3].rows)).toBeLessThan(GRAPHIC_CONTRAST)
  })

  it('are measured over exactly the rows they are drawn in', () => {
    // Pictures sit on the ground line; the high bat clears a ducking runner but not a standing one.
    expect(PLACES.find((p) => p.name === 'mound')!.rows[1]).toBe(SCENERY_GROUND_ROW)
    expect(PLACES.find((p) => p.name === 'high bat')!.rows[1]).toBe(SCENERY_GROUND_ROW - BAT_LIFT.high / PX)
    for (const place of PLACES) expect(place.rows[0]).toBeGreaterThanOrEqual(FIRST_SKY_ROW)
  })
})
