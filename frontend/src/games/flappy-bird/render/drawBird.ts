import { PHYSICS } from '../engine/flappyEngine'
import type { BirdLook } from '../skins/skinTypes'

/**
 * Draws a bird with its centre at the origin, facing right, for the look given.
 *
 * The bird's body is what collides, and it is drawn to be exactly the engine's collision circle:
 * the outside of its outline is the circle, so the bird crashes the moment it is seen to touch
 * something, and never before. Bodies that are not round (a blob, a potato, toast, a cup) fit inside
 * the circle, and so do the eye, the beak and the wing. Headwear (ears, a tuft, a halo...) rises above
 * the head, so the bird is drawn in two layers: {@link drawBirdBack}, the headwear whole, which the
 * scene draws behind the pipes, and {@link drawBird}, the body with the headwear's part over it, in
 * front. Near a pipe, headwear tucks behind it: only the collision circle is ever seen in front of one.
 *
 * Shapes are designed on a body of radius {@link DESIGN_RADIUS} and scaled to the circle.
 */

/** The body's radius in the units the bird is designed in. */
const DESIGN_RADIUS = 17
/** The body's outline, in design units; half of it lies outside the body. */
const BODY_OUTLINE = 2.5

/** How much the design is scaled so that the outline's outer edge is the collision circle. */
export const BIRD_DRAW_SCALE = PHYSICS.birdRadius / (DESIGN_RADIUS + BODY_OUTLINE / 2)

type Ctx = CanvasRenderingContext2D

export interface BirdPose {
  /** Wing position, -1 (up) to 1 (down). */
  wing: number
  /** Seconds, for anything that shimmers. */
  time: number
}

/** Headwear worn behind the head; the rest is worn in front of it. */
const BEHIND_THE_HEAD = new Set(['ears', 'hood'])

/** The bird's headwear, whole: the layer the scene draws behind the pipes. Nothing here collides. */
export function drawBirdBack(ctx: Ctx, look: BirdLook, pose: BirdPose): void {
  if (!look.accessory) return
  ctx.save()
  ctx.scale(BIRD_DRAW_SCALE, BIRD_DRAW_SCALE)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (look.accessory === 'ears') drawEars(ctx, look)
  else if (look.accessory === 'hood') drawHood(ctx, look)
  else drawAccessory(ctx, look, pose.time)
  ctx.restore()
}

/**
 * The bird's body (exactly the collision circle, outline included) with its face and wing, and the
 * part of its headwear that lies over it. Draw {@link drawBirdBack} first, behind the pipes.
 */
