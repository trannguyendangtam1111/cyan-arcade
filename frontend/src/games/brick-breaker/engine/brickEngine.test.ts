import { describe, expect, it } from 'vitest'
import type { Ball, Brick, BrickKind, BrickState, Drop, PowerUpKind } from '../types/brickTypes'
import { ARENA, BALL_RADIUS, cellOf, GRID, PADDLE } from './arena'
import {
  advance,
  AUTO_LAUNCH_MS,
  createBrickBreakerEngine,
  createBrickBreakerGame,
  isGameOver,
  isLevelComplete,
  LEVEL_CLEAR_MS,
  runDetails,
  START_LIVES,
  STEP_MS,
  updateBrickBreaker,
} from './brickEngine'
import { HP_OF } from './levels'
import { circleRectContact, MAX_ANGLE, MIN_ANGLE, paddleBounce } from './physics'
import { LASER_COOLDOWN_MS, MAX_BALLS, MAX_LIVES, POWER_UPS } from './powerUps'
import { BRICK_POINTS, brickPoints, COMBO_TIMEOUT_MS, comboMultiplier, HIT_POINTS } from './scoring'

const SEED = 4242
const DT = STEP_MS / 1000

/** A game in play on level 1, with whatever the test sets. */
function playing(overrides: Partial<BrickState> = {}): BrickState {
  let state = updateBrickBreaker(createBrickBreakerGame(SEED), { type: 'launch' })
  state = advance(state, STEP_MS)
  expect(state.phase).toBe('playing')
  return { ...state, events: [], ...overrides }
}

const ball = (x: number, y: number, vx: number, vy: number, id = 1): Ball => ({ id, x, y, vx, vy })

function brick(row: number, col: number, kind: BrickKind = 'normal', hp = HP_OF[kind]): Brick {
  const { x, y } = cellOf(row, col)
  return { id: row * GRID.columns + col, row, col, x, y, width: GRID.brickWidth, height: GRID.brickHeight, kind, hp, maxHp: HP_OF[kind] }
}

/** Steps until `done` or `limitMs` of game time. */
function run(state: BrickState, done: (state: BrickState) => boolean, limitMs = 10_000, collect?: (state: BrickState) => void): BrickState {
  let current = state
  for (let t = 0; t < limitMs && !done(current); t += STEP_MS) {
    current = advance(current, STEP_MS)
    collect?.(current)
  }
  return current
}

/** Lets `ms` of game time pass, in calls of at most a second (one call never simulates more). */
function wait(state: BrickState, ms: number): BrickState {
  let current = state
  for (let left = ms; left > 0; left -= 500) current = advance(current, Math.min(500, left))
  return current
}

/** A brick far away that keeps the level from being cleared. */
const keeper = () => brick(0, 0)

describe('a new game', () => {
  it('starts on level 1 with three lives, the ball resting on the paddle', () => {
    const state = createBrickBreakerGame(SEED)
    expect(state.phase).toBe('serving')
    expect(state.level).toBe(1)
    expect(state.levelName).toBe('Cute Sakura')
    expect(state.lives).toBe(START_LIVES)
    expect(state.balls).toHaveLength(1)
    expect(state.balls[0].y).toBeCloseTo(PADDLE.y - BALL_RADIUS, 1)
    expect(state.bricks).toHaveLength(44)
  })

  it('waits for the player before the first launch, and starts the clock then', () => {
    let state = advance(createBrickBreakerGame(SEED), 10_000)
    expect(state.phase).toBe('serving')
    expect(state.elapsedMs).toBe(0)
    state = advance(updateBrickBreaker(state, { type: 'launch' }), STEP_MS)
    expect(state.phase).toBe('playing')
    expect(state.started).toBe(true)
    expect(state.balls[0].vy).toBeLessThan(0)
    expect(state.events).toContainEqual({ type: 'launch' })
  })

  it('lets the paddle move before the launch, carrying the ball', () => {
    const state = advance(updateBrickBreaker(createBrickBreakerGame(SEED), { type: 'aim', x: 300 }), 500)
    expect(state.paddle.x).toBeCloseTo(300)
    expect(state.balls[0].x).toBeCloseTo(300)
  })
})

