import { PADDLE } from '../engine/arena'
import { POWER_UPS } from '../engine/powerUps'
import { comboMultiplier } from '../engine/scoring'
import { worldOf } from '../render/worlds'
import type { Outfit } from '../skins'
import type { BrickEvent, BrickState, PowerUpKind } from '../types/brickTypes'

/**
 * Game feel: particles, flashes, score pop-ups, screen shake and banners, made from what the engine
 * reports happened (its events). Purely visual: nothing here ever changes the game, and the engine
 * never sees it. It uses ordinary randomness for sparks, which is fine for pictures.
 *
 * The same events are where sounds would hook in: `absorb` sees every one of them.
 */

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Milliseconds left, and to begin with. */
  life: number
  maxLife: number
  colour: string
  size: number
  shape: 'chip' | 'spark' | 'ring'
  gravity: number
}

export interface Popup {
  x: number
  y: number
  text: string
  colour: string
  life: number
  maxLife: number
  /** 1 for a small number, up to 2 for a big moment. */
  size: number
}

export interface Banner {
  text: string
  detail?: string
  colour: string
  life: number
  maxLife: number
}

const MAX_PARTICLES = 450
const TRAIL_LENGTH = 12

const RARITY_COLOURS: Record<string, string> = { common: '#22d3ee', uncommon: '#4ade80', rare: '#c084fc', veryRare: '#facc15' }

export function powerUpColour(kind: PowerUpKind): string {
  return RARITY_COLOURS[POWER_UPS[kind].rarity]
}

export class Juice {
  particles: Particle[] = []
  popups: Popup[] = []
  banner: Banner | null = null
  /** Bricks just hit, and how much of their flash is left (ms). */
  flashes = new Map<number, number>()
  /** Falling power-ups, and how long they have been visible (ms), for their entrance. */
  dropAges = new Map<number, number>()
  /** Recent positions of each ball, for its trail. */
  trails = new Map<number, { x: number; y: number }[]>()
  shake = 0
  /** The combo's pulse after it goes up, 0 to 1. */
  comboPulse = 0
  /** The red edge after a life is lost, 0 to 1. */
  hurt = 0
  /** The paddle's squash after a bounce, 0 to 1. */
  paddleSquash = 0
  /** A laser's muzzle flash, 0 to 1. */
  muzzle = 0

  /** Turns what just happened into effects. */
  absorb(events: readonly BrickEvent[], outfit: Outfit, state: Readonly<BrickState>): void {
    // Pieces fly in the colours of the world being played.
    const debris = worldOf(outfit.bricks.look, state.level).debris
    for (const event of events) {
      switch (event.type) {
        case 'brickHit':
          this.flashes.set(event.brickId, 110)
          this.burst(event.x, event.y, 4, debris, 'chip', 90)
          this.popup(event.x, event.y, `+${event.points}`, '#e2e8f0', 0.8)
          break
        case 'brickDestroyed': {
          const colours = event.cause === 'fire' ? ['#fb923c', '#facc15', '#ef4444'] : event.cause === 'laser' ? ['#67e8f9', '#ffffff'] : debris
          this.flashes.delete(event.brickId)
          this.burst(event.x, event.y, event.cause === 'fire' ? 18 : 13, colours, 'chip', 170)
          this.burst(event.x, event.y, 4, ['#ffffff'], 'spark', 220)
          const multiplier = comboMultiplier(event.combo)
          const colour = multiplier >= 2.5 ? '#facc15' : multiplier >= 2 ? '#fb923c' : multiplier > 1 ? '#f0abfc' : '#ffffff'
          this.popup(event.x, event.y - 4, `+${event.points}`, colour, 1 + Math.min(0.6, (event.combo - 1) * 0.06))
          this.shake = Math.min(this.shake + (event.cause === 'fire' ? 1.2 : 0.9), 5)
          this.comboPulse = 1
          break
        }
        case 'combo': {
          const big = event.combo >= 15
          this.banner = { text: `COMBO x${event.combo}!`, detail: big ? 'Unstoppable!' : event.combo >= 10 ? 'On fire!' : 'Nice!', colour: big ? '#facc15' : event.combo >= 10 ? '#fb923c' : '#f0abfc', life: 1100, maxLife: 1100 }
          this.shake = Math.min(this.shake + (big ? 4 : 2.5), 7)
          this.burst(200, 120, big ? 40 : 24, ['#facc15', '#f0abfc', '#67e8f9'], 'spark', 320)
          break
        }
        case 'drop':
          this.burst(event.x, event.y, 10, [powerUpColour(event.kind), '#ffffff'], 'ring', 260)
          this.popup(event.x, event.y - 14, '?!', powerUpColour(event.kind), 1.1)
          break
        case 'collect': {
          const colour = powerUpColour(event.kind)
          this.burst(event.x, event.y, 26, [colour, '#ffffff'], 'spark', 300)
          this.popup(state.paddle.x, event.y - 26, `${POWER_UPS[event.kind].label.toUpperCase()}!`, colour, 1.5)
          if (event.kind === 'multiBall' || event.kind === 'twoBalls' || event.kind === 'extraLife') {
            this.banner = { text: POWER_UPS[event.kind].label.toUpperCase() + '!', colour, life: 900, maxLife: 900 }
            this.shake = Math.min(this.shake + 2, 6)
          }
          break
        }
        case 'laser':
          this.muzzle = 1
          break
        case 'paddle':
          this.paddleSquash = 1
          this.burst(event.x, PADDLE.y, 5, ['#ffffff', outfit.paddle.look.rim], 'spark', 140)
          break
        case 'lifeLost':
          this.hurt = 1
          this.shake = Math.min(this.shake + 5, 8)
          this.banner = event.lives > 0 ? { text: '−1 ♥', detail: `${event.lives} ${event.lives === 1 ? 'life' : 'lives'} left`, colour: '#f87171', life: 1200, maxLife: 1200 } : null
          this.trails.clear()
          break
        case 'levelClear':
          this.burst(200, 300, 70, ['#facc15', '#f472b6', '#22d3ee', '#4ade80', '#ffffff'], 'chip', 520)
          this.trails.clear()
          break
        case 'gameOver':
          this.shake = 6
          break
        case 'levelStart':
          // A title card for each new world (the first level has the start screen instead).
          if (event.level > 1) {
            this.banner = { text: `LEVEL ${event.level}`, detail: state.levelName, colour: worldOf(outfit.bricks.look, event.level).hud.edge, life: 1500, maxLife: 1500 }
          }
          break
        default:
          break
      }
    }
  }

