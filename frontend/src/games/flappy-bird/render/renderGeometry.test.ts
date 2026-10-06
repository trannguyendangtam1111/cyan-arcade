import { describe, expect, it } from 'vitest'
import { pipeRects } from '../engine/collision'
import { BIRD_X, createFlappyGame, crashAt, flap, PHYSICS, WORLD } from '../engine/flappyEngine'
import { DEFAULT_OUTFIT, findSkin, SKINS, type Outfit } from '../skins'
import type { BirdLook } from '../skins/skinTypes'
import type { FlappyState, PipePair } from '../types/flappyTypes'
import { canvasFrame } from './canvasFrame'
import { drawBird, drawBirdBack } from './drawBird'
import { drawPipePair } from './drawPipes'
import { drawScene } from './drawScene'

/**
 * What the renderer really paints, in the world's units, against the engine's collision geometry:
 * the bird is seen to touch a pipe exactly when the engine says it does.
 */

type Point = [number, number]
/** One fill or stroke: the points of its shape, how far paint spreads around them (half a stroke), and its clip. */
interface Mark {
  points: Point[]
  pad: number
  clip: Point[] | null
}

/**
 * A 2D context that remembers where it paints, through its transforms: every point of every path
 * filled or stroked (curves and arcs sampled finely), with half the line width for strokes.
 */
function recordingContext() {
  type Matrix = [number, number, number, number, number, number]
  let matrix: Matrix = [1, 0, 0, 1, 0, 0]
  let path: Point[] = []
  let clip: Point[] | null = null
  let cursor: Point = [0, 0]
  const stack: { matrix: Matrix; clip: Point[] | null; lineWidth: number }[] = []
  const marks: Mark[] = []
  const state = { lineWidth: 1 }

  const apply = ([x, y]: Point): Point => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]
  const scaleOf = () => Math.hypot(matrix[0], matrix[1])
  const add = (point: Point) => {
    path.push(apply(point))
    cursor = point
  }
  const multiply = (a: number, b: number, c: number, d: number, e: number, f: number) => {
    const [A, B, C, D, E, F] = matrix
    matrix = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F]
  }
  const sampleArc = (cx: number, cy: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw = false) => {
    let sweep = end - start
    if (!ccw && sweep < 0) sweep += Math.PI * 2
    if (ccw && sweep > 0) sweep -= Math.PI * 2
    if (Math.abs(end - start) >= Math.PI * 2) sweep = Math.PI * 2
    for (let i = 0; i <= 64; i++) {
      const angle = start + (sweep * i) / 64
      const [x, y] = [rx * Math.cos(angle), ry * Math.sin(angle)]
      add([cx + x * Math.cos(rotation) - y * Math.sin(rotation), cy + x * Math.sin(rotation) + y * Math.cos(rotation)])
    }
  }
  const paint = (pad: number, points = path) => marks.push({ points: [...points], pad, clip })
  const rectPoints = (x: number, y: number, w: number, h: number): Point[] =>
    ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as Point[]).map(apply)

  const ctx = {
    get lineWidth() {
      return state.lineWidth
    },
    set lineWidth(value: number) {
      state.lineWidth = value
    },
    save: () => stack.push({ matrix: [...matrix], clip, lineWidth: state.lineWidth }),
    restore: () => {
      const top = stack.pop()
      if (top) ({ matrix, clip, lineWidth: state.lineWidth } = top)
    },
    translate: (x: number, y: number) => multiply(1, 0, 0, 1, x, y),
    scale: (x: number, y: number) => multiply(x, 0, 0, y, 0, 0),
    rotate: (angle: number) => multiply(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      matrix = [a, b, c, d, e, f]
    },
    beginPath: () => {
      path = []
    },
    closePath: () => undefined,
    moveTo: (x: number, y: number) => add([x, y]),
    lineTo: (x: number, y: number) => add([x, y]),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => {
      const [x0, y0] = cursor
      for (let i = 1; i <= 32; i++) {
        const t = i / 32
        add([(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y])
      }
    },
    bezierCurveTo: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => {
      const [x0, y0] = cursor
      for (let i = 1; i <= 32; i++) {
        const t = i / 32
        const u = 1 - t
        add([u ** 3 * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * x, u ** 3 * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * y])
      }
    },
    arc: (x: number, y: number, r: number, start: number, end: number, ccw?: boolean) => sampleArc(x, y, r, r, 0, start, end, ccw),
    ellipse: (x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw?: boolean) =>
      sampleArc(x, y, rx, ry, rotation, start, end, ccw),
    rect: (x: number, y: number, w: number, h: number) => path.push(...rectPoints(x, y, w, h)),
    roundRect: (x: number, y: number, w: number, h: number) => path.push(...rectPoints(x, y, w, h)),
    fill: () => paint(0),
    stroke: () => paint((state.lineWidth / 2) * scaleOf()),
    clip: () => {
      clip = [...path]
    },
    fillRect: (x: number, y: number, w: number, h: number) => paint(0, rectPoints(x, y, w, h)),
    strokeRect: (x: number, y: number, w: number, h: number) => paint((state.lineWidth / 2) * scaleOf(), rectPoints(x, y, w, h)),
    clearRect: () => undefined,
    fillText: () => undefined,
    strokeText: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, marks }
}