describe('the paddle', () => {
  it('follows the pointer quickly but not instantly, and stays in the arena', () => {
    let state = updateBrickBreaker(playing(), { type: 'aim', x: 380 })
    state = advance(state, STEP_MS)
    expect(state.paddle.x).toBeCloseTo(ARENA.width / 2 + PADDLE.pointerSpeed * DT, 3)
    state = advance(state, 1000)
    expect(state.paddle.x).toBe(ARENA.width - PADDLE.width / 2)
  })

  it('moves with the keys and stops when they are let go', () => {
    let state = updateBrickBreaker(playing({ bricks: [keeper()], pendingMs: 0 }), { type: 'steer', direction: -1 })
    state = advance(state, STEP_MS * 24 + 0.001)
    expect(state.paddle.x).toBeCloseTo(ARENA.width / 2 - PADDLE.keySpeed * DT * 24, 6)
    const stopped = advance(updateBrickBreaker(state, { type: 'steer', direction: 0 }), 100).paddle.x
    expect(stopped).toBe(state.paddle.x)
  })
})

describe('ball physics', () => {
  it('moves by its velocity every step', () => {
    const state = advance(playing({ balls: [ball(200, 300, 100, -200)], bricks: [keeper()] }), STEP_MS)
    expect(state.balls[0].x).toBeCloseTo(200 + 100 * DT)
    expect(state.balls[0].y).toBeCloseTo(300 - 200 * DT)
  })

  it('bounces off the side walls and the top', () => {
    const left = advance(playing({ balls: [ball(BALL_RADIUS + 0.5, 300, -250, -100)], bricks: [keeper()] }), STEP_MS)
    expect(left.balls[0].vx).toBe(250)
    expect(left.balls[0].x).toBeCloseTo(BALL_RADIUS + (250 * DT - 0.5))
    const right = advance(playing({ balls: [ball(ARENA.width - BALL_RADIUS - 0.5, 300, 250, -100)], bricks: [keeper()] }), STEP_MS)
    expect(right.balls[0].vx).toBe(-250)
    const top = advance(playing({ balls: [ball(200, ARENA.top + BALL_RADIUS + 0.5, 50, -250)], bricks: [keeper()] }), STEP_MS)
    expect(top.balls[0].vy).toBe(250)
    expect(top.balls[0].y).toBeGreaterThanOrEqual(ARENA.top + BALL_RADIUS)
  })

  it('leaves the paddle at an angle set by where it hit', () => {
    const speed = 300
    const centre = paddleBounce(0, speed, 1)
    const left = paddleBounce(-0.9, speed, 1)
    const right = paddleBounce(0.9, speed, 1)
    expect(Math.atan2(Math.abs(centre.vx), -centre.vy)).toBeCloseTo(MIN_ANGLE)
    expect(left.vx).toBeLessThan(0)
    expect(right.vx).toBeGreaterThan(0)
    const near = paddleBounce(0.3, speed, 1)
    expect(Math.atan2(right.vx, -right.vy)).toBeGreaterThan(Math.atan2(near.vx, -near.vy))
    // Never flatter than the limit, even off the very end, and always the same speed.
    for (const offset of [-5, -1, -0.5, 0, 0.01, 0.5, 1, 5]) {
      const { vx, vy } = paddleBounce(offset, speed, -1)
      const angle = Math.atan2(Math.abs(vx), -vy)
      expect(angle).toBeGreaterThanOrEqual(MIN_ANGLE - 1e-9)
      expect(angle).toBeLessThanOrEqual(MAX_ANGLE + 1e-9)
      expect(Math.hypot(vx, vy)).toBeCloseTo(speed)
    }
  })

  it('bounces off the paddle in the engine, by where it lands', () => {
    const above = PADDLE.y - BALL_RADIUS - 1
    const hitAt = (dx: number) => {
      const state = run(playing({ balls: [ball(200 + dx, above, 0, 250)], bricks: [keeper()] }), (s) => s.balls[0]?.vy < 0, 200)
      return state.balls[0]
    }
    expect(hitAt(0).vy).toBeLessThan(0)
    expect(hitAt(-30).vx).toBeLessThan(0)
    expect(hitAt(30).vx).toBeGreaterThan(0)
    expect(Math.abs(hitAt(30).vx)).toBeGreaterThan(Math.abs(hitAt(10).vx))
  })

  it('bounces off the bottom of a brick and damages it once', () => {
    const target = brick(5, 4, 'tough')
    const start = playing({ balls: [ball(target.x + target.width / 2, target.y + target.height + BALL_RADIUS + 2, 0, -250)], bricks: [target, keeper()] })
    const after = run(start, (s) => s.balls[0].vy > 0, 500)
    expect(after.bricks.find((each) => each.id === target.id)?.hp).toBe(1)
    expect(after.score).toBe(HIT_POINTS)
    expect(circleRectContact(after.balls[0].x, after.balls[0].y, BALL_RADIUS, target.x, target.y, target.width, target.height)).toBeNull()
    // It flew away: no second hit from the same touch.
    const later = advance(after, 200)
    expect(later.bricks.find((each) => each.id === target.id)?.hp).toBe(1)
  })

  it('bounces off the side of a brick', () => {
    const target = brick(5, 4)
    const start = playing({ balls: [ball(target.x - BALL_RADIUS - 2, target.y + target.height / 2, 250, 30)], bricks: [target, keeper()] })
    const after = run(start, (s) => s.balls[0].vx < 0, 500)
    expect(after.balls[0].vx).toBeLessThan(0)
    expect(after.bricks).toHaveLength(1)
  })

  it('pushes a ball found inside a brick back out, and never leaves it stuck', () => {
    const target = brick(5, 4, 'armored')
    const start = playing({ balls: [ball(target.x + target.width / 2, target.y + target.height / 2, 120, -260)], bricks: [target, keeper()] })
    const after = advance(start, STEP_MS)
    const out = after.balls[0]
    expect(circleRectContact(out.x, out.y, BALL_RADIUS, target.x, target.y, target.width, target.height)).toBeNull()
    expect(after.bricks.find((each) => each.id === target.id)?.hp).toBe(2)
  })

  it('cannot pass through a brick even at the fastest speed', () => {
    for (const speed of [250, 440, 600]) {
      const target = brick(5, 4)
      const start = playing({ speed, balls: [ball(target.x + target.width / 2, target.y + target.height + 40, 0, -speed)], bricks: [target, keeper()] })
      const after = run(start, (s) => s.bricks.length === 1, 1000)
      expect(after.bricks).toHaveLength(1)
      expect(after.balls[0].vy).toBeGreaterThan(0)
      expect(after.balls[0].y).toBeGreaterThan(target.y + target.height)
    }
  })

  it('never loops forever through an empty part of the arena, even caught dead-centre every time', () => {
    // Bricks only on the far left; the ball rising along the right wall, as seen in real play.
    const left = [brick(2, 0), brick(3, 0)]
    let state = playing({ bricks: left, balls: [ball(390, 400, 1, -300)] })
    let hit = false
    for (let i = 0; i < 60 * 60 && !hit; i++) {
      // A player who always puts the paddle's centre under the ball.
      state = advance(state, 1000 / 60, (current) => ({ aim: current.balls[0]?.x ?? 200 }))
      hit = state.events.some((event) => event.type === 'brickDestroyed')
    }
    expect(hit).toBe(true)
  })

  it('leans a ball that keeps missing the bricks towards them, more with every idle bounce', () => {
    // Bricks on the left; the ball keeps landing dead-centre on the paddle at the right.
    const bounceAfter = (idleBounces: number) => {
      const start = playing({ idleBounces, bricks: [brick(2, 0)], balls: [ball(300, PADDLE.y - 20, 30, 300)], paddle: { ...playing().paddle, x: 300, target: 300 } })
      return run(start, (s) => s.balls[0].vy < 0, 300).balls[0].vx
    }
    // The first idle bounces are left alone; from the third on, the ball turns left, more and more.
    expect(bounceAfter(0)).toBeGreaterThan(0)
    expect(bounceAfter(2)).toBeLessThan(bounceAfter(0))
    expect(bounceAfter(4)).toBeLessThan(bounceAfter(2))
    // Any brick hit starts the count again.
    const target = brick(5, 4)
    const after = run(playing({ idleBounces: 5, bricks: [target, keeper()], balls: [ball(target.x + 18, target.y + target.height + BALL_RADIUS + 1, 1, -300)] }), (s) => s.bricks.length === 1, 200)
    expect(after.idleBounces).toBe(0)
  })

  it('keeps every ball at the level speed and away from flat or straight paths', () => {
    let state = playing()
    for (let i = 0; i < 4000 && state.phase !== 'over'; i++) {
      state = advance(state, STEP_MS)
      if (state.phase !== 'playing') continue
      for (const each of state.balls) {
        expect(Math.hypot(each.vx, each.vy)).toBeCloseTo(state.speed, 6)
        const angle = Math.atan2(Math.abs(each.vx), Math.abs(each.vy))
        expect(angle).toBeGreaterThanOrEqual(MIN_ANGLE - 1e-6)
        expect(angle).toBeLessThanOrEqual(MAX_ANGLE + 1e-6)
      }
    }
  })
})

