import type { Brick } from '../types/brickTypes'
import { bitmap, blit, PX, rect } from './pixel'
import type { Motif, World } from './worlds'

/**
 * Bricks, as pixel art in a world's colours, drawn exactly over the rectangle the engine bounces off.
 * Their toughness shows in their shape as well as their colour, in every world: a tough brick has a
 * thick double frame, an armored one a riveted plate, a special one a sparkling frame and a star;
 * every brick that takes more than one hit shows its hits left as pips, and a damaged one is cracked.
 */

type Ctx = CanvasRenderingContext2D

const INK = '#1b1020'

/** The little pictures on brick faces (5 × 4 art pixels): `L` is the brick's light colour, `W` white, `Y` gold. */
const MOTIFS: Record<Motif, readonly string[]> = {
  blossom: ['.L.L.', 'LLYLL', '.LLL.', '.L.L.'],
  wrapper: ['L..L.', '.L..L', 'L..L.', '.L..L'],
  heart: ['.L.L.', 'LLLLL', '.LLL.', '..L..'],
  gem: ['.LWL.', 'LWLLL', '.LLL.', '..L..'],
  knot: ['L...L', '.LYL.', '.LYL.', 'L...L'],
  circuit: ['L....', 'LLL.L', '..LLL', '....L'],
  scale: ['L.L.L', '.L.L.', 'L.L.L', '.L.L.'],
  crescent: ['.LL..', 'L...W', 'L....', '.LL..'],
  gloss: ['WW...', 'W....', '.....', '.....'],
}

const STAR = ['..W..', '.WWW.', 'WWWWW', '.WWW.', '.W.W.']

/**
 * @param flash how much of a just-hit flash is left, 0 to 1: the brick lights up and bulges a little
 * @param beacon whether it is one of the last few bricks, which glow so they are easy to find
 */
export function drawBrick(ctx: Ctx, brick: Brick, world: World, flash: number, time: number, beacon = false): void {
  const { x, y, width: w, height: h } = brick
  const columns = Math.round(w / PX)
  const rows = Math.round(h / PX)
  ctx.save()
  // A hit squashes the brick a touch around its centre.
  const squash = 1 + flash * 0.1
  ctx.translate(x + w / 2, y + h / 2)
  ctx.scale(squash, 2 - squash)
  ctx.translate(-w / 2, -h / 2)

  if (beacon) {
    // A pixel halo, pulsing.
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * 7)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(-PX * 2, -PX * 2, w + PX * 4, PX)
    ctx.fillRect(-PX * 2, h + PX, w + PX * 4, PX)
    ctx.fillRect(-PX * 2, -PX, PX, h + PX * 2)
    ctx.fillRect(w + PX, -PX, PX, h + PX * 2)
    ctx.globalAlpha = 1
  }
  const glow = world.bricks.neon || beacon
  if (glow) {
    ctx.shadowColor = beacon ? '#ffffff' : world.bricks[brick.kind].fill
    ctx.shadowBlur = beacon ? 12 : 7
  }
  const variant = brick.id % 4
  const key = `brick|${world.id}|${brick.kind}|${brick.hp}|${brick.maxHp}|${variant}|${columns}x${rows}`
  blit(ctx, key, 0, 0, columns, rows, PX, (g) => paintBrick(g, brick, world, columns, rows, variant))
  ctx.shadowBlur = 0

  if (brick.kind === 'special') {
    // Two twinkling pixels on the frame.
    const twinkle = Math.floor(time * 6 + brick.id) % 6
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.9
    ctx.fillRect(PX * (2 + twinkle * 2), 0, PX, PX)
    ctx.fillRect(w - PX * (3 + twinkle * 2), h - PX, PX, PX)
    ctx.globalAlpha = 1
  }
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.85
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(PX, 0, w - PX * 2, h)
    ctx.fillRect(0, PX, w, h - PX * 2)
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

