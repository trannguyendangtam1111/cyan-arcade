import type { SkyLook } from '../skins/skinTypes'
import { sparkle } from './drawPipes'

/**
 * The background and the ground, in the sky theme given. The scenery scrolls slower than the pipes
 * (parallax) and the ground's stripes scroll with them, so the world feels like it is moving.
 */

type Ctx = CanvasRenderingContext2D

export interface SkyFrame {
  width: number
  height: number
  groundY: number
  /** How far the world has scrolled. */
  distance: number
  time: number
}

/** A repeatable pseudo-random number in [0, 1) for a whole number: scenery that stays put. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function drawSky(ctx: Ctx, look: SkyLook, frame: SkyFrame): void {
  const { width, groundY } = frame
  const gradient = ctx.createLinearGradient(0, 0, 0, groundY)
  gradient.addColorStop(0, look.top)
  gradient.addColorStop(1, look.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, groundY)

  if (look.orb) {
    ctx.save()
    ctx.shadowColor = look.orb.glow
    ctx.shadowBlur = 40
    ctx.fillStyle = look.orb.color
    ctx.beginPath()
    ctx.arc(width - 74, 92, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  drawAmbient(ctx, look, frame)
  drawScenery(ctx, look, frame)
}

export function drawGround(ctx: Ctx, look: SkyLook, frame: SkyFrame): void {
  const { width, height, groundY, distance } = frame
  ctx.fillStyle = look.ground
  ctx.fillRect(0, groundY, width, height - groundY)
  ctx.fillStyle = look.groundShade
  const offset = distance % 28
  for (let x = -offset - 28; x < width + 28; x += 28) {
    ctx.beginPath()
    ctx.moveTo(x, groundY + 14)
    ctx.lineTo(x + 14, groundY + 14)
    ctx.lineTo(x + 4, height)
    ctx.lineTo(x - 10, height)
    ctx.closePath()
    ctx.globalAlpha = 0.35
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = look.groundTop
  ctx.fillRect(0, groundY, width, 12)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fillRect(0, groundY + 12, width, 3)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  ctx.lineTo(width, groundY)
  ctx.stroke()
}

function drawAmbient(ctx: Ctx, look: SkyLook, frame: SkyFrame): void {
  const { width, groundY, distance, time } = frame
  ctx.fillStyle = look.ambientColor
  switch (look.ambient) {
    case 'clouds':
    case 'candy-clouds': {
      const span = width + 160
      for (let i = 0; i < 5; i++) {
        const x = ((hash(i) * span - distance * (0.12 + hash(i + 9) * 0.08)) % span + span) % span - 80
        const y = 40 + hash(i + 3) * (groundY * 0.45)
        const size = 16 + hash(i + 5) * 14
        ctx.globalAlpha = look.ambient === 'clouds' ? 0.85 : 0.95
        cloud(ctx, x, y, size)
        if (look.ambient === 'candy-clouds') {
          ctx.fillStyle = '#f9a8d4'
          ctx.globalAlpha = 0.5
          ctx.beginPath()
          ctx.arc(x + size * 0.4, y + size * 0.15, size * 0.45, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = look.ambientColor
        }
      }
      ctx.globalAlpha = 1
      break
    }
    case 'stars':
      for (let i = 0; i < 46; i++) {
        const x = ((hash(i) * width - distance * 0.03) % width + width) % width
        const y = hash(i + 50) * groundY * 0.8
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(time * (1 + hash(i + 7) * 2) + i))
        ctx.globalAlpha = twinkle
        if (i % 9 === 0) {
          sparkle(ctx, x, y, 4)
          ctx.fill()
        } else {
          ctx.fillRect(x, y, 2, 2)
        }
      }
      ctx.globalAlpha = 1
      break
    case 'petals':
      for (let i = 0; i < 18; i++) {
        const fall = (time * (18 + hash(i) * 20) + hash(i + 2) * groundY) % groundY
        const x = ((hash(i + 4) * width + Math.sin(time + i) * 20 - distance * 0.2) % width + width) % width
        ctx.save()
        ctx.translate(x, fall)
        ctx.rotate(time * 2 + i)
        ctx.globalAlpha = 0.75
        ctx.beginPath()
        ctx.ellipse(0, 0, 4.5, 2.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      break
  }
}

function drawScenery(ctx: Ctx, look: SkyLook, frame: SkyFrame): void {
  const { width, groundY, distance } = frame
  const scroll = distance * 0.35
  switch (look.scenery) {
    case 'hills':
    case 'dunes':
    case 'candy-hills': {
      for (const [layer, color, amplitude, base, frequency] of [
        [0, look.sceneryShade, 26, groundY - 70, 0.012],
        [1, look.sceneryColor, 20, groundY - 38, 0.018],
      ] as const) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(0, groundY)
        const shift = scroll * (layer === 0 ? 0.6 : 1)
        for (let x = 0; x <= width; x += 8) {
          const wave = look.scenery === 'dunes' ? Math.abs(Math.sin((x + shift) * frequency)) : Math.sin((x + shift) * frequency)
          ctx.lineTo(x, base - wave * amplitude)
        }
        ctx.lineTo(width, groundY)
        ctx.closePath()
        ctx.fill()
      }
      if (look.scenery === 'candy-hills') {
        // Lollipops on the hills.
        const spacing = 130
        for (let i = Math.floor(scroll / spacing) - 1; i < (scroll + width) / spacing + 1; i++) {
          const x = i * spacing - scroll + hash(i) * 40
          const y = groundY - 52
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x, groundY - 20)
          ctx.stroke()
          ctx.fillStyle = hash(i + 1) > 0.5 ? '#f472b6' : '#a78bfa'
          ctx.beginPath()
          ctx.arc(x, y, 11, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, 6, 0, Math.PI * 1.5)
          ctx.stroke()
        }
      }
      break
    }
    case 'blossom-trees': {
      const spacing = 110
      for (let i = Math.floor(scroll / spacing) - 1; i < (scroll + width) / spacing + 1; i++) {
        const x = i * spacing - scroll + hash(i) * 30
        const size = 26 + hash(i + 3) * 14
        ctx.fillStyle = look.sceneryShade
        ctx.fillRect(x - 3, groundY - size - 10, 6, size + 10)
        ctx.fillStyle = look.sceneryColor
        for (const [dx, dy, r] of [
          [0, -size - 16, size * 0.6],
          [-size * 0.45, -size - 4, size * 0.45],
          [size * 0.45, -size - 4, size * 0.45],
        ] as const) {
          ctx.beginPath()
          ctx.arc(x + dx, groundY + dy, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }
    case 'city': {
      const spacing = 46
      for (let i = Math.floor(scroll / spacing) - 1; i < (scroll + width) / spacing + 1; i++) {
        const x = i * spacing - scroll
        const tall = 50 + hash(i) * 120
        ctx.fillStyle = look.sceneryColor
        ctx.fillRect(x, groundY - tall, spacing - 6, tall)
        // Lit windows, the same ones on the same building every time.
        ctx.fillStyle = look.sceneryShade
        for (let wy = groundY - tall + 8; wy < groundY - 10; wy += 14) {
          for (let wx = x + 6; wx < x + spacing - 12; wx += 10) {
            if (hash(i * 31 + wx * 7 + wy) > 0.55) ctx.fillRect(wx, wy, 4, 6)
          }
        }
      }
      break
    }
    case 'planet': {
      const x = width - 110 - ((distance * 0.04) % (width + 300)) + 150
      ctx.save()
      ctx.fillStyle = look.sceneryColor
      ctx.shadowColor = look.sceneryColor
      ctx.shadowBlur = 30
      ctx.beginPath()
      ctx.arc(x, 150, 44, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = look.sceneryShade
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.ellipse(x, 150, 72, 15, -0.3, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.arc(x - 120, 260, 9, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
}

function cloud(ctx: Ctx, x: number, y: number, size: number): void {
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.arc(x + size * 0.9, y + size * 0.15, size * 0.75, 0, Math.PI * 2)
  ctx.arc(x - size * 0.9, y + size * 0.2, size * 0.7, 0, Math.PI * 2)
  ctx.arc(x + size * 0.2, y + size * 0.45, size * 0.8, 0, Math.PI * 2)
  ctx.fill()
}
