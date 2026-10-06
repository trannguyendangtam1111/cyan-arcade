import type { PipeLook } from '../skins/skinTypes'

/**
 * Draws one pipe pair in the look given. What is drawn is exactly the engine's two collision
 * rectangles: the body fills each one, and every rim, roof, leaf and outline stays inside it
 * (outlines are drawn inset by half their width). So a pipe looks as wide as it is, no skin makes
 * the gap look bigger or smaller than it is, and the bird crashes exactly when it is seen to touch.
 */

type Ctx = CanvasRenderingContext2D

/** How tall a rim (the end of a pipe facing the gap) is. */
const RIM_HEIGHT = 24
/** Every outline's width; it is drawn half its width inside the shape it outlines. */
const OUTLINE = 3
const INSET = OUTLINE / 2

export interface PipeShape {
  x: number
  width: number
  gapTop: number
  gapBottom: number
  /** Where the lower pipe ends (the ground). */
  bottom: number
  /** The pipe's place in the course, so patterns differ a little from pipe to pipe. */
  id: number
}

export function drawPipePair(ctx: Ctx, look: PipeLook, pipe: PipeShape, time: number): void {
  // The upper pipe reaches above the screen; drawing from a little above the top is enough.
  drawPipe(ctx, look, pipe, -40, pipe.gapTop, 'down', time)
  drawPipe(ctx, look, pipe, pipe.gapBottom, pipe.bottom, 'up', time)
}

/** One pipe from `top` to `bottom`; `facing` is the side its end (towards the gap) is on. */
function drawPipe(ctx: Ctx, look: PipeLook, pipe: PipeShape, top: number, bottom: number, facing: 'up' | 'down', time: number): void {
  const { x, width } = pipe
  const height = bottom - top
  if (height <= 0) return

  ctx.save()
  if (look.glow) {
    ctx.shadowColor = look.glow
    ctx.shadowBlur = 14
  }
  ctx.fillStyle = look.body
  ctx.fillRect(x, top, width, height)
  ctx.shadowBlur = 0

  // Shading: a darker right side and a light left edge, so every pipe looks round.
  ctx.fillStyle = look.shade
  ctx.fillRect(x + width * 0.72, top, width * 0.28, height)

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, top, width, height)
  ctx.clip()
  drawPattern(ctx, look, pipe, top, bottom, time)
  ctx.restore()

  ctx.lineWidth = OUTLINE
  ctx.strokeStyle = look.outline
  ctx.strokeRect(x + INSET, top + INSET, width - OUTLINE, height - OUTLINE)

  const end = facing === 'up' ? top : bottom
  drawCap(ctx, look, x, width, end, facing, time)
  ctx.restore()
}

