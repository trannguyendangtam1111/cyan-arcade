import { ARENA, BALL_RADIUS, PADDLE } from '../engine/arena'
import { POWER_UPS, TIMED_POWER_UPS } from '../engine/powerUps'
import { comboMultiplier } from '../engine/scoring'
import { powerUpColour, type Juice } from '../effects/juice'
import type { Outfit, SkinSlot } from '../skins'
import type { SkinsBySlot } from '../skins/skinTypes'
import type { Brick, BrickState } from '../types/brickTypes'
import { drawBall, drawBolt, drawDrop, drawPaddle, powerUpIcon } from './drawActors'
import { drawBrick } from './drawBricks'
import { bitmap, blitPart, drawText, PX, rect, textWidth } from './pixel'
import { drawAmbient } from '@/games/shared/pixel/scenery'
import { LEVEL_WORLDS, SCENE_COLUMNS, SCENE_ROWS, worldOf, type World } from './worlds'

/**
 * Paints a whole frame from the game's state, the outfit worn and the effects of the moment, in
 * pixel art: the level's world behind, then the bricks, the power-ups, the paddle and the balls,
 * the effects, and the score on top. It reads the state and changes nothing, so a frame never
 * affects the game.
 */

type Ctx = CanvasRenderingContext2D

const SHADOW = 'rgba(15,10,30,0.9)'

/** @param time seconds on the screen's clock, for animation only */
export function drawScene(ctx: Ctx, state: BrickState, outfit: Outfit, juice: Juice, time: number): void {
  const world = worldOf(outfit.bricks.look, state.level)
  ctx.imageSmoothingEnabled = false
  ctx.save()
  const shake = juice.shakeOffset()
  // Shake in whole art pixels, like everything else.
  ctx.translate(Math.round(shake.x / PX) * PX, Math.round(shake.y / PX) * PX)

  drawWorld(ctx, world, time)
  // The last few bricks glow, so they are easy to find.
  const beacons = state.phase === 'playing' && state.bricks.length <= 3
  for (const brick of state.bricks) drawBrick(ctx, brick, world, (juice.flashes.get(brick.id) ?? 0) / 110, time, beacons)
  for (const drop of state.drops) drawDrop(ctx, drop, juice.dropAges.get(drop.id) ?? 0, time)
  for (const bolt of state.bolts) drawBolt(ctx, bolt)
  drawPaddle(ctx, outfit.paddle.look, state.paddle.x, state.paddle.width, {
    laser: state.effects.laser !== undefined,
    magnet: state.effects.magnet !== undefined,
    squash: juice.paddleSquash,
    muzzle: juice.muzzle,
    time,
  })
  const fire = state.effects.fireball !== undefined
  for (const ball of state.balls) drawBall(ctx, outfit.ball.look, ball, juice.trails.get(ball.id) ?? [], fire, time)

  drawParticles(ctx, juice)
  drawPopups(ctx, juice)
  ctx.restore()

  drawHud(ctx, state, juice, world)
  drawBanner(ctx, juice)
  if (juice.hurt > 0) {
    // A red pixel frame closing in.
    ctx.globalAlpha = 0.6 * juice.hurt
    const edge = Math.round((6 + 10 * juice.hurt) / PX) * PX
    rect(ctx, 0, 0, ARENA.width, edge, '#ef4444')
    rect(ctx, 0, ARENA.height - edge, ARENA.width, edge, '#ef4444')
    rect(ctx, 0, 0, edge, ARENA.height, '#ef4444')
    rect(ctx, ARENA.width - edge, 0, edge, ARENA.height, '#ef4444')
    ctx.globalAlpha = 1
  }
}

/** A world's scenery and its drifting sparkle, filling `width` × `height` (the arena by default). */
export function drawWorld(ctx: Ctx, world: World, time: number, width: number = ARENA.width, height: number = ARENA.height): void {
  // Cover the box with the scenery, cropped to the box's shape around the brick area.
  const scale = Math.max(width / SCENE_COLUMNS, height / SCENE_ROWS)
  const sw = width / scale
  const sh = height / scale
  const sx = (SCENE_COLUMNS - sw) / 2
  const sy = Math.min(SCENE_ROWS - sh, Math.max(0, 40 - sh / 4))
  blitPart(ctx, `scene|${world.scene}`, SCENE_COLUMNS, SCENE_ROWS, world.paint, { x: sx, y: sy, w: sw, h: sh }, { x: 0, y: 0, w: width, h: height })
  drawAmbient(ctx, world.ambient, time, width, height)
}