describe('time', () => {
  /** Ball and paddle positions at every step of four seconds, with the paddle steered at fixed steps. */
  const tracks = (frames: number[]) => {
    const seen: string[] = []
    let state = playing()
    for (let i = 0; state.phase !== 'over' && state.steps < 960; i++) {
      state = advance(state, frames[i % frames.length], (current) => {
        seen[current.steps] = `${current.paddle.x.toFixed(9)} ${current.balls.map((b) => `${b.x.toFixed(9)},${b.y.toFixed(9)}`).join(' ')} ${current.score}`
        return { aim: current.steps % 240 < 120 ? 120 : 280 }
      })
    }
    return seen.slice(0, 900)
  }

  it('plays exactly the same at 30, 60 and 144 frames a second, and with ragged frames', () => {
    const at60 = tracks([1000 / 60])
    expect(tracks([1000 / 30])).toEqual(at60)
    expect(tracks([1000 / 144])).toEqual(at60)
    expect(tracks([3, 17, 9.5, 33, 1, 25])).toEqual(at60)
  })

  it('never simulates more than a second at once', () => {
    const state = advance(playing({ bricks: [keeper()] }), 60_000)
    expect(state.elapsedMs).toBeLessThanOrEqual(1000 + STEP_MS * 2)
  })
})

