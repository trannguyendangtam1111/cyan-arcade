import { bitmap, blit, blitPart, drawText, hash, rect } from '@/games/shared/pixel/pixel'
import { drawAmbient, SCENE_COLUMNS, SCENE_ROWS, SCENERY, type Scenery, type SceneryId } from '@/games/shared/pixel/scenery'
import { atTopSpeed, obstacleMask, onGround, runnerMask } from '../engine/dinoEngine'
import { RUNNER_X, WORLD } from '../engine/physics'
import { PX, type Mask } from '../engine/shapes'
import { JOURNEY_LEG, obstacleColours, sceneryAt, TERRAIN, type Outfit, type Palette, type SkinSlot } from '../skins'
import type { DinoState } from '../types/dinoTypes'

/**
 * Draws a run. Pictures only: it reads the state and never changes it, and its little extras (dust,
 * sparkle, the drifting ambient) come from the clock and a fixed hash, never from the course's seed,
 * so nothing drawn can change a run.
 *
 * The backdrop is one of the arcade's shared pixel worlds, cut to a landscape band and laid side by
 * side, every other copy mirrored so the seams meet, scrolling slower than the ground. Which
 * world it is depends on the score alone (the journey), never on a skin or on who is playing. Pip and
 * the obstacles are their collision shapes painted in the worn colours: what is drawn is what collides.
 */

type Ctx = CanvasRenderingContext2D

/** The scenery's ground line, in its art rows: the band above it becomes the sky. */
const SCENERY_GROUND_ROW = 288
const SKY_ROWS = WORLD.groundY / PX
const TILE_WIDTH = SCENE_COLUMNS * PX
/** The backdrop moves at this fraction of the ground's speed. */
const PARALLAX = 0.2

export interface SceneOptions {
  /** Seconds, for the drifting sparkle and the dust. */
  time: number
  /** The best score to show, if any. */
  best: number
  /** No drifting sparkle or wobble. */
  reducedMotion: boolean
}

export function drawScene(ctx: Ctx, state: Readonly<DinoState>, outfit: Outfit, options: SceneOptions): void {
  // The world follows the score alone: the same journey for players and the AI.
  const sceneryId = sceneryAt(state.score)
  const scenery = SCENERY[sceneryId]
  drawBackdrop(ctx, scenery, state.distance)
  if (!options.reducedMotion) drawAmbient(ctx, scenery.ambient, options.time, WORLD.width, WORLD.groundY)
  drawGround(ctx, sceneryId, state.distance)

  const colours = obstacleColours(outfit.obstacles, sceneryId)
  for (const obstacle of state.obstacles) {
    if (obstacle.x > WORLD.width || obstacle.x < -80) continue
    const mask = obstacleMask(obstacle)
    drawShape(ctx, mask, colours[obstacle.kind], `${outfit.obstacles.id}-${sceneryId}`, obstacle.x, WORLD.groundY - obstacle.lift - mask.height)
  }

  drawRunner(ctx, state, outfit, options)
  drawHud(ctx, state, options.best, scenery, options.reducedMotion)
}

/** A shape in a palette, its top-left at (x, y), from a cached picture. */
export function drawShape(ctx: Ctx, mask: Mask, palette: Palette, paletteKey: string, x: number, y: number): void {
  blit(ctx, `dino|${paletteKey}|${mask.name}`, Math.round(x), Math.round(y), mask.columns, mask.rows.length, PX, (g) => bitmap(g, mask.rows, palette))
}

function drawBackdrop(ctx: Ctx, scenery: Scenery, distance: number): void {
  const source = { x: 0, y: SCENERY_GROUND_ROW - SKY_ROWS, w: SCENE_COLUMNS, h: SKY_ROWS }
  const offset = (distance * PARALLAX) % (TILE_WIDTH * 2)
  for (let tile = 0; tile * TILE_WIDTH - offset < WORLD.width; tile++) {
    const x = Math.round(tile * TILE_WIDTH - offset)
    if (x + TILE_WIDTH < 0) continue
    ctx.save()
    if (tile % 2 === 1) {
      // Mirrored, so each copy's edge meets the same edge of its neighbour.
      ctx.translate(x + TILE_WIDTH, 0)
      ctx.scale(-1, 1)
      blitPart(ctx, `scene|${scenery.id}`, SCENE_COLUMNS, SCENE_ROWS, scenery.paint, source, { x: 0, y: 0, w: TILE_WIDTH, h: WORLD.groundY })
    } else {
      blitPart(ctx, `scene|${scenery.id}`, SCENE_COLUMNS, SCENE_ROWS, scenery.paint, source, { x, y: 0, w: TILE_WIDTH, h: WORLD.groundY })
    }
    ctx.restore()
  }
}

