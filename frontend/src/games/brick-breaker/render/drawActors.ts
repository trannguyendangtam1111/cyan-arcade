import { BALL_RADIUS, PADDLE } from '../engine/arena'
import { DROP_SIZE } from '../engine/powerUps'
import { powerUpColour } from '../effects/juice'
import type { BallLook, PaddleLook } from '../skins/skinTypes'
import type { Ball, Bolt, Drop, PowerUpKind } from '../types/brickTypes'
import { bitmap, blit, hash, PX, rect, textBitmap } from './pixel'

/**
 * The paddle, the balls, falling power-ups and laser bolts, in pixel art. Everything is drawn at
 * exactly the size the engine uses for it: a skin changes colours and pictures, never sizes.
 */

type Ctx = CanvasRenderingContext2D

const INK = '#1e1b4b'

export interface PaddleExtras {
  laser: boolean
  magnet: boolean
  /** Squash after a bounce, 0 to 1. */
  squash: number
  /** A laser's muzzle flash, 0 to 1. */
  muzzle: number
  time: number
}

/** Snaps to the art-pixel grid, so moving things stay pixel art too. */
const snap = (value: number) => Math.round(value / PX) * PX

/** The paddle centred on `x`, its top at the engine's paddle line, filling exactly its rectangle. */
export function drawPaddle(ctx: Ctx, look: PaddleLook, x: number, width: number, extras: PaddleExtras): void {
  const h = PADDLE.height
  const top = PADDLE.y
  const columns = Math.round(width / PX)
  const rows = Math.round(h / PX)
  ctx.save()
  ctx.translate(x, top + h)
  ctx.scale(1 + extras.squash * 0.05, 1 - extras.squash * 0.18)
  ctx.translate(-x, -(top + h))

  if (extras.magnet) {
    // A field of pixel arcs above the paddle.
    ctx.fillStyle = '#a78bfa'
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.3 + 0.25 * Math.sin(extras.time * 6 + i)
      const rx = width / 2 - i * 8
      const ry = 10 + i * 5
      for (let a = 0; a <= 16; a++) {
        const angle = Math.PI + (a / 16) * Math.PI
        ctx.fillRect(snap(x + Math.cos(angle) * rx) - 1, snap(top + Math.sin(angle) * ry) - 1, PX, PX)
      }
    }
    ctx.globalAlpha = 1
  }

  if (look.glow) {
    ctx.shadowColor = look.glow
    ctx.shadowBlur = 10
  }
  blit(ctx, `paddle|${look.pattern}|${look.body}|${columns}`, x - width / 2, top, columns, rows, PX, (g) => paintPaddle(g, look, columns, rows))
  ctx.shadowBlur = 0

  if (extras.laser) {
    for (const side of [-1, 1]) {
      const cx = snap(x + side * (width / 2 - 8))
      rect(ctx, cx - 3, top - 6, 6, 6, '#334155')
      rect(ctx, cx - 3, top - 6, 6, 2, '#64748b')
      rect(ctx, cx - 1, top - 9, 2, 3, '#f87171')
      if (extras.muzzle > 0) {
        ctx.globalAlpha = extras.muzzle
        const size = snap(4 + 6 * extras.muzzle)
        rect(ctx, cx - size / 2, top - 10 - size / 2, size, size, '#fecaca')
        ctx.globalAlpha = 1
      }
    }
  }
  ctx.restore()
}