describe('scoring and combos', () => {
  it('scores destroyed bricks by kind, times the combo', () => {
    expect(brickPoints('normal', 1, false)).toBe(100)
    expect(brickPoints('tough', 1, false)).toBe(150)
    expect(brickPoints('armored', 1, false)).toBe(250)
    expect([1, 2, 3, 4, 5, 9, 50].map(comboMultiplier)).toEqual([1, 1.2, 1.5, 2, 2.5, 2.5, 2.5])
    expect(brickPoints('normal', 4, true)).toBe(400)
  })

  it('builds a combo brick after brick, and ends it after a pause', () => {
    const row = [brick(5, 2), brick(5, 3), brick(5, 4)]
    let state = playing({ balls: [ball(200, 400, 0, -300)], bricks: [...row, keeper()] })
    // Break them one by one, as if three balls had.
    const breakOne = (target: Brick) => {
      state = advance({ ...state, balls: [ball(target.x + target.width / 2, target.y + target.height + BALL_RADIUS + 1, 1, -300)] }, STEP_MS * 3)
    }
    row.forEach(breakOne)
    expect(state.combo).toBe(3)
    expect(state.score).toBe(100 + 120 + 150)
    expect(state.stats.maxCombo).toBe(3)
    // Nothing broken for a while: the combo is over.
    state = wait({ ...state, balls: [ball(200, 300, 60, -300)] }, COMBO_TIMEOUT_MS + 50)
    expect(state.combo).toBe(0)
  })

  it('marks combo milestones', () => {
    const bricks = Array.from({ length: 5 }, (_, i) => brick(4, i * 2))
    let state = playing({ bricks: [...bricks, keeper()] })
    const events: string[] = []
    for (const target of bricks) {
      state = advance({ ...state, balls: [ball(target.x + target.width / 2, target.y + target.height + BALL_RADIUS + 1, 1, -300)] }, STEP_MS * 3)
      events.push(...state.events.map((event) => event.type))
    }
    expect(events.filter((type) => type === 'combo')).toHaveLength(1)
  })
})

