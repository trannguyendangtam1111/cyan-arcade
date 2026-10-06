import { BIRD_START_Y, BIRD_X, WORLD } from '../engine/flappyEngine'
import type { Outfit, SkinSlot } from '../skins'
import type { BirdLook, SkinsBySlot } from '../skins/skinTypes'
import type { FlappyState } from '../types/flappyTypes'
import { BIRD_DRAW_SCALE, drawBird, drawBirdBack, type BirdPose } from './drawBird'
import { drawPipePair, sparkle } from './drawPipes'
import { drawGround, drawSky } from './drawSky'

/**
 * Paints a whole frame of the game from its state and the outfit worn. Pure drawing: it reads the
 * state and changes nothing, so the same state looks the same with any skin and plays the same.
 */

type Ctx = CanvasRenderingContext2D

const SCORE_FONT = "700 54px 'Fredoka Variable', ui-rounded, system-ui, sans-serif"

/**
 * @param time seconds on the screen's clock, for animation only (wings, twinkles, the bob while
 * waiting); never for the game itself
 */
export function drawScene(ctx: Ctx, state: FlappyState, outfit: Outfit, time: number): void {
  const frame = { width: WORLD.width, height: WORLD.height, groundY: WORLD.groundY, distance: state.distance, time }
  drawSky(ctx, outfit.sky.look, frame)

  const ready = state.status === 'ready'
  // While waiting for the first flap the bird bobs in place; that is only a picture.
  const y = ready ? BIRD_START_Y + Math.sin(time * 3) * 7 : state.bird.y
  const tilt = ready ? 0 : birdTilt(state)
  const pose: BirdPose = { wing: state.status === 'over' ? 0.3 : Math.sin(time * (state.bird.vy < 0 && !ready ? 30 : 11)), time }

  // Behind the pipes: the bird's trail and its headwear. Neither collides, so neither may be seen
  // in front of a pipe; the bird's body, drawn last, is exactly what collides.
  if (state.status !== 'over') drawTrail(ctx, outfit.bird.look, y, time)
  ctx.save()
  ctx.translate(BIRD_X, y)
  ctx.rotate(tilt)
  drawBirdBack(ctx, outfit.bird.look, pose)
  ctx.restore()

  for (const pipe of state.pipes) {
    if (pipe.x > WORLD.width || pipe.x + pipe.width < 0) continue
    drawPipePair(
      ctx,
      outfit.pipes.look,
      {
        x: pipe.x,
        width: pipe.width,
        gapTop: pipe.gapY - pipe.gapHeight / 2,
        gapBottom: pipe.gapY + pipe.gapHeight / 2,
        bottom: WORLD.groundY,
        id: pipe.id,
      },
      time,
    )
  }
  drawGround(ctx, outfit.sky.look, frame)

  ctx.save()
  ctx.translate(BIRD_X, y)
  ctx.rotate(tilt)
  drawBird(ctx, outfit.bird.look, pose)
  ctx.restore()

  if (!ready) drawScore(ctx, state.score)
}

/** Nose up while climbing, down while falling. */
function birdTilt(state: FlappyState): number {
  if (state.crash === 'ground') return 1.35
  return Math.max(-0.45, Math.min(1.2, state.bird.vy / 600))
}

function drawScore(ctx: Ctx, score: number): void {
  ctx.save()
  ctx.font = SCORE_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)'
  ctx.strokeText(String(score), WORLD.width / 2, 34)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(String(score), WORLD.width / 2, 34)
  ctx.restore()
}

/** Particles the bird leaves behind, by its look's trail. They follow the bird and fade. */
function drawTrail(ctx: Ctx, look: BirdLook, y: number, time: number): void {
  if (look.trail === 'none') return
  const color = look.trailColor ?? '#ffffff'
  ctx.save()
  for (let k = 0; k < 8; k++) {
    const age = (time * 2.2 + k / 8) % 1
    const px = BIRD_X - 12 - age * 70
    const py = y + Math.sin(k * 2.3 + time * 2) * 6 + age * (look.trail === 'smoke' || look.trail === 'mist' ? -8 : 10)
    ctx.globalAlpha = (1 - age) * 0.85
    ctx.fillStyle = color
    ctx.strokeStyle = color
    switch (look.trail) {
      case 'petals':
      case 'feathers':
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(time * 3 + k)
        ctx.beginPath()
        ctx.ellipse(0, 0, look.trail === 'petals' ? 4 : 5.5, 2.2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        break
      case 'sparkles':
        sparkle(ctx, px, py, 3 + (1 - age) * 3)
        ctx.fill()
        break
      case 'embers':
        ctx.shadowColor = color
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(px, py, 3.2 * (1 - age) + 0.8, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'smoke':
      case 'mist':
        ctx.globalAlpha *= 0.6
        ctx.beginPath()
        ctx.arc(px, py, 3 + age * 8, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'neon':
        ctx.shadowColor = color
        ctx.shadowBlur = 10
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(px + 8, py)
        ctx.lineTo(px - 4, py)
        ctx.stroke()
        break
      case 'bubbles':
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'shadow':
        ctx.globalAlpha *= 0.7
        ctx.beginPath()
        ctx.ellipse(px, py, 7 * (1 - age) + 2, 3, 0, 0, Math.PI * 2)
        ctx.fill()
        break
    }
  }
  ctx.restore()
}

/**
 * A skin on its own, filling a `width` × `height` box: the bird, a pipe pair or a little sky.
 * Used by the skin picker and the shop.
 */
export function drawSkinPreview<Slot extends SkinSlot>(
  ctx: Ctx,
  slot: Slot,
  skin: SkinsBySlot[Slot],
  width: number,
  height: number,
  time: number,
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  if (slot === 'bird') {
    // Room for the tallest headwear (a flame crest) above the head and the beak in front.
    const scale = Math.min(width, height) / (60 * BIRD_DRAW_SCALE)
    ctx.translate(width / 2 - 3 * scale * BIRD_DRAW_SCALE, height / 2 + 6 * scale * BIRD_DRAW_SCALE)
    ctx.scale(scale, scale)
    const look = (skin as SkinsBySlot['bird']).look
    const pose = { wing: Math.sin(time * 6), time }
    drawBirdBack(ctx, look, pose)
    drawBird(ctx, look, pose)
  } else if (slot === 'pipes') {
    const scale = height / 170
    ctx.translate(width / 2 - 35 * scale, 0)
    ctx.scale(scale, scale)
    drawPipePair(ctx, (skin as SkinsBySlot['pipes']).look, { x: 0, width: 70, gapTop: 58, gapBottom: 118, bottom: 200, id: 0 }, time)
  } else {
    const look = (skin as SkinsBySlot['sky']).look
    const scale = width / 240
    ctx.scale(scale, scale)
    const frame = { width: 240, height: height / scale, groundY: height / scale - 26, distance: 0, time }
    drawSky(ctx, look, frame)
    drawGround(ctx, look, frame)
  }
  ctx.restore()
}