/** How far paint reaches from a centre: never beyond the clip it was painted in. */
function reach({ points, pad, clip }: Mark, [cx, cy]: Point): number {
  const own = Math.max(...points.map(([x, y]) => Math.hypot(x - cx, y - cy))) + pad
  return clip ? Math.min(own, Math.max(...clip.map(([x, y]) => Math.hypot(x - cx, y - cy)))) : own
}

/** The box paint can cover: the mark, spread by its pad, cut to its clip's box. */
function box({ points, pad, clip }: Mark) {
  const xs0 = points.map(([x]) => x)
  const ys0 = points.map(([, y]) => y)
  let [left, right, top, bottom] = [Math.min(...xs0) - pad, Math.max(...xs0) + pad, Math.min(...ys0) - pad, Math.max(...ys0) + pad]
  if (clip) {
    const xs = clip.map(([px]) => px)
    const ys = clip.map(([, py]) => py)
    left = Math.max(left, Math.min(...xs))
    right = Math.min(right, Math.max(...xs))
    top = Math.max(top, Math.min(...ys))
    bottom = Math.min(bottom, Math.max(...ys))
  }
  return { left, right, top, bottom }
}

const R = PHYSICS.birdRadius
const EPSILON = 0.02
const poses = [
  { wing: -1, time: 0 },
  { wing: 0, time: 0.4 },
  { wing: 1, time: 1.3 },
]

/** The bird's front layer (body, face, wing and the headwear over the body) at the origin. */
function frontReach(look: BirdLook): number {
  let farthest = 0
  for (const pose of poses) {
    for (const tilt of [-0.45, 0, 1.2]) {
      const { ctx, marks } = recordingContext()
      ctx.rotate(tilt)
      drawBird(ctx, look, pose)
      farthest = Math.max(farthest, ...marks.map((mark) => reach(mark, [0, 0])))
    }
  }
  return farthest
}

describe('the bird as drawn', () => {
  it.each(SKINS.bird.map((skin) => [skin.name, skin.look] as const))(
    '%s never shows in front of anything beyond its collision circle',
    (_, look) => {
      expect(frontReach(look)).toBeLessThanOrEqual(R + EPSILON)
    },
  )

  it('fills its collision circle: a round bird is drawn exactly as big as it collides', () => {
    for (const skin of SKINS.bird.filter((each) => each.look.shape === 'round')) {
      expect(frontReach(skin.look), skin.name).toBeCloseTo(R, 1)
    }
  })

  it('wears its headwear only above its head', () => {
    for (const skin of SKINS.bird.filter((each) => each.look.accessory)) {
      const { ctx, marks } = recordingContext()
      drawBirdBack(ctx, skin.look, poses[1])
      for (const { points, pad } of marks) {
        for (const [x, y] of points.filter(([px, py]) => Math.hypot(px, py) + pad > R + EPSILON)) {
          // Beyond the body, headwear reaches up, never out to the sides at body height or below.
          expect(y + pad, `${skin.name} at ${x.toFixed(1)}`).toBeLessThan(-R * 0.4)
        }
      }
    }
  })
})

describe('the pipes as drawn', () => {
  const pipe: PipePair = { id: 3, x: 150, gapY: 300, gapHeight: 150, width: 70, passed: false }
  const [upper, lower] = pipeRects(pipe)

  it.each(SKINS.pipes.map((skin) => [skin.name, skin.look] as const))('%s paints exactly its collision rectangles', (_, look) => {
    const { ctx, marks } = recordingContext()
    drawPipePair(ctx, look, { x: pipe.x, width: pipe.width, gapTop: upper.bottom, gapBottom: lower.top, bottom: WORLD.groundY, id: pipe.id }, 1)
    for (const mark of marks) {
      const painted = box(mark)
      if (painted.right < painted.left || painted.bottom < painted.top) continue // clipped away entirely
      expect(painted.left).toBeGreaterThanOrEqual(pipe.x - EPSILON)
      expect(painted.right).toBeLessThanOrEqual(pipe.x + pipe.width + EPSILON)
      // Nothing in the gap: everything is on one pipe or the other.
      expect(painted.bottom <= upper.bottom + EPSILON || painted.top >= lower.top - EPSILON).toBe(true)
    }
    // And the body fills each rectangle (down to the ground and above the screen): nothing looks thinner than it is.
    const fills = (top: number, bottom: number) =>
      marks.some((mark) => {
        const b = box(mark)
        return mark.pad === 0 && !mark.clip && Math.abs(b.left - pipe.x) < EPSILON && Math.abs(b.right - pipe.x - pipe.width) < EPSILON && Math.abs(b.top - top) < EPSILON && Math.abs(b.bottom - bottom) < EPSILON
      })
    expect(fills(-40, upper.bottom)).toBe(true)
    expect(fills(lower.top, WORLD.groundY)).toBe(true)
  })
})

