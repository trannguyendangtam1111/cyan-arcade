import { describe, expect, it } from 'vitest'
import { advance, createDinoRun, pressJump } from '../engine/dinoEngine'
import { BAT_DOWN, BAT_UP, DUCK_A, DUCK_B, JUMP, moundGroup, PILLAR, PX, RUN_A, RUN_B, type Mask } from '../engine/shapes'
import { JOURNEY } from '@/games/shared/pixel/scenery'
import { DEFAULT_OUTFIT, findSkin, JOURNEY_LEG, OBSTACLES, RUNNERS, SKIN_SLOTS, SKINS, TERRAIN, sceneryAt, obstacleColours } from '../skins'
import { drawScene, drawSkinPreview } from './drawScene'

/** A 2D context that records the boxes it fills, following translations and scales. Enough to see what lands where. */
function recordingContext() {
  type Matrix = { a: number; d: number; e: number; f: number }
  let matrix: Matrix = { a: 1, d: 1, e: 0, f: 0 }
  const stack: Matrix[] = []
  const fills: { x: number; y: number; w: number; h: number; colour: string }[] = []
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
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
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x: matrix.e + x * matrix.a, y: matrix.f + y * matrix.d, w: w * matrix.a, h: h * matrix.d, colour: String(this.fillStyle) })
    },
    beginPath: () => undefined,
    rect: () => undefined,
    fill: () => undefined,
    clip: () => undefined,
    drawImage: () => undefined,
    setTransform: () => undefined,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

const MASKS: Mask[] = [RUN_A, RUN_B, JUMP, DUCK_A, DUCK_B, moundGroup(1), moundGroup(3), PILLAR, BAT_UP, BAT_DOWN]

describe('Dino Run pictures', () => {
  it('draw every collision shape pixel for pixel: what is seen is what collides', () => {
    // A shape is drawn by painting its own rows; every filled pixel gets a colour in every skin.
    const letters = (masks: Mask[]) => new Set(masks.flatMap((mask) => [...mask.rows.join('')].filter((ch) => ch !== '.')))
    for (const runner of RUNNERS) {
      for (const letter of letters([RUN_A, RUN_B, JUMP, DUCK_A, DUCK_B])) expect(runner.palette[letter], `${runner.id} ${letter}`).toBeTruthy()
    }
    for (const look of OBSTACLES) {
      for (const world of Object.keys(TERRAIN) as (keyof typeof TERRAIN)[]) {
        const colours = obstacleColours(look, world)
        for (const letter of letters([moundGroup(1)])) expect(colours.mound[letter]).toBeTruthy()
        for (const letter of letters([PILLAR])) expect(colours.pillar[letter]).toBeTruthy()
        for (const letter of letters([BAT_UP, BAT_DOWN])) expect(colours.bat[letter]).toBeTruthy()
      }
    }
    // With no canvas to cache into, the paint lands on the screen: Pip's pixels exactly where the engine has them.
    const { ctx, fills } = recordingContext()
    const state = createDinoRun(7)
    drawScene(ctx, state, DEFAULT_OUTFIT, { time: 0, best: 0, reducedMotion: true })
    const top = 250 - RUN_A.height
    const pip = fills.filter((fill) => fill.colour === DEFAULT_OUTFIT.runner.palette.b)
    for (const fill of pip.filter((f) => f.x >= 80 && f.x < 80 + RUN_A.width && f.y >= top)) {
      const row = Math.floor((fill.y - top) / PX)
      const col = Math.floor((fill.x - 80) / PX)
      expect(RUN_A.rows[row][col]).toBe('b')
    }
    expect(pip.length).toBeGreaterThan(20)
  })

  it('never change the run they draw, and use their own randomness', () => {
    let state = pressJump(createDinoRun(99))
    state = advance(state, 3000)
    const before = structuredClone(state)
    for (const time of [0, 1.5, 3, 77]) {
      drawScene(recordingContext().ctx, state, DEFAULT_OUTFIT, { time, best: 500, reducedMotion: false })
    }
    expect(state).toEqual(before)
    // The same run drawn at different moments: only the drifting extras differ, never the course.
    expect(advance(state, 1000)).toEqual(advance(before, 1000))
  })

  it('go through every world on the journey, a new one every leg, in the same order for every run', () => {
    expect(Array.from({ length: 9 }, (_, leg) => sceneryAt(leg * JOURNEY_LEG + 10))).toEqual([...JOURNEY, JOURNEY[0]])
    expect(sceneryAt(0)).toBe(JOURNEY[0])
    expect(sceneryAt(JOURNEY_LEG - 1)).toBe(JOURNEY[0])
    expect(sceneryAt(JOURNEY_LEG)).toBe(JOURNEY[1])
  })

  it('show the world of the score, whatever skins are worn: there is no world to pick', () => {
    expect(SKIN_SLOTS).toEqual(['runner', 'obstacles'])
    const dressed = { runner: findSkin('runner', 'midnight')!, obstacles: findSkin('obstacles', 'candy')! }
    // The backdrop and ground, away from Pip, with nothing on the course.
    const backdrop = (score: number, outfit: typeof DEFAULT_OUTFIT) => {
      const { ctx, fills } = recordingContext()
      drawScene(ctx, { ...createDinoRun(7), score, obstacles: [] }, outfit, { time: 0, best: 0, reducedMotion: true })
      return fills.filter((fill) => fill.x >= 200 && fill.y >= 40)
    }
    for (let leg = 0; leg < JOURNEY.length; leg++) {
      const score = leg * JOURNEY_LEG + 100
      expect(backdrop(score, dressed)).toEqual(backdrop(score, DEFAULT_OUTFIT))
    }
    // ...and the world does change along the run.
    expect(backdrop(100, DEFAULT_OUTFIT)).not.toEqual(backdrop(JOURNEY_LEG * 7 + 100, DEFAULT_OUTFIT))
  })

  it('draw a preview of every skin, and fall back for unknown ones', () => {
    for (const slot of SKIN_SLOTS) {
      for (const skin of SKINS[slot]) {
        const { ctx } = recordingContext()
        expect(() => drawSkinPreview(ctx, slot, skin, 72, 64)).not.toThrow()
      }
    }
    expect(findSkin('runner', 'no-such-skin')).toBeUndefined()
    expect(DEFAULT_OUTFIT.runner.free && DEFAULT_OUTFIT.obstacles.free).toBe(true)
    // Exactly one free look per slot; everything else comes from the shop.
    for (const slot of SKIN_SLOTS) expect(SKINS[slot].filter((skin) => skin.free)).toHaveLength(1)
  })

  it('give every shape whole-pixel rows of one width', () => {
    for (const mask of MASKS) {
      expect(mask.rows.every((row) => row.length === mask.columns)).toBe(true)
      expect(mask.width).toBe(mask.columns * PX)
    }
  })
})