  /** Moves everything on by `ms` of screen time, and follows the balls for their trails. */
  update(ms: number, state: Readonly<BrickState>): void {
    const dt = ms / 1000
    for (const particle of this.particles) {
      particle.life -= ms
      particle.vy += particle.gravity * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
    for (const popup of this.popups) {
      popup.life -= ms
      popup.y -= 38 * dt
    }
    this.popups = this.popups.filter((popup) => popup.life > 0)
    if (this.banner) {
      this.banner.life -= ms
      if (this.banner.life <= 0) this.banner = null
    }
    for (const [id, left] of this.flashes) {
      if (left - ms <= 0) this.flashes.delete(id)
      else this.flashes.set(id, left - ms)
    }
    const decay = (value: number, perSecond: number) => Math.max(0, value - perSecond * dt)
    this.shake = decay(this.shake, 22)
    this.comboPulse = decay(this.comboPulse, 4)
    this.hurt = decay(this.hurt, 2)
    this.paddleSquash = decay(this.paddleSquash, 7)
    this.muzzle = decay(this.muzzle, 8)

    const ids = new Set(state.drops.map((drop) => drop.id))
    for (const id of this.dropAges.keys()) if (!ids.has(id)) this.dropAges.delete(id)
    for (const drop of state.drops) this.dropAges.set(drop.id, (this.dropAges.get(drop.id) ?? 0) + ms)

    const live = new Set(state.balls.map((ball) => ball.id))
    for (const id of this.trails.keys()) if (!live.has(id)) this.trails.delete(id)
    if (state.phase === 'playing') {
      for (const ball of state.balls) {
        const trail = this.trails.get(ball.id) ?? []
        trail.push({ x: ball.x, y: ball.y })
        if (trail.length > TRAIL_LENGTH) trail.shift()
        this.trails.set(ball.id, trail)
      }
    }
  }

  /** How far to shake the picture this frame. */
  shakeOffset(): { x: number; y: number } {
    if (this.shake < 0.2) return { x: 0, y: 0 }
    return { x: (Math.random() - 0.5) * this.shake, y: (Math.random() - 0.5) * this.shake }
  }

  reset(): void {
    this.particles = []
    this.popups = []
    this.banner = null
    this.flashes.clear()
    this.dropAges.clear()
    this.trails.clear()
    this.shake = this.comboPulse = this.hurt = this.paddleSquash = this.muzzle = 0
  }

  private burst(x: number, y: number, count: number, colours: readonly string[], shape: Particle['shape'], speed: number): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.35 + Math.random() * 0.8)
      const life = 320 + Math.random() * 380
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - (shape === 'chip' ? 60 : 0),
        life,
        maxLife: life,
        colour: colours[i % colours.length],
        size: shape === 'ring' ? 3 : shape === 'spark' ? 2 : 2.5 + Math.random() * 2.5,
        shape,
        gravity: shape === 'chip' ? 520 : 0,
      })
    }
  }

  private popup(x: number, y: number, text: string, colour: string, size: number): void {
    this.popups.push({ x, y, text, colour, life: 750, maxLife: 750, size })
    if (this.popups.length > 30) this.popups.shift()
  }
}