function paintPaddle(g: Ctx, look: PaddleLook, W: number, H: number): void {
  const c = Math.floor(W / 2)
  // Body with round pixel ends, a lit rim where the ball bounces, a shaded underside.
  rect(g, 1, 0, W - 2, H, look.outline)
  rect(g, 0, 1, W, H - 2, look.outline)
  rect(g, 1, 1, W - 2, H - 2, look.body)
  rect(g, 2, 1, W - 4, 1, look.rim)
  rect(g, 1, H - 2, W - 2, 1, look.shade)

  switch (look.pattern) {
    case 'face':
      // A happy little face: eyes, a smile, rosy cheeks.
      rect(g, c - 5, 2, 1, 2, INK)
      rect(g, c + 4, 2, 1, 2, INK)
      rect(g, c - 1, 3, 2, 1, INK)
      rect(g, c - 8, 3, 2, 1, look.patternColor)
      rect(g, c + 6, 3, 2, 1, look.patternColor)
      rect(g, 3, 2, 3, 1, '#ffffff')
      break
    case 'candy':
      for (let x = 1; x < W - 1; x++) for (let y = 1; y < H - 1; y++) if ((x + y) % 6 < 2) rect(g, x, y, 1, 1, look.patternColor)
      // The wrapper's twisted ends.
      rect(g, 1, 1, 2, H - 2, look.shade)
      rect(g, W - 3, 1, 2, H - 2, look.shade)
      rect(g, 2, 2, 1, 2, look.rim)
      rect(g, W - 3, 2, 1, 2, look.rim)
      break
    case 'neon':
      rect(g, 1, 1, W - 2, 1, look.rim)
      for (let x = 4; x < W - 4; x += 4) rect(g, x, 3, 2, 1, look.patternColor)
      break
    case 'blossom':
      for (let x = 5; x < W - 3; x += 9) {
        rect(g, x - 1, 2, 1, 1, look.patternColor)
        rect(g, x + 1, 2, 1, 1, look.patternColor)
        rect(g, x - 1, 3, 3, 1, look.patternColor)
        rect(g, x, 2, 1, 1, '#fde047')
      }
      break
    case 'stars':
      for (let x = 2; x < W - 2; x += 3) {
        if (hash(x) < 0.55) rect(g, x, 2 + Math.floor(hash(x * 3.1) * 2), 1, 1, hash(x * 7) < 0.5 ? look.patternColor : '#a5b4fc')
      }
      rect(g, c, 2, 1, 1, '#ffffff')
      rect(g, c - 1, 3, 3, 1, look.patternColor)
      break
    case 'scales':
      for (let x = 1; x < W - 1; x++) {
        if (x % 3 === 0) rect(g, x, 2, 1, 1, look.patternColor)
        if (x % 3 !== 0) rect(g, x, 3, 1, 1, x % 3 === 1 ? look.patternColor : look.shade)
      }
      break
    case 'circuit':
      for (let x = 3; x < W - 3; x++) rect(g, x, x % 10 < 5 ? 2 : 3, 1, 1, look.patternColor)
      for (let x = 7; x < W - 3; x += 10) rect(g, x, 2, 1, 2, '#ffffff')
      break
    case 'mochi': {
      // Three squishy mochi in a row: strawberry, plain and matcha, each with a sleepy face.
      const third = Math.floor((W - 2) / 3)
      ;['#fbcfe8', look.body, look.patternColor].forEach((colour, i) => {
        const left = 1 + i * third
        rect(g, left, 1, third, H - 2, colour)
        rect(g, left + 1, 1, third - 2, 1, '#ffffff')
        const mid = left + Math.floor(third / 2)
        rect(g, mid - 3, 2, 1, 1, INK)
        rect(g, mid + 2, 2, 1, 1, INK)
        rect(g, mid - 1, 3, 2, 1, '#f472b6')
        if (i > 0) rect(g, left, 1, 1, H - 2, look.shade)
      })
      break
    }
  }
}

// --- Balls --------------------------------------------------------------------------------------

/** A ball is 14 × 14 art pixels of one world unit each: finer than the bricks, so it reads as round. */
const BALL_CELLS = BALL_RADIUS * 2

const FIRE_LOOK: BallLook = { core: '#fff7ed', rim: '#c2410c', highlight: '#ffffff', trail: '#fb923c', pattern: 'ember' }

const ANIMATED = new Set<BallLook['pattern']>(['ember', 'plasma', 'galaxy'])

