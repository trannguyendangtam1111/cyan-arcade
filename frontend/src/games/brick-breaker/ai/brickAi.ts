import type { GameAI } from '@/games/shared/ai'
import { ARENA, BALL_RADIUS, PADDLE } from '../engine/arena'
import type { StepInput } from '../engine/brickEngine'
import { DROP_SIZE, DROP_SPEED } from '../engine/powerUps'
import { MAX_ANGLE, MIN_ANGLE } from '../engine/physics'
import type { Ball, Brick, BrickState, Drop, PowerUpKind } from '../types/brickTypes'

/**
 * Brick Breaker AI: predict where each ball will come down, save the one that needs it first, and
 * aim the bounce at the bricks.
 *
 * Before every engine step it projects each ball's path to the paddle, bouncing it
 * off the walls and the ceiling the way the engine does. The ball due soonest is the one to save;
 * the paddle goes under its landing point, offset so the bounce flies at a brick: the lowest one in
 * reach, straight or off a side wall, by turning the paddle's bounce rule around (never far enough
 * off-centre to risk the save). With a moment to spare it also goes for a
 * falling power-up, the most useful first, but only when it can still get back in time.
 *
 * It sees what a player sees: the balls, the bricks and the falling power-ups. Bricks a ball will
 * hit on the way are not predicted, so it re-plans as soon as one changes a ball's course. Its
 * decisions depend only on the state passed in, so a game plays the same way at any playback speed.
 */

export interface BrickDecision {
  /** Where the paddle should go. */
  targetX: number
  strategy: 'serve' | 'save' | 'aim' | 'catch' | 'wait'
  /** The ball being saved, and where and when it comes down. */
  ballId: number | null
  landingX: number | null
  secondsToLanding: number | null
  /** The power-up being caught, if any. */
  catching: PowerUpKind | null
}

export interface BrickAI extends GameAI<BrickState, StepInput> {
  decide(state: Readonly<BrickState>): BrickDecision
}

/** On the paddle, it waits this long before launching, so the start can be seen. */
const SERVE_PAUSE_MS = 350
/** How far off-centre (as a share of the half paddle) it is willing to take a ball, to aim it. */
const MAX_AIM_OFFSET = 0.75
/** Time it keeps in hand when it leaves a ball to catch a power-up. */
const SAFETY_SECONDS = 0.15

/** Which power-ups are worth going for, most wanted first. */
const WANTED: readonly PowerUpKind[] = ['extraLife', 'multiBall', 'twoBalls', 'fireball', 'laser', 'extraBall', 'widePaddle', 'doubleScore', 'magnet']

/** The height at which a falling ball's centre meets the paddle. */
const CONTACT_Y = PADDLE.y - BALL_RADIUS

/**
 * Where and when a ball reaches the paddle's height, bouncing off the side walls and the ceiling
 * like the engine, as if nothing else were in the way.
 */
export function predictLanding(ball: Pick<Ball, 'x' | 'y' | 'vx' | 'vy'>): { x: number; seconds: number } | null {
  const ceiling = ARENA.top + BALL_RADIUS
  let seconds = 0
  let y = ball.y
  let vy = ball.vy
  if (vy === 0) return null
  if (vy < 0) {
    seconds += (y - ceiling) / -vy
    y = ceiling
    vy = -vy
  }
  if (y > CONTACT_Y) return null
  seconds += (CONTACT_Y - y) / vy
  return { x: foldX(ball.x + ball.vx * seconds), seconds }
}

/** An x travelled in a straight line, folded back between the side walls like bounces. */
export function foldX(x: number): number {
  const low = BALL_RADIUS
  const span = ARENA.width - 2 * BALL_RADIUS
  let t = (x - low) % (2 * span)
  if (t < 0) t += 2 * span
  return low + (t <= span ? t : 2 * span - t)
}