export function drawBird(ctx: Ctx, look: BirdLook, pose: BirdPose): void {
  const r = DESIGN_RADIUS
  ctx.save()
  ctx.scale(BIRD_DRAW_SCALE, BIRD_DRAW_SCALE)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (look.glow) {
    ctx.shadowColor = look.glow
    ctx.shadowBlur = 16
  }

  bodyPath(ctx, look.shape, r)
  ctx.fillStyle = look.body
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = BODY_OUTLINE
  ctx.strokeStyle = look.outline
  ctx.stroke()

  // Everything else stays inside the body's outline.
  ctx.save()
  bodyPath(ctx, look.shape, r)
  ctx.clip()
  ctx.fillStyle = look.belly
  ctx.beginPath()
  ctx.ellipse(4, 8, r * 0.75, r * 0.55, -0.2, 0, Math.PI * 2)
  ctx.fill()
  if (look.spots) drawSpots(ctx, look)
  if (look.shape === 'cup') drawPearls(ctx, look)
  ctx.restore()

  drawWing(ctx, look, pose.wing)
  drawEye(ctx, look, pose.time)
  if (look.cheek) {
    ctx.fillStyle = look.cheek
    ctx.globalAlpha = 0.65
    ctx.beginPath()
    ctx.ellipse(7, 5, 3.6, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  drawBeak(ctx, look)
  if (look.accessory && !BEHIND_THE_HEAD.has(look.accessory)) {
    // Over the body, the headwear is in front of it (a visor, a headband); outside it, only the back layer shows.
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, r + BODY_OUTLINE / 2, 0, Math.PI * 2)
    ctx.clip()
    drawAccessory(ctx, look, pose.time)
    ctx.restore()
  }
  ctx.restore()
}

function bodyPath(ctx: Ctx, shape: BirdLook['shape'], r: number): void {
  ctx.beginPath()
  switch (shape) {
    case 'round':
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      break
    case 'blob':
      ctx.ellipse(0, 0, r, r * 0.86, 0, 0, Math.PI * 2)
      break
    case 'potato':
      ctx.moveTo(-r * 0.95, -r * 0.1)
      ctx.bezierCurveTo(-r * 0.75, -r * 0.6, -r * 0.3, -r * 0.9, r * 0.25, -r * 0.85)
      ctx.bezierCurveTo(r * 0.7, -r * 0.65, r * 0.95, r * 0.1, r * 0.75, r * 0.55)
      ctx.bezierCurveTo(r * 0.5, r * 0.85, -r * 0.4, r * 0.9, -r * 0.8, r * 0.5)
      ctx.closePath()
      break
    case 'toast':
      // A slice of bread: a square with a puffy top.
      ctx.moveTo(-r * 0.7, r * 0.62)
      ctx.lineTo(-r * 0.7, -r * 0.3)
      ctx.bezierCurveTo(-r * 0.95, -r * 0.3, -r * 0.75, -r * 0.65, -r * 0.35, -r * 0.8)
      ctx.bezierCurveTo(-r * 0.15, -r * 0.98, r * 0.25, -r * 0.95, r * 0.45, -r * 0.75)
      ctx.bezierCurveTo(r * 0.75, -r * 0.65, r * 0.95, -r * 0.3, r * 0.7, -r * 0.3)
      ctx.lineTo(r * 0.7, r * 0.62)
      ctx.quadraticCurveTo(r * 0.7, r * 0.7, r * 0.6, r * 0.7)
      ctx.lineTo(-r * 0.6, r * 0.7)
      ctx.quadraticCurveTo(-r * 0.7, r * 0.7, -r * 0.7, r * 0.62)
      break
    case 'cup':
      // A rounded cup, a little wider at the top.
      ctx.moveTo(-r * 0.8, -r * 0.55)
      ctx.quadraticCurveTo(0, -r * 0.95, r * 0.8, -r * 0.55)
      ctx.lineTo(r * 0.62, r * 0.72)
      ctx.quadraticCurveTo(0, r * 0.98, -r * 0.62, r * 0.72)
      ctx.closePath()
      break
  }
}

function drawSpots(ctx: Ctx, look: BirdLook): void {
  ctx.fillStyle = look.spots ?? look.outline
  for (const [x, y, size] of [
    [-8, -6, 2.2],
    [-3, -11, 1.6],
    [-10, 4, 1.8],
    [2, -3, 1.2],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPearls(ctx: Ctx, look: BirdLook): void {
  ctx.fillStyle = look.spots ?? '#3f2a1d'
  for (const [x, y] of [
    [-8, 11],
    [-2, 13],
    [4, 12],
    [9, 9],
    [-5, 7],
    [2, 8],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x, y, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWing(ctx: Ctx, look: BirdLook, wing: number): void {
  ctx.save()
  ctx.translate(-5, 2)
  ctx.rotate(wing * 0.55)
  ctx.beginPath()
  ctx.ellipse(-2, 0, 9, 5.5, -0.35, 0, Math.PI * 2)
  ctx.fillStyle = look.wing
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = look.outline
  ctx.stroke()
  ctx.restore()
}

function drawEye(ctx: Ctx, look: BirdLook, time: number): void {
  const big = look.eye === 'sparkle'
  const eyeRadius = big ? 6.5 : 5.5
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(6, -5, eyeRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = look.outline
  ctx.stroke()

  switch (look.eye) {
    case 'dot':
      ctx.fillStyle = look.eyeColor
      ctx.beginPath()
      ctx.arc(8, -5, 2.8, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'sparkle': {
      ctx.fillStyle = look.eyeColor
      ctx.beginPath()
      ctx.arc(7.5, -4.5, 4.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(9, -6.5, 1.7, 0, Math.PI * 2)
      ctx.arc(6.2, -2.6, 0.9, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'glow':
      ctx.save()
      ctx.shadowColor = look.eyeColor
      ctx.shadowBlur = 8 + Math.sin(time * 5) * 3
      ctx.fillStyle = look.eyeColor
      ctx.beginPath()
      ctx.ellipse(8, -5, 3.4, 2.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      break
    case 'focused':
      ctx.fillStyle = look.eyeColor
      ctx.beginPath()
      ctx.arc(8, -4.5, 2.6, 0, Math.PI * 2)
      ctx.fill()
      // A determined brow.
      ctx.strokeStyle = look.outline
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(1, -12)
      ctx.lineTo(11, -9)
      ctx.stroke()
      break
  }
}

function drawBeak(ctx: Ctx, look: BirdLook): void {
  ctx.fillStyle = look.beak
  ctx.strokeStyle = look.outline
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(11, -1)
  ctx.quadraticCurveTo(20, 1.5, 11, 6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

function drawEars(ctx: Ctx, look: BirdLook): void {
  for (const tilt of [-0.35, 0.05]) {
    ctx.save()
    ctx.translate(-2 + tilt * 10, -12)
    ctx.rotate(tilt)
    ctx.beginPath()
    ctx.ellipse(0, -10, 5, 12, 0, 0, Math.PI * 2)
    ctx.fillStyle = look.body
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = look.outline
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0, -10, 2.4, 8, 0, 0, Math.PI * 2)
    ctx.fillStyle = look.accessoryColor ?? '#fbcfe8'
    ctx.fill()
    ctx.restore()
  }
}

function drawHood(ctx: Ctx, look: BirdLook): void {
  ctx.beginPath()
  ctx.arc(0, 0, DESIGN_RADIUS, Math.PI * 0.95, Math.PI * 1.6)
  ctx.lineTo(-4, -26)
  ctx.lineTo(-11, -15)
  ctx.closePath()
  ctx.fillStyle = look.accessoryColor ?? '#0f172a'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = look.outline
  ctx.stroke()
}

function star(ctx: Ctx, x: number, y: number, outer: number, inner: number, points = 5): void {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  ctx.closePath()
}

function drawAccessory(ctx: Ctx, look: BirdLook, time: number): void {
  const color = look.accessoryColor ?? look.outline
  ctx.fillStyle = color
  ctx.strokeStyle = look.outline
  ctx.lineWidth = 2
  switch (look.accessory) {
    case 'tuft':
      ctx.beginPath()
      ctx.moveTo(-4, -16)
      ctx.quadraticCurveTo(-6, -27, 2, -24)
      ctx.quadraticCurveTo(4, -29, 7, -22)
      ctx.quadraticCurveTo(5, -18, 3, -16)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    case 'bow':
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(0, -17)
        ctx.quadraticCurveTo(side * 11, -28, side * 10, -14)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(0, -17, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    case 'sprout':
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(0, -16)
      ctx.lineTo(0, -23)
      ctx.stroke()
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.ellipse(side * 5, -25, 5.5, 3, side * -0.5, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'eggshell':
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(-13, -10)
      ctx.quadraticCurveTo(-11, -24, 1, -24)
      ctx.quadraticCurveTo(13, -24, 14, -10)
      ctx.lineTo(9, -13)
      ctx.lineTo(5, -9)
      ctx.lineTo(1, -13)
      ctx.lineTo(-3, -9)
      ctx.lineTo(-8, -13)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    case 'puffs':
      for (const [x, y, size] of [
        [-11, -15, 5.5],
        [-3, -17, 7],
        [7, -14, 6],
        [-12, 1, 4],
      ] as const) {
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = look.outline
        ctx.stroke()
      }
      break
    case 'blossom':
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5 + time * 0.4
        ctx.beginPath()
        ctx.ellipse(-4 + Math.cos(angle) * 4, -18 + Math.sin(angle) * 4, 3.6, 2.4, angle, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = '#f472b6'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      ctx.arc(-4, -18, 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'visor':
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.fillStyle = color
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(-2, -11)
      ctx.lineTo(16, -8)
      ctx.lineTo(15, -2)
      ctx.lineTo(-1, -4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      break
    case 'tiara':
      star(ctx, 0, -22, 7.5, 3.2)
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 8 + Math.sin(time * 6) * 4
      ctx.fill()
      ctx.restore()
      ctx.stroke()
      break
    case 'topknot':
      ctx.beginPath()
      ctx.ellipse(-6, -19, 5, 4, -0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // The headband, with its tails flying behind.
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(-14, -11)
      ctx.quadraticCurveTo(0, -17, 14, -11)
      ctx.stroke()
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(-14, -11)
      ctx.quadraticCurveTo(-21, -15 + Math.sin(time * 9) * 2, -26, -14)
      ctx.moveTo(-14, -11)
      ctx.quadraticCurveTo(-20, -12 + Math.sin(time * 9 + 1) * 2, -24, -10)
      ctx.stroke()
      break
    case 'horns':
      for (const x of [-7, 4]) {
        ctx.beginPath()
        ctx.moveTo(x - 3, -14)
        ctx.quadraticCurveTo(x - 4, -24, x + 3, -27)
        ctx.quadraticCurveTo(x + 1, -21, x + 4, -14)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      break
    case 'flame-crest': {
      const flicker = Math.sin(time * 14) * 2
      ctx.save()
      ctx.shadowColor = '#fb923c'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(-12, -12)
      ctx.quadraticCurveTo(-14, -26 - flicker, -6, -30)
      ctx.quadraticCurveTo(-5, -22, -1, -24)
      ctx.quadraticCurveTo(1, -33 + flicker, 7, -28)
      ctx.quadraticCurveTo(6, -20, 11, -14)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = '#fef3c7'
      ctx.beginPath()
      ctx.ellipse(-2, -18, 3, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'halo':
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(0, -25 + Math.sin(time * 3) * 1.5, 10, 3.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      break
    case 'butter':
      ctx.beginPath()
      ctx.moveTo(-8, -18)
      ctx.lineTo(6, -20)
      ctx.lineTo(9, -14)
      ctx.lineTo(-5, -12)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#ca8a04'
      ctx.stroke()
      break
    case 'straw':
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(4, -14)
      ctx.lineTo(10, -30)
      ctx.stroke()
      ctx.restore()
      // A little lid.
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.ellipse(0, -15, 16, 3.5, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    default:
      break
  }
}