describe('seen touching is crashing', () => {
  const outfits: [string, Outfit][] = [
    ['the default look', DEFAULT_OUTFIT],
    ['Sakura', { bird: findSkin('bird', 'sakura')!, pipes: findSkin('pipes', 'sakura')!, sky: DEFAULT_OUTFIT.sky }],
    ['Toast and Dragon Towers', { bird: findSkin('bird', 'toast')!, pipes: findSkin('pipes', 'dragon')!, sky: DEFAULT_OUTFIT.sky }],
  ]

  /** The closest the drawn bird's front layer comes to anything drawn for the pipes: negative when they overlap. */
  function drawnClearance(outfit: Outfit, y: number, pipe: PipePair, scale = 1): number {
    const state: FlappyState = { ...flap(createFlappyGame(1)), bird: { y, vy: 0 }, pipes: [pipe] }
    const pipes = recordingContext()
    pipes.ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawPipePair(pipes.ctx, outfit.pipes.look, { x: pipe.x, width: pipe.width, gapTop: pipe.gapY - pipe.gapHeight / 2, gapBottom: pipe.gapY + pipe.gapHeight / 2, bottom: WORLD.groundY, id: 0 }, 0)
    const bird = recordingContext()
    bird.ctx.setTransform(scale, 0, 0, scale, 0, 0)
    bird.ctx.translate(BIRD_X, state.bird.y)
    drawBird(bird.ctx, outfit.bird.look, poses[1])
    // The bird's paint is a disc around its centre; the pipes' paint is boxes. Compare in world units.
    const birdReach = Math.max(...bird.marks.map((mark) => reach(mark, [BIRD_X * scale, y * scale]))) / scale
    let clearance = Infinity
    for (const mark of pipes.marks) {
      const b = box(mark)
      if (b.right < b.left || b.bottom < b.top) continue
      const dx = Math.max(b.left - BIRD_X * scale, 0, BIRD_X * scale - b.right)
      const dy = Math.max(b.top - y * scale, 0, y * scale - b.bottom)
      clearance = Math.min(clearance, Math.hypot(dx, dy) / scale - birdReach)
    }
    return clearance
  }

  const cases: [string, (gap: number) => { y: number; pipe: PipePair }][] = [
    ['the side of a pipe', (gap) => ({ y: 315, pipe: { id: 0, x: BIRD_X + R + gap, gapY: 400, gapHeight: 150, width: 70, passed: false } })],
    ['the upper pipe', (gap) => ({ y: 225 + R + gap, pipe: { id: 0, x: 85, gapY: 300, gapHeight: 150, width: 70, passed: false } })],
    ['the lower pipe', (gap) => ({ y: 375 - R - gap, pipe: { id: 0, x: 85, gapY: 300, gapHeight: 150, width: 70, passed: false } })],
  ]

  describe.each(outfits)('with %s', (_, outfit) => {
    it.each(cases)('near %s: clear when it looks clear, a crash when it looks touched', (_, at) => {
      for (const gap of [1, 0.25, 0, -0.25, -2]) {
        const { y, pipe } = at(gap)
        const crashed = crashAt(y, [pipe]) === 'pipe'
        const seen = drawnClearance(outfit, y, pipe)
        expect(seen, `gap ${gap}`).toBeCloseTo(gap, 1)
        expect(crashed, `gap ${gap}`).toBe(gap <= 0)
      }
    })
  })

  it('is the same at every screen size and pixel ratio', () => {
    for (const [cssWidth, ratio] of [
      [311, 1],
      [311, 2],
      [343, 3],
      [400, 1.25],
      [560, 2],
    ]) {
      const frame = canvasFrame(cssWidth, ratio)
      // One scale across and down, and the canvas keeps the world's shape to within a pixel.
      expect(frame.scale).toBe(frame.width / WORLD.width)
      expect(Math.abs(frame.height - WORLD.height * frame.scale)).toBeLessThanOrEqual(0.5)
      for (const [, at] of cases) {
        for (const gap of [1, 0, -1]) {
          const { y, pipe } = at(gap)
          expect(drawnClearance(DEFAULT_OUTFIT, y, pipe, frame.scale)).toBeCloseTo(gap, 1)
        }
      }
    }
  })

  it('draws the whole scene with the bird where the engine has it', () => {
    const state: FlappyState = { ...flap(createFlappyGame(1)), bird: { y: 250, vy: 0 } }
    for (const scale of [0.78, 1, 2]) {
      const { ctx, marks } = recordingContext()
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      drawScene(ctx, state, DEFAULT_OUTFIT, 1)
      // The bird's body is drawn after the ground (whose last stroke spans the screen) and is a disc of
      // the collision radius around the engine's position.
      const ground = marks.findLastIndex((mark) => box(mark).right - box(mark).left >= WORLD.width * scale - EPSILON)
      const body = marks.slice(ground + 1)
      expect(body.length).toBeGreaterThan(5)
      const farthest = Math.max(...body.map((mark) => reach(mark, [BIRD_X * scale, 250 * scale]))) / scale
      expect(farthest).toBeCloseTo(R, 1)
    }
  })
})