function drawParticles(ctx: Ctx, juice: Juice): void {
  for (const particle of juice.particles) {
    const t = particle.life / particle.maxLife
    ctx.globalAlpha = Math.min(1, t * 1.6)
    ctx.fillStyle = particle.colour
    if (particle.shape === 'ring') {
      // Eight pixels spreading out in a ring.
      const radius = particle.size * (2 - t) * 2
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4
        ctx.fillRect(Math.round((particle.x + Math.cos(angle) * radius) / PX) * PX, Math.round((particle.y + Math.sin(angle) * radius) / PX) * PX, PX, PX)
      }
    } else {
      const size = particle.shape === 'spark' ? PX : Math.max(PX, Math.round(particle.size / PX) * PX)
      ctx.fillRect(Math.round(particle.x / PX) * PX, Math.round(particle.y / PX) * PX, size, size)
    }
  }
  ctx.globalAlpha = 1
}

function drawPopups(ctx: Ctx, juice: Juice): void {
  for (const popup of juice.popups) {
    const t = popup.life / popup.maxLife
    const grow = t > 0.8 ? 1 + (t - 0.8) * 2 : 1
    ctx.globalAlpha = Math.min(1, t * 2)
    const scale = 1.6 * popup.size * grow
    // Kept inside the arena, even for a pop-up over a paddle at the wall.
    const half = textWidth(popup.text, scale) / 2 + 4
    const x = Math.min(ARENA.width - half, Math.max(half, popup.x))
    drawText(ctx, popup.text, x, popup.y, { scale, colour: popup.colour, align: 'center', shadow: SHADOW })
  }
  ctx.globalAlpha = 1
}

/** The band at the top: lives, level and score; under it the active power-ups and the combo. */
function drawHud(ctx: Ctx, state: BrickState, juice: Juice, world: World): void {
  rect(ctx, 0, 0, ARENA.width, ARENA.top, world.hud.band)
  rect(ctx, 0, ARENA.top - PX, ARENA.width, PX, world.hud.edge)

  // Lives: pixel hearts, and the number too.
  for (let i = 0; i < state.lives; i++) {
    ctx.save()
    ctx.translate(8 + i * 16, 14)
    ctx.scale(PX, PX)
    bitmap(ctx, ['.#.#.', '#####', '#####', '.###.', '..#..'], { '#': '#fb7185' })
    bitmap(ctx, ['.....', '.#...', '.....', '.....', '.....'], { '#': '#ffe4e6' })
    ctx.restore()
  }
  drawText(ctx, `X${state.lives}`, 10 + state.lives * 16, 20, { scale: 1.6, colour: '#fecdd3', shadow: SHADOW })

  drawText(ctx, `LEVEL ${state.level}`, ARENA.width / 2, 11, { scale: 1.2, colour: world.hud.edge, align: 'center', shadow: SHADOW })
  drawText(ctx, state.levelName, ARENA.width / 2, 27, { scale: 1.6, colour: '#ffffff', align: 'center', shadow: SHADOW })

  drawText(ctx, state.score.toLocaleString('en-US'), ARENA.width - 8, 20, { scale: 2.2, colour: '#fef08a', align: 'right', shadow: SHADOW })

  // Active power-ups: picture, name and time left, with a draining bar.
  let chipX = 6
  for (const kind of TIMED_POWER_UPS) {
    const left = state.effects[kind]
    if (left === undefined) continue
    const definition = POWER_UPS[kind]
    const label = `${definition.label} ${(left / 1000).toFixed(1)}`
    const icon = powerUpIcon(kind)
    const iconWidth = icon[0].length * 1.4
    const w = Math.ceil((textWidth(label, 1.2) + iconWidth + 14) / PX) * PX
    const top = ARENA.top + 4
    rect(ctx, chipX, top, w, 16, 'rgba(10,6,24,0.82)')
    rect(ctx, chipX, top, w, PX / 2, powerUpColour(kind))
    rect(ctx, chipX + 4, top + 13, (w - 8) * Math.min(1, left / (definition.durationMs ?? 1)), PX, powerUpColour(kind))
    ctx.save()
    ctx.translate(chipX + 4, top + 8 - (icon.length * 1.4) / 2 - 1)
    ctx.scale(1.4, 1.4)
    bitmap(ctx, icon, { '#': powerUpColour(kind), W: '#ffffff' })
    ctx.restore()
    drawText(ctx, label, chipX + 8 + iconWidth, top + 7, { scale: 1.2, colour: '#ffffff' })
    chipX += w + 4
  }

  if (state.combo >= 2) {
    const scale = 1 + juice.comboPulse * 0.25
    const multiplier = comboMultiplier(state.combo)
    const colour = multiplier >= 2.5 ? '#facc15' : '#f0abfc'
    drawText(ctx, `COMBO ${state.combo}`, ARENA.width - 52, ARENA.top + 13, { scale: 1.8 * scale, colour, align: 'center', outline: SHADOW })
    drawText(ctx, `X${multiplier.toFixed(1)}`, ARENA.width - 52, ARENA.top + 27, { scale: 1.4 * scale, colour, align: 'center', outline: SHADOW })
  }
}