function drawPattern(ctx: Ctx, look: PipeLook, pipe: PipeShape, top: number, bottom: number, time: number): void {
  const { x, width } = pipe
  ctx.fillStyle = look.patternColor
  ctx.strokeStyle = look.patternColor
  switch (look.pattern) {
    case 'shine':
      ctx.globalAlpha = 0.7
      ctx.fillRect(x + 8, top, 6, bottom - top)
      ctx.fillRect(x + 18, top, 3, bottom - top)
      break
    case 'stripes':
      ctx.lineWidth = 9
      for (let y = top - width; y < bottom + width; y += 26) {
        ctx.beginPath()
        ctx.moveTo(x - 4, y)
        ctx.lineTo(x + width + 4, y + width * 0.6)
        ctx.stroke()
      }
      break
    case 'puffs':
      for (let y = Math.floor(top / 22) * 22, i = 0; y < bottom; y += 22, i++) {
        ctx.fillStyle = i % 2 === 0 ? look.patternColor : look.shade
        roundRect(ctx, x + 3, y + 2, width - 6, 18, 8)
        ctx.fill()
      }
      break
    case 'seeds':
      for (let y = Math.floor(top / 18) * 18, row = 0; y < bottom; y += 18, row++) {
        for (let sx = x + (row % 2 === 0 ? 9 : 18); sx < x + width - 4; sx += 18) {
          ctx.beginPath()
          ctx.ellipse(sx, y, 1.8, 3, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    case 'petals':
      for (let y = Math.floor(top / 34) * 34, row = 0; y < bottom; y += 34, row++) {
        flower(ctx, x + (row % 2 === 0 ? 18 : 46), y + 12, 4, look.patternColor)
      }
      break
    case 'energy': {
      const pulse = 0.55 + Math.sin(time * 6 + pipe.id) * 0.35
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.shadowColor = look.patternColor
      ctx.shadowBlur = 10
      ctx.lineWidth = 3
      for (const offset of [0.3, 0.5, 0.7]) {
        ctx.beginPath()
        ctx.moveTo(x + width * offset, top)
        ctx.lineTo(x + width * offset, bottom)
        ctx.stroke()
      }
      ctx.restore()
      break
    }
    case 'stars':
      for (let y = Math.floor(top / 30) * 30, row = 0; y < bottom; y += 30, row++) {
        const twinkle = 0.5 + Math.sin(time * 4 + row + pipe.id) * 0.5
        ctx.globalAlpha = 0.4 + twinkle * 0.6
        sparkle(ctx, x + (row % 2 === 0 ? 20 : 48), y + 10, 4 + twinkle * 2)
        ctx.fill()
      }
      break
    case 'bricks':
      ctx.lineWidth = 2
      for (let y = Math.floor(top / 16) * 16, row = 0; y < bottom; y += 16, row++) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + width, y)
        for (let bx = x + (row % 2 === 0 ? 0 : 17); bx < x + width; bx += 34) {
          ctx.moveTo(bx, y)
          ctx.lineTo(bx, y + 16)
        }
        ctx.stroke()
      }
      break
    case 'facets':
      ctx.globalAlpha = 0.6
      for (let y = Math.floor(top / 40) * 40; y < bottom; y += 40) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + width * 0.55, y + 20)
        ctx.lineTo(x, y + 40)
        ctx.closePath()
        ctx.fill()
      }
      break
    case 'scales':
      ctx.lineWidth = 2
      for (let y = Math.floor(top / 12) * 12, row = 0; y < bottom; y += 12, row++) {
        for (let sx = x + (row % 2 === 0 ? 0 : 7); sx < x + width + 7; sx += 14) {
          ctx.beginPath()
          ctx.arc(sx, y, 7, 0, Math.PI)
          ctx.stroke()
        }
      }
      break
    case 'circuit':
      ctx.save()
      ctx.shadowColor = look.patternColor
      ctx.shadowBlur = 6
      ctx.lineWidth = 2
      for (let y = Math.floor(top / 48) * 48, row = 0; y < bottom; y += 48, row++) {
        const left = row % 2 === 0
        ctx.beginPath()
        ctx.moveTo(x + (left ? 10 : width - 14), y)
        ctx.lineTo(x + (left ? 10 : width - 14), y + 20)
        ctx.lineTo(x + (left ? 34 : width - 38), y + 32)
        ctx.lineTo(x + (left ? 34 : width - 38), y + 48)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x + (left ? 10 : width - 14), y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      break
    case 'grid':
      ctx.save()
      ctx.globalAlpha = 0.75
      ctx.shadowColor = look.patternColor
      ctx.shadowBlur = 6
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let y = Math.floor(top / 20) * 20; y < bottom; y += 20) {
        ctx.moveTo(x, y)
        ctx.lineTo(x + width, y)
      }
      for (let gx = x + 14; gx < x + width; gx += 20) {
        ctx.moveTo(gx, top)
        ctx.lineTo(gx, bottom)
      }
      ctx.stroke()
      ctx.restore()
      break
  }
  ctx.globalAlpha = 1
}

/**
 * The end of a pipe, at `end` (the gap's edge), drawn towards the pipe's own side: `facing` up means
 * the pipe is below the gap.
 */