describe('lives and levels', () => {
  it('loses a life only when every ball is gone, then serves one ball and launches it by itself', () => {
    let state = playing({ balls: [ball(100, 590, 0, 300), ball(300, 300, 50, -300, 2)], bricks: [keeper()] })
    state = advance(state, 100)
    expect(state.lives).toBe(START_LIVES)
    expect(state.balls).toHaveLength(1)
    state = run({ ...state, balls: [ball(300, 590, 0, 300)] }, (s) => s.lives < START_LIVES, 500)
    expect(state.lives).toBe(START_LIVES - 1)
    expect(state.phase).toBe('serving')
    expect(state.balls).toHaveLength(1)
    expect(state.combo).toBe(0)
    expect(state.stats.livesLost).toBe(1)
    state = wait(state, AUTO_LAUNCH_MS + 50)
    expect(state.phase).toBe('playing')
  })

  it('ends the game when the last life is lost', () => {
    let state = playing({ lives: 1, balls: [ball(300, 590, 0, 300)], bricks: [keeper()] })
    state = run(state, isGameOver, 500)
    expect(state.phase).toBe('over')
    expect(state.lives).toBe(0)
    expect(state.events).toContainEqual({ type: 'gameOver' })
    expect(advance(state, 1000).steps).toBe(state.steps)
  })

  it('clears a level with a bonus, then moves on to the next', () => {
    const last = brick(5, 4)
    let state = playing({ bricks: [last], balls: [ball(last.x + last.width / 2, last.y + last.height + BALL_RADIUS + 1, 1, -300)] })
    state = run(state, isLevelComplete, 500)
    expect(state.phase).toBe('cleared')
    expect(state.lastBonus).toMatchObject({ level: 1, base: 500, lives: 300, perfect: 1000 })
    expect(state.score).toBe(100 + state.lastBonus!.total)
    expect(state.stats.perfectClears).toBe(1)
    state = wait(state, LEVEL_CLEAR_MS + 20)
    expect(state.level).toBe(2)
    expect(state.levelName).toBe('Kawaii Candy')
    expect(state.phase).toBe('serving')
    expect(state.bricks).toHaveLength(40)
    expect(state.speed).toBeGreaterThan(250)
  })

  it('gives no perfect bonus after a life was lost on the level', () => {
    const last = brick(5, 4)
    const state = run(playing({ levelLivesLost: 1, lives: 2, bricks: [last], balls: [ball(last.x + 18, last.y + 30, 1, -300)] }), isLevelComplete, 500)
    expect(state.lastBonus?.perfect).toBe(0)
    expect(state.stats.perfectClears).toBe(0)
  })
})