export function createBrickAi(): BrickAI {
  const decide = (state: Readonly<BrickState>): BrickDecision => {
    const { paddle } = state
    const half = paddle.width / 2
    const clamp = (x: number) => Math.max(half, Math.min(ARENA.width - half, x))
    const bricksCentre = state.bricks.length > 0 ? state.bricks.reduce((sum, brick) => sum + brick.x + brick.width / 2, 0) / state.bricks.length : ARENA.width / 2

    if (state.phase === 'serving') {
      return { targetX: clamp(bricksCentre), strategy: 'serve', ballId: null, landingX: null, secondsToLanding: null, catching: null }
    }
    if (state.phase !== 'playing') {
      return { targetX: paddle.x, strategy: 'wait', ballId: null, landingX: null, secondsToLanding: null, catching: null }
    }

    // The ball due soonest is the one to save; balls still rising come after falling ones.
    let urgent: { ball: Ball; x: number; seconds: number } | null = null
    for (const ball of state.balls) {
      const landing = predictLanding(ball)
      if (!landing) continue
      const rank = landing.seconds + (ball.vy < 0 ? 10 : 0)
      const best = urgent ? urgent.seconds + (urgent.ball.vy < 0 ? 10 : 0) : Infinity
      if (rank < best) urgent = { ball, ...landing }
    }

    const speed = PADDLE.pointerSpeed
    const timeTo = (from: number, to: number) => Math.abs(to - from) / speed

    // A power-up worth catching on the way, if the save is still sure afterwards.
    const drop = bestDrop(state.drops, paddle.x, urgent, timeTo)
    if (drop) {
      return { targetX: clamp(drop.x), strategy: 'catch', ballId: urgent?.ball.id ?? null, landingX: urgent?.x ?? null, secondsToLanding: urgent?.seconds ?? null, catching: drop.kind }
    }
    if (!urgent) {
      return { targetX: clamp(bricksCentre), strategy: 'wait', ballId: null, landingX: null, secondsToLanding: null, catching: null }
    }

    // Under the landing point, offset so the bounce flies at a brick, if there is time to get there.
    const lean = aimOffset(urgent.x, state.bricks)
    const aimed = clamp(urgent.x - lean * half)
    const canAim = timeTo(paddle.x, aimed) < urgent.seconds - 0.05
    return {
      targetX: canAim ? aimed : clamp(urgent.x),
      strategy: canAim && lean !== 0 ? 'aim' : 'save',
      ballId: urgent.ball.id,
      landingX: urgent.x,
      secondsToLanding: urgent.seconds,
      catching: null,
    }
  }

  return {
    decide,
    getNextAction: (state) => {
      const decision = decide(state)
      return {
        aim: decision.targetX,
        launch: state.phase === 'serving' && state.serveMs >= SERVE_PAUSE_MS,
      }
    },
  }
}

/**
 * Where on the paddle (−1 left end … 1 right end) a ball landing at `landingX` should hit to fly at a
 * brick. The paddle sends a ball off at `offset × MAX_ANGLE` from the vertical, so the offset for a
 * target is its angle over MAX_ANGLE. It tries the lowest bricks first (the ones in the open), each
 * straight on and then by its mirror image in either side wall (one bounce on the way).
 */
export function aimOffset(landingX: number, bricks: readonly Brick[]): number {
  if (bricks.length === 0) return 0
  const fromY = CONTACT_Y
  const byExposure = [...bricks].sort((a, b) => b.y - a.y || Math.abs(a.x + a.width / 2 - landingX) - Math.abs(b.x + b.width / 2 - landingX))
  const left = BALL_RADIUS
  const right = ARENA.width - BALL_RADIUS
  for (const brick of byExposure.slice(0, 6)) {
    const x = brick.x + brick.width / 2
    const y = brick.y + brick.height / 2
    for (const image of [x, 2 * left - x, 2 * right - x]) {
      const angle = Math.atan2(image - landingX, fromY - y)
      const offset = angle / MAX_ANGLE
      if (Math.abs(angle) >= MIN_ANGLE && Math.abs(offset) <= MAX_AIM_OFFSET) return offset
    }
  }
  return 0
}

/** The most wanted falling power-up the paddle can catch and still make the save. */
function bestDrop(
  drops: readonly Drop[],
  paddleX: number,
  urgent: { ball: Ball; x: number; seconds: number } | null,
  timeTo: (from: number, to: number) => number,
): Drop | null {
  let best: Drop | null = null
  for (const drop of drops) {
    // When it reaches the paddle's top.
    const secondsToPaddle = (PADDLE.y - DROP_SIZE.height / 2 - drop.y) / DROP_SPEED
    if (secondsToPaddle < 0) continue
    if (timeTo(paddleX, drop.x) > secondsToPaddle) continue
    if (urgent) {
      // After the catch, back under the ball in time, with some to spare.
      if (secondsToPaddle >= urgent.seconds) continue
      if (secondsToPaddle + timeTo(drop.x, urgent.x) + SAFETY_SECONDS > urgent.seconds) continue
    }
    if (!best || WANTED.indexOf(drop.kind) < WANTED.indexOf(best.kind)) best = drop
  }
  return best
}
