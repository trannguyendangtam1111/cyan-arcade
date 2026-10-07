import { describe, expect, it } from 'vitest'
import { BALL_RADIUS, GRID, PADDLE } from '../engine/arena'
import { createBrickBreakerGame } from '../engine/brickEngine'
import { HANDCRAFTED_LEVELS, levelDefinition } from '../engine/levels'
import { POWER_UPS } from '../engine/powerUps'
import { SKINS } from '../skins'
import type { Brick, BrickKind, PowerUpKind } from '../types/brickTypes'
import { drawBall, drawPaddle, powerUpIcon } from './drawActors'
import { drawBrick } from './drawBricks'
import { drawWorld } from './drawScene'
import { unsupported } from './pixel'
import { LEVEL_WORLDS, levelWorld, WORLDS, worldOf } from './worlds'

/**
 * A 2D context that records where every filled rectangle lands in world units, following the
 * translations and scales the drawing code makes. Enough to check what is drawn where.
 */
function recordingContext() {
  type Matrix = { a: number; d: number; e: number; f: number }
  let matrix: Matrix = { a: 1, d: 1, e: 0, f: 0 }
  const stack: Matrix[] = []
  const filled: { x0: number; y0: number; x1: number; y1: number }[] = []
  const pending: { x: number; y: number; w: number; h: number }[] = []
  const record = (x: number, y: number, w: number, h: number) => {
    const xs = [matrix.e + x * matrix.a, matrix.e + (x + w) * matrix.a]
    const ys = [matrix.f + y * matrix.d, matrix.f + (y + h) * matrix.d]
    filled.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) })
  }
  const ctx = {
    save: () => stack.push({ ...matrix }),
    restore: () => {
      matrix = stack.pop() ?? matrix
    },
    translate: (x: number, y: number) => {
      matrix = { ...matrix, e: matrix.e + x * matrix.a, f: matrix.f + y * matrix.d }
    },
    scale: (x: number, y: number) => {
      matrix = { ...matrix, a: matrix.a * x, d: matrix.d * y }
    },
    fillRect: record,
    beginPath: () => {
      pending.length = 0
    },
    rect: (x: number, y: number, w: number, h: number) => pending.push({ x, y, w, h }),
    fill: () => pending.forEach(({ x, y, w, h }) => record(x, y, w, h)),
    clip: () => undefined,
    drawImage: () => {
      throw new Error('no sprites in tests')
    },
    clearRect: () => undefined,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, filled }
}

const KINDS: BrickKind[] = ['normal', 'tough', 'armored', 'special']
const HP: Record<BrickKind, number> = { normal: 1, tough: 2, armored: 3, special: 1 }

describe('the level worlds', () => {
  it('give every handcrafted level a world of its own, named like the level', () => {
    const worlds = Array.from({ length: HANDCRAFTED_LEVELS }, (_, i) => levelWorld(i + 1))
    expect(new Set(worlds.map((world) => world.id)).size).toBe(HANDCRAFTED_LEVELS)
    expect(worlds.map((world) => world.name)).toEqual(Array.from({ length: HANDCRAFTED_LEVELS }, (_, i) => levelDefinition(i + 1, 1).name))
    expect(worlds.map((world) => world.name)).toEqual([
      'Cute Sakura',
      'Kawaii Candy',
      'Anime Café',
      'Magical Galaxy',
      'Kitsune Shrine',
      'Cyber Anime',
      'Fantasy Dragon',
      'Dark Moon',
    ])
  })

  it('give Endless the arcade, by level number alone: the same for every run', () => {
    for (let level = HANDCRAFTED_LEVELS + 1; level < HANDCRAFTED_LEVELS + 30; level++) {
      expect(levelWorld(level).scene).toBe('arcade')
      expect(levelWorld(level)).toBe(levelWorld(level))
      // The bricks take each level world's colours in turn.
      expect(levelWorld(level).bricks.normal).toEqual(LEVEL_WORLDS[(level - HANDCRAFTED_LEVELS - 1) % LEVEL_WORLDS.length].bricks.normal)
    }
    // Nothing in a game's state picks a world but its level: two runs, two seeds, the same picture.
    expect(levelWorld(createBrickBreakerGame(1, 12).level)).toBe(levelWorld(createBrickBreakerGame(999, 12).level))
  })

  it('follow the level with the free theme, and keep a bought theme on every level', () => {
    const [levels, ...bought] = SKINS.bricks
    for (let level = 1; level <= 12; level++) {
      expect(worldOf(levels.look, level)).toBe(levelWorld(level))
      for (const theme of bought) expect(worldOf(theme.look, level)).toBe(worldOf(theme.look, 1))
    }
    expect(bought.map((theme) => worldOf(theme.look, 3).id)).toEqual(['candy', 'cyber', 'sakura', 'galaxy', 'dragon'])
  })

  it.each(Object.values(WORLDS).map((world) => [world.name, world]))('%s paints its scenery and sparkle', (_, world) => {
    const { ctx, filled } = recordingContext()
    for (const time of [0, 1.7, 33]) drawWorld(ctx, world, time)
    expect(filled.length).toBeGreaterThan(200)
  })
})