function drawBanner(ctx: Ctx, juice: Juice): void {
  const banner = juice.banner
  if (!banner) return
  const t = banner.life / banner.maxLife
  const enter = Math.min(1, (1 - t) * 6)
  const grow = 0.6 + enter * 0.4
  ctx.globalAlpha = Math.min(1, t * 3)
  // As big as fits: long words get a smaller size rather than leaving the arena.
  const scale = Math.min(4.4, 360 / Math.max(1, textWidth(banner.text, 1))) * grow
  drawText(ctx, banner.text, ARENA.width / 2, 300, { scale, colour: banner.colour, align: 'center', outline: SHADOW })
  if (banner.detail) {
    const detailScale = Math.min(2.2, 340 / Math.max(1, textWidth(banner.detail, 1))) * grow
    drawText(ctx, banner.detail, ARENA.width / 2, 300 + scale * 5, { scale: detailScale, colour: '#ffffff', align: 'center', outline: SHADOW })
  }
  ctx.globalAlpha = 1
}

/** A skin on its own in a `width` × `height` box, for the skin picker and the shop. */
export function drawSkinPreview<Slot extends SkinSlot>(ctx: Ctx, slot: Slot, skin: SkinsBySlot[Slot], width: number, height: number, time: number): void {
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  ctx.save()
  if (slot === 'paddle') {
    const scale = width / 100
    ctx.scale(scale, scale)
    ctx.translate(0, -PADDLE.y + height / scale / 2 - PADDLE.height / 2)
    drawPaddle(ctx, (skin as SkinsBySlot['paddle']).look, 50, 84, { laser: false, magnet: false, squash: 0, muzzle: 0, time })
  } else if (slot === 'ball') {
    const scale = Math.min(width, height) / (BALL_RADIUS * 4.2)
    ctx.translate(width / 2, height / 2)
    ctx.scale(scale, scale)
    drawBall(ctx, (skin as SkinsBySlot['ball']).look, { x: 0, y: 0 }, [], false, time)
  } else {
    const look = (skin as SkinsBySlot['bricks']).look
    const scale = width / 96
    ctx.scale(scale, scale)
    const boxHeight = height / scale
    const kinds: Brick['kind'][] = ['normal', 'tough', 'armored', 'special']
    if (look.world === 'levels') {
      // The arcade's own theme: four of its level worlds, a brick in each.
      const half = boxHeight / 2
      ;[0, 2, 4, 7].forEach((index, i) => {
        const world = LEVEL_WORLDS[index]
        const left = (i % 2) * 48
        const top = Math.floor(i / 2) * half
        ctx.save()
        ctx.beginPath()
        ctx.rect(left, top, 48, half)
        ctx.clip()
        ctx.translate(left, top)
        drawWorld(ctx, world, time, 48, half)
        ctx.restore()
        const kind = kinds[i]
        const maxHp = kind === 'tough' ? 2 : kind === 'armored' ? 3 : 1
        const brick: Brick = { id: i, row: 0, col: i, x: left + 4, y: top + Math.round((half - 16) / 2), width: 40, height: 16, kind, hp: kind === 'armored' ? 2 : maxHp, maxHp }
        drawBrick(ctx, brick, world, 0, time)
      })
    } else {
      const world = worldOf(look, 1)
      drawWorld(ctx, world, time, 96, boxHeight)
      kinds.forEach((kind, i) => {
        const hp = kind === 'tough' ? 2 : kind === 'armored' ? 3 : 1
        const brick: Brick = { id: i, row: 0, col: i, x: 6 + (i % 2) * 44, y: 8 + Math.floor(i / 2) * 22, width: 40, height: 16, kind, hp: kind === 'armored' ? 2 : hp, maxHp: hp }
        drawBrick(ctx, brick, world, 0, time)
      })
    }
  }
  ctx.restore()
}