/** A ball, with its trail and, under Fireball, flames. Drawn inside the circle the engine bounces. */
export function drawBall(ctx: Ctx, look: BallLook, ball: Pick<Ball, 'x' | 'y'>, trail: readonly { x: number; y: number }[], fire: boolean, time: number): void {
  const r = BALL_RADIUS
  // The trail: fading pixel squares along recent positions.
  trail.forEach((point, i) => {
    const t = (i + 1) / (trail.length + 1)
    ctx.globalAlpha = t * (fire ? 0.7 : 0.45)
    const size = snap(r * (fire ? 0.7 + t * 1.1 : 0.5 + t * 0.8))
    rect(ctx, snap(point.x) - size / 2, snap(point.y) - size / 2, size, size, fire ? (i % 2 === 0 ? '#fb923c' : '#facc15') : look.trail)
  })
  ctx.globalAlpha = 1

  const shown = fire ? FIRE_LOOK : look
  const frame = ANIMATED.has(shown.pattern) ? Math.floor(time * 8) % 4 : 0
  if (fire) {
    // A crackling pixel aura, a few pixels outside the ball (a picture only: the ball is its circle).
    ctx.save()
    ctx.shadowColor = '#f97316'
    ctx.shadowBlur = 14
    blit(ctx, `aura|${frame}`, ball.x - r - 4, ball.y - r - 4, BALL_CELLS + 8, BALL_CELLS + 8, 1, (g) => paintAura(g, frame))
    ctx.restore()
  }

  ctx.save()
  if (shown.glow) {
    ctx.shadowColor = shown.glow
    ctx.shadowBlur = 8
  }
  blit(ctx, `ball|${shown.pattern}|${shown.core}|${frame}`, ball.x - r, ball.y - r, BALL_CELLS, BALL_CELLS, 1, (g) => paintBall(g, shown, frame))
  ctx.restore()
}

function insideBall(x: number, y: number, radius: number): boolean {
  return (x + 0.5 - BALL_RADIUS) ** 2 + (y + 0.5 - BALL_RADIUS) ** 2 <= radius * radius
}

function paintBall(g: Ctx, look: BallLook, frame: number): void {
  const N = BALL_CELLS
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!insideBall(x, y, BALL_RADIUS)) continue
      rect(g, x, y, 1, 1, insideBall(x, y, BALL_RADIUS - 1.6) ? look.core : look.rim)
    }
  }
  const c = BALL_RADIUS
  const dot = (x: number, y: number, colour: string) => {
    if (insideBall(x, y, BALL_RADIUS - 1.6)) rect(g, x, y, 1, 1, colour)
  }
  switch (look.pattern) {
    case 'ember':
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (insideBall(x, y, 4) && (x + y + frame) % 3 !== 0) dot(x + (frame % 2), y + 1, '#fde047')
      dot(c - 1 + (frame % 2), c + 1, '#ffffff')
      break
    case 'frost':
      for (let i = -4; i <= 4; i++) {
        dot(c + i, c, '#ffffff')
        dot(c, c + i, '#ffffff')
      }
      for (const i of [-3, -2, 2, 3]) {
        dot(c + i, c + i, '#e0f2fe')
        dot(c + i, c - i, '#e0f2fe')
      }
      break
    case 'plasma': {
      const path = [0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]
      for (let i = 0; i < 11; i++) dot(2 + i, c + path[(i + frame * 3) % path.length], '#fdf4ff')
      for (let i = 0; i < 6; i++) dot(4 + ((i * 5 + frame * 3) % 7), 3 + ((i * 3 + frame) % 9), '#f0abfc')
      break
    }
    case 'star':
      // A lucky little star with a sleepy smile.
      for (const [x, y] of [
        [c, 2],
        [c - 1, 3],
        [c + 1, 3],
      ]) {
        dot(x, y, '#fef9c3')
      }
      dot(c - 3, c, INK)
      dot(c + 2, c, INK)
      dot(c - 1, c + 2, INK)
      dot(c, c + 2, INK)
      dot(c - 5, c + 1, '#fb7185')
      dot(c + 4, c + 1, '#fb7185')
      break
    case 'bubble':
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (insideBall(x, y, 3.6) && !insideBall(x, y, 2.4)) dot(x + 2, y + 2, '#7dd3fc')
      dot(c + 3, c - 4, '#ffffff')
      break
    case 'galaxy':
      for (let i = 0; i < 14; i++) {
        const angle = (frame * Math.PI) / 2 + i * 0.55
        const radius = i * 0.4
        dot(Math.round(c - 0.5 + Math.cos(angle) * radius), Math.round(c - 0.5 + Math.sin(angle) * radius), i % 3 === 0 ? '#ffffff' : '#c7d2fe')
        dot(Math.round(c - 0.5 - Math.cos(angle) * radius), Math.round(c - 0.5 - Math.sin(angle) * radius), '#a5b4fc')
      }
      break
    default:
      break
  }
  // The highlight, top left.
  dot(c - 4, c - 4, look.highlight)
  dot(c - 3, c - 4, look.highlight)
  dot(c - 4, c - 3, look.highlight)
}