describe('pictures drawn on the engine\'s shapes', () => {
  it.each(Object.values(WORLDS).flatMap((world) => KINDS.map((kind) => [`${world.name} ${kind}`, world, kind] as const)))(
    'a %s brick fills exactly its rectangle, at every hit point',
    (_, world, kind) => {
      for (let hp = HP[kind]; hp >= 1; hp--) {
        const brick: Brick = { id: 13, row: 2, col: 3, x: GRID.left + 3 * GRID.cellWidth, y: GRID.top + 2 * GRID.cellHeight, width: GRID.brickWidth, height: GRID.brickHeight, kind, hp, maxHp: HP[kind] }
        const { ctx, filled } = recordingContext()
        drawBrick(ctx, brick, world, 0, 0.5)
        expect(filled.length).toBeGreaterThan(5)
        for (const box of filled) {
          expect(box.x0).toBeGreaterThanOrEqual(brick.x - 1e-9)
          expect(box.y0).toBeGreaterThanOrEqual(brick.y - 1e-9)
          expect(box.x1).toBeLessThanOrEqual(brick.x + brick.width + 1e-9)
          expect(box.y1).toBeLessThanOrEqual(brick.y + brick.height + 1e-9)
        }
        // Its corners are cut round, but it reaches every edge.
        expect(Math.min(...filled.map((box) => box.x0))).toBeCloseTo(brick.x)
        expect(Math.max(...filled.map((box) => box.y1))).toBeCloseTo(brick.y + brick.height)
      }
    },
  )

  it('draws tough, armored and special bricks differently from plain ones, and damage too', () => {
    const picture = (kind: BrickKind, hp: number) => {
      const { ctx, filled } = recordingContext()
      drawBrick(ctx, { id: 1, row: 0, col: 0, x: 0, y: 0, width: GRID.brickWidth, height: GRID.brickHeight, kind, hp, maxHp: HP[kind] }, WORLDS.sakura, 0, 0)
      return JSON.stringify(filled)
    }
    const pictures = [picture('normal', 1), picture('tough', 2), picture('tough', 1), picture('armored', 3), picture('armored', 2), picture('armored', 1), picture('special', 1)]
    expect(new Set(pictures).size).toBe(pictures.length)
  })

  it.each(SKINS.paddle.map((skin) => [skin.name, skin]))('the %s fills exactly the paddle the ball bounces off', (_, skin) => {
    for (const width of [PADDLE.width, PADDLE.wideWidth]) {
      const x = 173
      const { ctx, filled } = recordingContext()
      drawPaddle(ctx, skin.look, x, width, { laser: false, magnet: false, squash: 0, muzzle: 0, time: 1 })
      for (const box of filled) {
        expect(box.x0).toBeGreaterThanOrEqual(x - width / 2 - 1e-9)
        expect(box.x1).toBeLessThanOrEqual(x + width / 2 + 1e-9)
        expect(box.y0).toBeGreaterThanOrEqual(PADDLE.y - 1e-9)
        expect(box.y1).toBeLessThanOrEqual(PADDLE.y + PADDLE.height + 1e-9)
      }
      expect(Math.min(...filled.map((box) => box.x0))).toBeCloseTo(x - width / 2)
      expect(Math.max(...filled.map((box) => box.x1))).toBeCloseTo(x + width / 2)
    }
  })

  it.each(SKINS.ball.map((skin) => [skin.name, skin]))('the %s is drawn inside the circle the engine bounces', (_, skin) => {
    for (const time of [0, 0.13, 0.26, 0.4]) {
      const ball = { x: 211, y: 333 }
      const { ctx, filled } = recordingContext()
      drawBall(ctx, skin.look, ball, [], false, time)
      expect(filled.length).toBeGreaterThan(60)
      for (const box of filled) {
        const cx = (box.x0 + box.x1) / 2
        const cy = (box.y0 + box.y1) / 2
        expect(Math.hypot(cx - ball.x, cy - ball.y)).toBeLessThanOrEqual(BALL_RADIUS)
      }
    }
  })
})

describe('power-up pictures', () => {
  it('are different for every power-up, and fit their capsule', () => {
    const kinds = Object.keys(POWER_UPS) as PowerUpKind[]
    const icons = kinds.map((kind) => powerUpIcon(kind).join('/'))
    expect(new Set(icons).size).toBe(kinds.length)
    for (const kind of kinds) {
      const icon = powerUpIcon(kind)
      expect(icon.length).toBeLessThanOrEqual(5)
      expect(Math.max(...icon.map((row) => row.length))).toBeLessThanOrEqual(11)
    }
  })
})

describe('pixel text', () => {
  it('has a letter for everything the game writes', () => {
    const texts = [
      ...Array.from({ length: 20 }, (_, i) => levelDefinition(i + 1, 7).name),
      ...Object.values(POWER_UPS).map((definition) => `${definition.label} 9.9`),
      'COMBO 25 X2.5',
      'LEVEL 12',
      '−1 ♥',
      '2 lives left',
      'Unstoppable!',
      'On fire!',
      'Nice!',
      '+1,250',
      '?!',
      '✨ PERFECT CLEAR ✨',
      (1234567).toLocaleString('en-US'),
    ]
    for (const text of texts) expect(unsupported(text), text).toEqual([])
  })
})