/** One brick's picture, in art pixels: `columns` × `rows` (18 × 8 at the engine's brick size). */
function paintBrick(g: Ctx, brick: Brick, world: World, columns: number, rows: number, variant: number): void {
  const colours = world.bricks[brick.kind]
  const outline = world.bricks.outline
  const W = columns
  const H = rows
  const neon = world.bricks.neon === true

  // The body, with its corners cut round, and a pixel bevel.
  const frame = brick.kind === 'special' ? colours.shade : neon ? colours.fill : outline
  rect(g, 1, 0, W - 2, H, frame)
  rect(g, 0, 1, W, H - 2, frame)
  rect(g, 1, 1, W - 2, H - 2, neon ? '#0b1026' : colours.fill)
  if (!neon) {
    rect(g, 1, 1, W - 2, 1, colours.light)
    rect(g, 1, 1, 1, H - 3, colours.light)
    rect(g, 1, H - 2, W - 2, 1, colours.shade)
    rect(g, W - 2, 2, 1, H - 3, colours.shade)
  } else {
    rect(g, 2, 1, W - 4, 1, 'rgba(255,255,255,0.18)')
  }

  const motifAt = (rowsOf: readonly string[], top: number) =>
    bitmap(g, rowsOf, { L: neon ? colours.fill : colours.light, W: '#ffffff', Y: '#fde047' }, Math.floor((W - 5) / 2), top)

  switch (brick.kind) {
    case 'normal':
      motifAt(MOTIFS[world.bricks.motif], 2)
      break
    case 'tough': {
      // A second, inner frame: thick and dark, unmistakable next to a plain brick.
      const inner = neon ? colours.light : outline
      const broken = brick.hp < brick.maxHp
      rect(g, 2, 2, W - 4, 1, inner)
      rect(g, 2, H - 3, W - 4, 1, inner)
      rect(g, 2, 2, 1, H - 4, inner)
      rect(g, W - 3, 2, 1, H - 4, inner)
      if (broken) {
        // A chunk of the inner frame knocked out.
        rect(g, 4 + variant * 2, 2, 3, 1, colours.fill)
        rect(g, W - 3, 3, 1, 2, colours.fill)
      }
      motifAt(MOTIFS[world.bricks.motif].slice(1, 3), 3)
      break
    }
    case 'armored': {
      // A riveted plate.
      const rivet = neon ? colours.fill : colours.light
      rect(g, 4, 3, W - 8, 2, colours.shade)
      rect(g, 4, 3, W - 8, 1, neon ? colours.shade : colours.light)
      for (const [rx, ry] of [
        [2, 2],
        [W - 3, 2],
        [2, H - 3],
        [W - 3, H - 3],
      ]) {
        rect(g, rx, ry, 1, 1, rivet)
      }
      break
    }
    case 'special': {
      // A sparkling gold-and-white frame and a star: it always drops a power-up.
      for (let i = 1; i < W - 1; i += 2) {
        rect(g, i, 0, 1, 1, '#ffffff')
        rect(g, W - 1 - i, H - 1, 1, 1, '#ffffff')
      }
      bitmap(g, STAR, { W: '#ffffff' }, Math.floor((W - 5) / 2), Math.max(1, Math.floor((H - 5) / 2)))
      break
    }
  }

  // Pips: one per hit left, along the bottom right.
  if (brick.maxHp > 1) {
    for (let i = 0; i < brick.hp; i++) {
      rect(g, W - 4 - i * 2, H - 2, 1, 1, '#ffffff')
    }
  }

  // Cracks for damage taken, the same on the same brick every time.
  const damage = brick.maxHp - brick.hp
  if (damage > 0) {
    const crack = (at: number) => {
      rect(g, at, 1, 1, 2, INK)
      rect(g, at + 1, 3, 1, 1, INK)
      rect(g, at, 4, 1, 1, INK)
      rect(g, at + 1, 5, 1, H - 6, INK)
    }
    crack(3 + ((brick.id * 5) % 6))
    if (damage >= 2) {
      crack(10 + ((brick.id * 3) % 4))
      rect(g, 6, 3, 4, 1, INK)
    }
  }
}