describe('power-ups', () => {
  const drop = (kind: PowerUpKind, x = ARENA.width / 2): Drop => ({ id: 99, kind, x, y: PADDLE.y - 20 })
  const catchIt = (kind: PowerUpKind, overrides: Partial<BrickState> = {}) =>
    run(playing({ bricks: [keeper()], drops: [drop(kind)], ...overrides }), (s) => s.drops.length === 0, 1000)

  it('drop from destroyed bricks, the same ones for the same seed', () => {
    const drops = (seed: number) => {
      let state = updateBrickBreaker(createBrickBreakerGame(seed), { type: 'launch' })
      const seen: string[] = []
      for (let i = 0; i < 30 * 60 && state.phase !== 'over'; i++) {
        state = advance(state, 1000 / 60)
        for (const event of state.events) if (event.type === 'drop') seen.push(`${event.kind}@${event.x}`)
      }
      return seen
    }
    expect(drops(7)).toEqual(drops(7))
    expect(drops(7)).not.toEqual(drops(8))
  })

  it('fall, and are caught by the paddle or missed', () => {
    const caught = catchIt('doubleScore')
    expect(caught.stats.powerUps).toBe(1)
    expect(caught.effects.doubleScore).toBeGreaterThan(0)
    let missed = playing({ bricks: [keeper()], drops: [drop('fireball', 20)], paddle: { ...playing().paddle, x: 350 } })
    const events: string[] = []
    missed = run(missed, (s) => s.drops.length === 0, 2000, (s) => events.push(...s.events.map((event) => event.type)))
    expect(missed.stats.powerUps).toBe(0)
    expect(events).toContain('missedDrop')
  })

  it('timed ones run out, and catching one again restarts its time instead of stacking', () => {
    let state = catchIt('widePaddle')
    expect(state.paddle.width).toBe(PADDLE.wideWidth)
    state = advance(state, 4000)
    const left = state.effects.widePaddle!
    state = run({ ...state, drops: [drop('widePaddle', state.paddle.x)] }, (s) => s.drops.length === 0, 1000)
    expect(state.effects.widePaddle).toBeGreaterThan(left)
    expect(state.effects.widePaddle).toBeLessThanOrEqual(POWER_UPS.widePaddle.durationMs!)
    state = wait(state, POWER_UPS.widePaddle.durationMs! + 100)
    expect(state.effects.widePaddle).toBeUndefined()
    expect(state.paddle.width).toBe(PADDLE.width)
  })

  it('x2 Score doubles brick points, and never more than double', () => {
    const target = brick(5, 4)
    const base = playing({ bricks: [target, keeper()], balls: [ball(target.x + 18, target.y + target.height + BALL_RADIUS + 1, 1, -300)] })
    const doubled = run({ ...base, effects: { doubleScore: 5000 } }, (s) => s.bricks.length === 1, 200)
    expect(doubled.score).toBe(BRICK_POINTS.normal * 2)
  })

  it('+1 and +2 add balls, Multi-Ball triples them, all within the limit', () => {
    expect(catchIt('extraBall').balls.length).toBe(2)
    expect(catchIt('twoBalls').balls.length).toBe(3)
    expect(catchIt('multiBall').balls.length).toBe(3)
    const many = catchIt('multiBall', { balls: [1, 2, 3, 4].map((id) => ball(50 * id, 200, 100, -250, id)) })
    expect(many.balls.length).toBe(MAX_BALLS)
    expect(many.stats.maxBalls).toBe(MAX_BALLS)
  })

  it('Extra Life adds a life, up to the most there can be', () => {
    expect(catchIt('extraLife').lives).toBe(START_LIVES + 1)
    expect(catchIt('extraLife', { lives: MAX_LIVES }).lives).toBe(MAX_LIVES)
  })

  it('Fireball goes straight through bricks and destroys even armored ones', () => {
    const wall = [brick(6, 4, 'armored'), brick(5, 4, 'tough'), brick(4, 4)]
    const state = run(
      playing({ effects: { fireball: 5000 }, bricks: [...wall, keeper()], balls: [ball(wall[0].x + 18, wall[0].y + 40, 1, -300)] }),
      (s) => s.bricks.length === 1,
      1000,
    )
    expect(state.bricks).toHaveLength(1)
    expect(state.balls[0].vy).toBeLessThan(0)
    expect(state.stats.fireBricks).toBe(3)
  })

  it('Laser fires twin shots on a cooldown that break bricks', () => {
    const target = brick(5, 2)
    let state = playing({ bricks: [target, keeper()], balls: [ball(390, 300, 1, -250)], paddle: { ...playing().paddle, x: target.x + target.width / 2 + 30, target: null } })
    state = catchIt('laser', { ...state, drops: [drop('laser', state.paddle.x)] })
    const shots: number[] = []
    state = run(state, (s) => s.bricks.length === 1, 3000, (s) => s.events.forEach((event) => event.type === 'laser' && shots.push(s.elapsedMs)))
    expect(state.stats.laserBricks).toBe(1)
    for (let i = 1; i < shots.length; i++) expect(shots[i] - shots[i - 1]).toBeGreaterThanOrEqual(LASER_COOLDOWN_MS - STEP_MS)
  })

  it('Magnet leans the bounce towards the way the paddle moves', () => {
    const bounce = (magnet: boolean) => {
      let state = playing({ bricks: [keeper()], effects: magnet ? { magnet: 5000 } : {}, balls: [ball(230, PADDLE.y - 30, 0, 300)] })
      state = updateBrickBreaker(state, { type: 'steer', direction: 1 })
      return run(state, (s) => s.balls[0].vy < 0, 300).balls[0].vx
    }
    expect(bounce(true)).toBeGreaterThan(bounce(false))
  })

  it('are all cleared when a life is lost', () => {
    const state = run(playing({ bricks: [keeper()], effects: { fireball: 5000, laser: 5000 }, drops: [drop('extraLife', 20)], balls: [ball(300, 595, 0, 300)] }), (s) => s.phase === 'serving', 300)
    expect(state.effects).toEqual({})
    expect(state.drops).toEqual([])
  })
})

describe('the run', () => {
  it('reports a few whole numbers', () => {
    const state = run(playing({ lives: 1, balls: [ball(300, 590, 0, 300)], bricks: [keeper()] }), isGameOver, 500)
    const details = runDetails(state)
    expect(Object.keys(details).sort()).toEqual(['bricks', 'fireBricks', 'gameMs', 'laserBricks', 'level', 'livesLost', 'maxBalls', 'maxCombo', 'perfectClears', 'powerUps'])
    for (const value of Object.values(details)) expect(Number.isInteger(value) && value >= 0).toBe(true)
  })

  it('is the same from the same seed and the same input', () => {
    const play = () => {
      let state = updateBrickBreaker(createBrickBreakerGame(99), { type: 'launch' })
      for (let i = 0; i < 20 * 60; i++) state = advance(updateBrickBreaker(state, { type: 'aim', x: 200 + Math.sin(i / 20) * 150 }), 1000 / 60)
      return state
    }
    expect(play()).toEqual(play())
  })

  it('can be driven through the engine object', () => {
    const engine = createBrickBreakerEngine(SEED)
    engine.movePaddle(250)
    engine.startGame()
    engine.update(500)
    expect(engine.getState().phase).toBe('playing')
    expect(engine.isGameOver()).toBe(false)
    expect(engine.isLevelComplete()).toBe(false)
    expect(engine.getScore()).toBe(engine.getState().score)
  })
})