function paintAura(g: Ctx, frame: number): void {
  const N = BALL_CELLS + 8
  const centre = N / 2
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - centre, y + 0.5 - centre)
      if (d < BALL_RADIUS || d > BALL_RADIUS + 4) continue
      const noise = hash(x * 13 + y * 7 + frame * 31)
      if (noise < 0.45) continue
      rect(g, x, y - (noise > 0.8 ? 1 : 0), 1, 1, d < BALL_RADIUS + 2 ? '#fde047' : noise > 0.75 ? '#f97316' : '#fb923c')
    }
  }
}

// --- Power-ups and bolts ------------------------------------------------------------------------

/** Each power-up's picture, in art pixels: `#` ink, `W` white. Never told apart by colour alone. */
const ICONS: Record<PowerUpKind, readonly string[]> = {
  extraBall: textBitmap('+1'),
  twoBalls: textBitmap('+2'),
  doubleScore: textBitmap('X2'),
  multiBall: ['.#...#...#.', '###.###.###', '.#...#...#.'],
  widePaddle: ['..#.....#..', '.##.....##.', '###########', '.##.....##.', '..#.....#..'],
  fireball: ['..#..', '.##.#', '.####', '#####', '.###.'],
  laser: ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  magnet: ['W...W', '#...#', '#...#', '#...#', '.###.'],
  extraLife: ['.#.#.', '#####', '#####', '.###.', '..#..'],
}

/** A power-up's picture on its own, for the HUD: `rows` × its width, in art pixels. */
export function powerUpIcon(kind: PowerUpKind): readonly string[] {
  return ICONS[kind]
}

/** A falling power-up: a pixel capsule in its rarity's colour with its picture, popping in when it appears. */
export function drawDrop(ctx: Ctx, drop: Drop, ageMs: number, time: number): void {
  const colour = powerUpColour(drop.kind)
  const appear = Math.min(1, ageMs / 180)
  const pop = appear < 1 ? 0.6 + appear * 0.6 : 1 + Math.sin(time * 8) * 0.04
  const { width: w, height: h } = DROP_SIZE
  const columns = Math.round(w / PX)
  const rows = Math.round(h / PX)
  ctx.save()
  ctx.translate(drop.x, drop.y)
  ctx.scale(pop, pop)
  // A shimmering trail of pixels above it.
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.45 - i * 0.13
    rect(ctx, -w / 2 + 6 + ((Math.floor(time * 10) + i * 5) % (w - 12)), -h / 2 - 4 - i * 4, PX, PX, colour)
    rect(ctx, -PX / 2, -h / 2 - 4 - i * 4, PX, PX, '#ffffff')
  }
  ctx.globalAlpha = 1
  ctx.shadowColor = colour
  ctx.shadowBlur = 12
  blit(ctx, `drop|${drop.kind}`, -w / 2, -h / 2, columns, rows, PX, (g) => paintCapsule(g, drop.kind, colour, columns, rows))
  ctx.restore()
}

function paintCapsule(g: Ctx, kind: PowerUpKind, colour: string, W: number, H: number): void {
  rect(g, 2, 0, W - 4, H, '#0f172a')
  rect(g, 1, 1, W - 2, H - 2, '#0f172a')
  rect(g, 0, 2, W, H - 4, '#0f172a')
  rect(g, 2, 1, W - 4, H - 2, colour)
  rect(g, 1, 2, W - 2, H - 4, colour)
  rect(g, 3, 1, W - 6, 1, 'rgba(255,255,255,0.6)')
  rect(g, 2, H - 2, W - 4, 1, 'rgba(15,23,42,0.25)')
  const icon = ICONS[kind]
  const width = icon[0].length
  bitmap(g, icon, { '#': INK, W: '#ffffff' }, Math.floor((W - width) / 2), Math.floor((H - icon.length) / 2))
}

export function drawBolt(ctx: Ctx, bolt: Bolt): void {
  ctx.save()
  ctx.shadowColor = '#f87171'
  ctx.shadowBlur = 8
  rect(ctx, snap(bolt.x) - 2, bolt.y + 2, 4, 8, 'rgba(248,113,113,0.6)')
  rect(ctx, snap(bolt.x) - 1, bolt.y, 2, 12, '#fff1f2')
  ctx.restore()
}