function drawGround(ctx: Ctx, scenery: SceneryId, distance: number): void {
  const { ground } = TERRAIN[scenery]
  const top = WORLD.groundY
  rect(ctx, 0, top, WORLD.width, WORLD.height - top, ground.soil)
  rect(ctx, 0, top, WORLD.width, PX * 3, ground.top)
  rect(ctx, 0, top, WORLD.width, PX, ground.edge)
  // Specks in the soil move with the ground: they are what shows the speed.
  const shift = distance % 64
  for (let i = 0; i < 24; i++) {
    const x = Math.round((((i * 53 + hash(i) * 40 - shift) % (WORLD.width + 64)) + WORLD.width + 64) % (WORLD.width + 64)) - 32
    const y = top + PX * 5 + Math.floor(hash(i * 3.1) * 16) * PX
    rect(ctx, x - (x % PX), y, PX * (1 + (i % 2)), PX, ground.speck)
  }
}

function drawRunner(ctx: Ctx, state: Readonly<DinoState>, outfit: Outfit, options: SceneOptions): void {
  const mask = runnerMask(state)
  const y = WORLD.groundY - state.runner.lift - mask.height
  // A little dust behind the feet while running on the ground.
  if (state.status === 'running' && onGround(state) && !options.reducedMotion) {
    const puff = Math.floor(state.distance / 18) % 3
    ctx.globalAlpha = 0.55
    rect(ctx, RUNNER_X - PX * (2 + puff), WORLD.groundY - PX * (1 + (puff % 2)), PX * 2, PX, TERRAIN[sceneryAt(state.score)].ground.edge)
    ctx.globalAlpha = 1
  }
  drawShape(ctx, mask, outfit.runner.palette, outfit.runner.id, RUNNER_X, y)
  if (state.status === 'over') {
    // Seeing stars.
    for (let i = 0; i < 3; i++) {
      const angle = options.time * 4 + (i * Math.PI * 2) / 3
      const sx = RUNNER_X + 20 + Math.cos(angle) * 12
      const sy = y - 6 + Math.sin(angle) * 4
      rect(ctx, Math.round(sx), Math.round(sy), PX, PX, '#fde047')
    }
  }
}

function drawHud(ctx: Ctx, state: Readonly<DinoState>, best: number, scenery: Scenery, reducedMotion: boolean): void {
  const pad = (value: number) => String(Math.min(value, 99999)).padStart(5, '0')
  const style = { scale: 2, colour: '#ffffff', shadow: 'rgba(15,23,42,0.7)', align: 'right' as const }
  drawText(ctx, pad(state.score), WORLD.width - 12, 16, style)
  if (best > 0) drawText(ctx, `HI ${pad(best)}`, WORLD.width - 90, 16, { ...style, colour: '#e2e8f0' })
  if (atTopSpeed(state) && state.status === 'running') drawText(ctx, 'TOP SPEED', 12, 16, { ...style, align: 'left', colour: '#fde047' })
  // The world's name as a new one comes into view on the journey.
  const intoLeg = state.score % JOURNEY_LEG
  if (state.status === 'running' && state.score >= JOURNEY_LEG && intoLeg < 60) {
    if (!reducedMotion) ctx.globalAlpha = Math.min(1, (60 - intoLeg) / 30)
    drawText(ctx, scenery.name, WORLD.width / 2, 60, { scale: 3, colour: '#ffffff', outline: 'rgba(15,23,42,0.75)', align: 'center' })
    ctx.globalAlpha = 1
  }
}

/** A still picture of one skin, for the shop and the skin picker, `width` × `height` CSS pixels. */
export function drawSkinPreview(ctx: Ctx, slot: SkinSlot, look: Outfit[SkinSlot], width: number, height: number): void {
  ctx.save()
  const scale = height / 64
  ctx.scale(scale, scale)
  const w = width / scale
  rect(ctx, 0, 0, w, 64, '#e6f6fa')
  rect(ctx, 0, 54, w, 10, '#99f6e4')
  if (slot === 'runner') {
    const runner = look as Outfit['runner']
    drawShape(ctx, RUN_PREVIEW, runner.palette, runner.id, (w - RUN_PREVIEW.width) / 2, 54 - RUN_PREVIEW.height)
  } else {
    const colours = obstacleColours(look as Outfit['obstacles'], 'sakura')
    const key = `${look.id}-sakura`
    drawShape(ctx, MOUND_PREVIEW, colours.mound, key, w / 2 - MOUND_PREVIEW.width - 2, 54 - MOUND_PREVIEW.height)
    drawShape(ctx, BAT_PREVIEW, colours.bat, key, w / 2 + 2, 6)
  }
  ctx.restore()
}

// The preview pictures are the game's own shapes.
const RUN_PREVIEW = runnerMask({ status: 'ready', runner: { lift: 0, vy: 0, ducking: false }, distance: 0 } as DinoState)
const MOUND_PREVIEW = obstacleMask({ id: 0, kind: 'mound', x: 0, lift: 0, count: 1, age: 0, passed: false })
const BAT_PREVIEW = obstacleMask({ id: 0, kind: 'bat', x: 0, lift: 0, count: 1, age: 0, passed: false })