function drawCap(ctx: Ctx, look: PipeLook, x: number, width: number, end: number, facing: 'up' | 'down', time: number): void {
  // `into` is +1 when "into the pipe" is downwards (a lower pipe), −1 for an upper pipe.
  const into = facing === 'up' ? 1 : -1
  // The cap's own geometry, inset so that its outline's outer edge is the pipe's edge.
  const edge = end + into * INSET
  const left = x + INSET
  const capWidth = width - OUTLINE
  const capTop = into === 1 ? edge : end - RIM_HEIGHT
  const capHeight = RIM_HEIGHT - INSET
  const base = end + into * RIM_HEIGHT
  ctx.lineWidth = OUTLINE
  ctx.strokeStyle = look.outline

  switch (look.capStyle) {
    case 'rim':
    case 'tech':
    case 'ring': {
      ctx.save()
      if (look.capStyle === 'ring' && look.glow) {
        ctx.shadowColor = look.glow
        ctx.shadowBlur = 12 + Math.sin(time * 5) * 4
      }
      ctx.fillStyle = look.cap
      roundRect(ctx, left, capTop, capWidth, capHeight, 5)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = look.capShade
      ctx.fillRect(left + capWidth * 0.72, capTop + 2, capWidth * 0.26, capHeight - 4)
      roundRect(ctx, left, capTop, capWidth, capHeight, 5)
      ctx.stroke()
      if (look.capStyle === 'tech') {
        ctx.fillStyle = look.patternColor
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 4 + i * 2)
          ctx.beginPath()
          ctx.arc(left + 14 + i * 12, capTop + capHeight / 2, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      break
    }
    case 'round':
      ctx.fillStyle = look.cap
      roundRect(ctx, left, capTop, capWidth, capHeight, RIM_HEIGHT / 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      roundRect(ctx, left + 8, capTop + 5, capWidth * 0.4, 5, 2.5)
      ctx.fill()
      break
    case 'leafy': {
      // A crown of leaves along the end of the pipe.
      ctx.fillStyle = look.cap
      ctx.beginPath()
      ctx.moveTo(left, base)
      const leaves = 5
      for (let i = 0; i <= leaves; i++) {
        const lx = left + (capWidth * i) / leaves
        ctx.lineTo(lx, edge)
        if (i < leaves) ctx.lineTo(lx + capWidth / leaves / 2, edge + into * 10)
      }
      ctx.lineTo(left + capWidth, base)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'roof': {
      // A curved little roof, as wide as the tower.
      ctx.fillStyle = look.cap
      ctx.beginPath()
      ctx.moveTo(left, edge)
      ctx.quadraticCurveTo(left + capWidth / 2, edge + into * 8, left + capWidth, edge)
      ctx.lineTo(left + capWidth, base)
      ctx.lineTo(left, base)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = look.capShade
      ctx.fillRect(x + 4, base - (into === 1 ? 6 : 0), width - 8, 6)
      break
    }
    case 'spire': {
      // Faceted crystal points, inside the pipe's side of the gap.
      ctx.fillStyle = look.cap
      ctx.beginPath()
      ctx.moveTo(left, base)
      ctx.lineTo(left, edge + into * 8)
      ctx.lineTo(left + capWidth * 0.25, edge)
      ctx.lineTo(left + capWidth * 0.5, edge + into * 6)
      ctx.lineTo(left + capWidth * 0.75, edge)
      ctx.lineTo(left + capWidth, edge + into * 8)
      ctx.lineTo(left + capWidth, base)
      ctx.closePath()
      ctx.save()
      if (look.glow) {
        ctx.shadowColor = look.glow
        ctx.shadowBlur = 10
      }
      ctx.fill()
      ctx.restore()
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.beginPath()
      ctx.moveTo(left + capWidth * 0.25, edge + into * 3)
      ctx.lineTo(left + capWidth * 0.36, edge + into * 16)
      ctx.lineTo(left + capWidth * 0.18, edge + into * 16)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'battlement': {
      ctx.fillStyle = look.cap
      ctx.fillRect(left, capTop, capWidth, capHeight)
      // Embrasures, painted in (the stone is still solid there, like the pipe's box).
      ctx.fillStyle = look.capShade
      const notch = capWidth / 5
      for (let i = 1; i < 5; i += 2) {
        ctx.fillRect(left + notch * i, into === 1 ? edge : edge - 9, notch, 9)
      }
      ctx.strokeRect(left, capTop, capWidth, capHeight)
      break
    }
    case 'horns': {
      ctx.fillStyle = look.cap
      roundRect(ctx, left, capTop, capWidth, capHeight, 4)
      ctx.fill()
      ctx.stroke()
      // Horns growing from the back of the cap along the pipe, inside its sides.
      ctx.fillStyle = '#fef3c7'
      for (const side of [-1, 1]) {
        const inner = side === -1 ? left + 16 : left + capWidth - 16
        const outer = side === -1 ? left + 2 : left + capWidth - 2
        ctx.beginPath()
        ctx.moveTo(inner, base)
        ctx.quadraticCurveTo(outer, base + into * 2, outer, base + into * 18)
        ctx.quadraticCurveTo(inner - side * 4, base + into * 6, inner - side * 8, base)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      break
    }
  }
}

export function roundRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function flower(ctx: Ctx, cx: number, cy: number, size: number, color: string): void {
  ctx.fillStyle = color
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5
    ctx.beginPath()
    ctx.ellipse(cx + Math.cos(angle) * size, cy + Math.sin(angle) * size, size, size * 0.65, angle, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2)
  ctx.fill()
}

/** A four-pointed sparkle, as a path. */
export function sparkle(ctx: Ctx, cx: number, cy: number, size: number): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy - size)
  ctx.quadraticCurveTo(cx, cy, cx + size, cy)
  ctx.quadraticCurveTo(cx, cy, cx, cy + size)
  ctx.quadraticCurveTo(cx, cy, cx - size, cy)
  ctx.quadraticCurveTo(cx, cy, cx, cy - size)
  ctx.closePath()
}
