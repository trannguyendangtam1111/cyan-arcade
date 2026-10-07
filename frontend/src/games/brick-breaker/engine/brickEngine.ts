import type {
  Ball,
  Brick,
  BrickAction,
  BrickEvent,
  BrickState,
  PowerUpKind,
  TimedPowerUp,
} from '../types/brickTypes'
import { ARENA, BALL_RADIUS, cellOf, GRID, PADDLE } from './arena'
import { HP_OF, KIND_OF, levelDefinition } from './levels'
import { circleRectContact, constrainVelocity, MAGNET_LEAN, paddleBounce, rotateVelocity } from './physics'
import {
  BOLT_SPEED,
  DROP_SIZE,
  DROP_SPEED,
  LASER_COOLDOWN_MS,
  MAX_BALLS,
  MAX_LIVES,
  POWER_UPS,
  rollBrickDrop,
  TIMED_POWER_UPS,
} from './powerUps'
import { brickPoints, COMBO_TIMEOUT_MS, HIT_POINTS, isComboMilestone, levelBonus } from './scoring'

/**
 * Brick Breaker's rules as pure functions: `state in, new state out`, with no React, timers or
 * randomness of their own. Power-up drops and Endless levels come from the seed in the state; time
 * only moves when the caller says how much has passed.
 *
 * The world is simulated in fixed steps of {@link STEP_MS} (240 a second), whatever the frame rate,
 * so the same input at the same steps gives the same game at 30, 60 or 144 Hz. Game time (and the
 * step count) starts at the first launch: before it the paddle can move, but the run has not begun. At the fastest ball
 * speed a step moves a ball under 2 units, far less than its radius or any brick, so nothing can
 * pass through anything between two steps.
 */

export const STEP_MS = 1000 / 240
/** The most game time one call may simulate, so a stalled tab cannot make the game jump ahead. */
export const MAX_ADVANCE_MS = 1000
export const START_LIVES = 3
/** A ball waiting on the paddle launches itself after this long. */
export const AUTO_LAUNCH_MS = 2500
/** How long the level-clear screen stays before the next level. */
export const LEVEL_CLEAR_MS = 1800
const DEGREES = Math.PI / 180
/** A served ball leaves at this angle from the vertical, the way the paddle is moving. */
const LAUNCH_ANGLE = 18 * DEGREES
/** How much more each idle paddle bounce leans towards the bricks. */
const IDLE_LEAN = 6 * DEGREES
/** A hit this close to the paddle's middle (as a share of the half paddle) counts as not aimed. */
const CENTRE_HIT = 0.2
/** How far apart the balls a power-up makes fly, in angle. */
const SPLIT_ANGLE = 22 * DEGREES

/** Input from a controller (the AI) for one step: where to aim the paddle, and whether to launch. */
export interface StepInput {
  aim?: number
  launch?: boolean
}

/**
 * A new run, the ball waiting on the paddle. Seeds are 31-bit, like the run's other numbers. Runs
 * always begin on level 1; `startLevel` is for tests and practice scenarios only.
 */
export function createBrickBreakerGame(seed: number, startLevel = 1): BrickState {
  const start = (seed >>> 0) & 0x7fffffff
  const state: BrickState = {
    phase: 'serving',
    initialSeed: start,
    seed: start,
    level: 0,
    levelName: '',
    speed: 0,
    parSeconds: 0,
    bricks: [],
    balls: [],
    paddle: { x: ARENA.width / 2, width: PADDLE.width, target: null, direction: 0, velocity: 0 },
    drops: [],
    bolts: [],
    effects: {},
    laserCooldownMs: 0,
    lives: START_LIVES,
    score: 0,
    combo: 0,
    comboIdleMs: 0,
    serveMs: 0,
    clearMs: 0,
    levelMs: 0,
    levelLivesLost: 0,
    levelMaxCombo: 0,
    lastBonus: null,
    stats: { bricks: 0, maxCombo: 0, powerUps: 0, fireBricks: 0, laserBricks: 0, livesLost: 0, perfectClears: 0, maxBalls: 1 },
    steps: 0,
    elapsedMs: 0,
    pendingMs: 0,
    nextId: 1,
    idleBounces: 0,
    launchRequested: false,
    started: false,
    events: [],
  }
  loadLevel(state, startLevel)
  state.events = []
  return state
}

/** Every change to a game, as one function: the screen and the tests use it alike. */
export function updateBrickBreaker(state: BrickState, action: BrickAction): BrickState {
  switch (action.type) {
    case 'aim': {
      const next = { ...state, paddle: { ...state.paddle } }
      applyInput(next, { aim: action.x })
      return next
    }
    case 'steer':
      return { ...state, paddle: { ...state.paddle, direction: action.direction, target: action.direction === 0 ? state.paddle.target : null } }
    case 'launch': {
      if (state.phase !== 'serving') return state
      const next = { ...state }
      applyInput(next, { launch: true })
      return next
    }
    case 'tick':
      return advance(state, action.ms)
  }
}

/**
 * Lets `ms` of game time pass. `control`, when given, is asked before every step for that step's
 * input: that is how the AI plays, with the same steps as a human. A human's input comes in between
 * calls instead, through {@link updateBrickBreaker}. The events of these steps replace the last ones.
 */
export function advance(state: BrickState, ms: number, control?: (state: Readonly<BrickState>) => StepInput): BrickState {
  if (state.phase === 'over' || !(ms > 0)) return state.events.length > 0 ? { ...state, events: [] } : state
  const next = copy(state)
  next.events = []
  next.pendingMs += Math.min(ms, MAX_ADVANCE_MS)
  while (next.pendingMs >= STEP_MS && next.phase !== 'over') {
    next.pendingMs -= STEP_MS
    if (control) applyInput(next, control(next))
    step(next)
  }
  if (next.phase === 'over') next.pendingMs = 0
  return next
}

/**
 * Input, applied the same way for a player's pointer and launch and for the AI's: it only ever
 * moves the paddle and serves the ball, and never touches bricks, drops or the random sequence.
 */
function applyInput(state: BrickState, input: StepInput): void {
  if (input.aim !== undefined) {
    state.paddle.target = clampPaddle(input.aim, state.paddle.width)
    state.paddle.direction = 0
  }
  if (input.launch && state.phase === 'serving') state.launchRequested = true
}

export const isGameOver = (state: BrickState): boolean => state.phase === 'over'
export const isLevelComplete = (state: BrickState): boolean => state.phase === 'cleared'
export const scoreOf = (state: BrickState): number => state.score

/**
 * What a finished run reports to the platform: a few whole numbers, never the frames. The server
 * checks them against each other, against the levels' brick counts and against its own clock.
 */
export function runDetails(state: BrickState): Record<string, number> {
  const { stats } = state
  return {
    level: state.level,
    bricks: stats.bricks,
    maxCombo: stats.maxCombo,
    powerUps: stats.powerUps,
    maxBalls: stats.maxBalls,
    fireBricks: stats.fireBricks,
    laserBricks: stats.laserBricks,
    livesLost: stats.livesLost,
    perfectClears: stats.perfectClears,
    gameMs: Math.round(state.elapsedMs),
  }
}

/**
 * A game as an object, for code that prefers methods to threading states:
 * `const engine = createBrickBreakerEngine(seed); engine.startGame(); engine.update(16)`.
 */
export function createBrickBreakerEngine(seed: number) {
  let state = createBrickBreakerGame(seed)
  return {
    startGame: () => {
      state = updateBrickBreaker(state, { type: 'launch' })
    },
    update: (deltaMs: number) => {
      state = advance(state, deltaMs)
    },
    movePaddle: (x: number) => {
      state = updateBrickBreaker(state, { type: 'aim', x })
    },
    steer: (direction: -1 | 0 | 1) => {
      state = updateBrickBreaker(state, { type: 'steer', direction })
    },
    getState: (): BrickState => state,
    getScore: () => scoreOf(state),
    isGameOver: () => isGameOver(state),
    isLevelComplete: () => isLevelComplete(state),
  }
}

// --- One step -----------------------------------------------------------------------------------

function step(state: BrickState): void {
  const dt = STEP_MS / 1000
  movePaddle(state, dt)

  switch (state.phase) {
    case 'serving':
      state.serveMs += STEP_MS
      restOnPaddle(state)
      // The first serve waits for the player; later ones launch themselves after a while.
      if (state.launchRequested || (state.started && state.serveMs >= AUTO_LAUNCH_MS)) launch(state)
      break
    case 'playing':
      play(state, dt)
      break
    case 'cleared':
      state.clearMs += STEP_MS
      if (state.clearMs >= LEVEL_CLEAR_MS) loadLevel(state, state.level + 1)
      break
    case 'over':
      return
  }
  state.launchRequested = false
  if (state.started) {
    state.steps++
    state.elapsedMs = state.steps * STEP_MS
  }
}

function play(state: BrickState, dt: number): void {
  state.levelMs += STEP_MS

  for (const kind of TIMED_POWER_UPS) {
    const left = state.effects[kind]
    if (left === undefined) continue
    if (left - STEP_MS <= 0) delete state.effects[kind]
    else state.effects[kind] = left - STEP_MS
  }
  setPaddleWidth(state, state.effects.widePaddle ? PADDLE.wideWidth : PADDLE.width)

  state.comboIdleMs += STEP_MS
  if (state.combo > 0 && state.comboIdleMs > COMBO_TIMEOUT_MS) state.combo = 0

  if (state.effects.laser !== undefined) {
    state.laserCooldownMs -= STEP_MS
    if (state.laserCooldownMs <= 0) {
      state.laserCooldownMs = LASER_COOLDOWN_MS
      for (const side of [-1, 1]) {
        const x = state.paddle.x + side * (state.paddle.width / 2 - 8)
        state.bolts.push({ id: state.nextId++, x, y: PADDLE.y })
      }
      state.events.push({ type: 'laser', x: state.paddle.x, y: PADDLE.y })
    }
  }

  for (const ball of [...state.balls]) moveBall(state, ball, dt)
  state.balls = state.balls.filter((ball) => ball.y - BALL_RADIUS <= ARENA.height)
  moveBolts(state, dt)
  moveDrops(state, dt)
  state.stats.maxBalls = Math.max(state.stats.maxBalls, state.balls.length)

  if (state.balls.length === 0) loseLife(state)
  else if (state.bricks.length === 0) clearLevel(state)
}

function moveBall(state: BrickState, ball: Ball, dt: number): void {
  const r = BALL_RADIUS
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  // Walls: the sides and the top (the bottom is open). A ball that went past one is reflected back,
  // the way it would have bounced in between steps, so no distance is lost.
  if (ball.x - r < 0) {
    ball.x = 2 * r - ball.x
    ball.vx = Math.abs(ball.vx)
  } else if (ball.x + r > ARENA.width) {
    ball.x = 2 * (ARENA.width - r) - ball.x
    ball.vx = -Math.abs(ball.vx)
  }
  if (ball.y - r < ARENA.top) {
    ball.y = 2 * (ARENA.top + r) - ball.y
    ball.vy = Math.abs(ball.vy)
  }

  // Bricks.
  const fire = state.effects.fireball !== undefined
  const touched: { brick: Brick; contact: NonNullable<ReturnType<typeof circleRectContact>> }[] = []
  for (const brick of state.bricks) {
    if (Math.abs(brick.x + brick.width / 2 - ball.x) > brick.width / 2 + r) continue
    if (Math.abs(brick.y + brick.height / 2 - ball.y) > brick.height / 2 + r) continue
    const contact = circleRectContact(ball.x, ball.y, r, brick.x, brick.y, brick.width, brick.height)
    if (contact) touched.push({ brick, contact })
  }
  if (touched.length > 0) {
    if (fire) {
      // A fireball goes straight through, destroying whatever it touches.
      for (const { brick } of touched) destroy(state, brick, 'fire')
    } else {
      // Bounce off the deepest contact, flipping only the axis it faces, so the speed never changes.
      const deepest = touched.reduce((a, b) => (b.contact.depth > a.contact.depth ? b : a)).contact
      if (Math.abs(deepest.nx) > Math.abs(deepest.ny)) {
        if (ball.vx * deepest.nx < 0) ball.vx = -ball.vx
      } else if (ball.vy * deepest.ny < 0) ball.vy = -ball.vy
      // Push the ball out of every brick it is in, then damage each once.
      for (const { brick } of touched) {
        const again = circleRectContact(ball.x, ball.y, r, brick.x, brick.y, brick.width, brick.height)
        if (again) {
          ball.x += again.nx * (again.depth + 0.01)
          ball.y += again.ny * (again.depth + 0.01)
        }
      }
      for (const { brick } of touched) damage(state, brick, 'ball')
    }
  }

  // The paddle: only its top bounces a falling ball; a ball already past it is lost.
  const { paddle } = state
  if (ball.vy > 0 && ball.y <= PADDLE.y + PADDLE.height / 2) {
    const left = paddle.x - paddle.width / 2
    if (circleRectContact(ball.x, ball.y, r, left, PADDLE.y, paddle.width, PADDLE.height)) {
      const magnet = state.effects.magnet !== undefined ? Math.max(-1, Math.min(1, paddle.velocity / PADDLE.keySpeed)) * MAGNET_LEAN : 0
      state.idleBounces++
      const offset = (ball.x - paddle.x) / (paddle.width / 2)
      const bounce = paddleBounce(offset, state.speed, ball.vx, magnet + idleLean(state, ball.x, offset))
      ball.vx = bounce.vx
      ball.vy = bounce.vy
      ball.y = PADDLE.y - r - 0.01
      state.events.push({ type: 'paddle', x: ball.x })
    }
  }

  if (ball.y - r > ARENA.height) state.events.push({ type: 'ballLost', x: ball.x })
}

/**
 * After two paddle bounces in a row that hit no brick, each near-centre bounce leans a little more
 * towards the bricks left, so a ball can never settle into an endless path through an empty part of
 * the arena. A ball deliberately hit off-centre (aimed) is never bent.
 */
function idleLean(state: BrickState, x: number, offset: number): number {
  if (state.idleBounces < 3 || state.bricks.length === 0 || Math.abs(offset) >= CENTRE_HIT) return 0
  const centre = state.bricks.reduce((sum, brick) => sum + brick.x + brick.width / 2, 0) / state.bricks.length
  return Math.sign(centre - x) * Math.min(state.idleBounces - 2, 4) * IDLE_LEAN
}

function moveBolts(state: BrickState, dt: number): void {
  const kept = []
  for (const bolt of state.bolts) {
    bolt.y -= BOLT_SPEED * dt
    if (bolt.y < ARENA.top) continue
    const hit = state.bricks.find((brick) => bolt.x >= brick.x && bolt.x <= brick.x + brick.width && bolt.y >= brick.y && bolt.y <= brick.y + brick.height)
    if (hit) {
      damage(state, hit, 'laser')
      continue
    }
    kept.push(bolt)
  }
  state.bolts = kept
}

function moveDrops(state: BrickState, dt: number): void {
  const { paddle } = state
  const kept = []
  for (const drop of state.drops) {
    drop.y += DROP_SPEED * dt
    const caught =
      drop.y + DROP_SIZE.height / 2 >= PADDLE.y &&
      drop.y - DROP_SIZE.height / 2 <= PADDLE.y + PADDLE.height &&
      Math.abs(drop.x - paddle.x) <= paddle.width / 2 + DROP_SIZE.width / 2
    if (caught) {
      collect(state, drop.kind, drop.x, drop.y)
      continue
    }
    if (drop.y - DROP_SIZE.height / 2 > ARENA.height) {
      state.events.push({ type: 'missedDrop', kind: drop.kind })
      continue
    }
    kept.push(drop)
  }
  state.drops = kept
}

// --- Bricks, score and drops --------------------------------------------------------------------

function damage(state: BrickState, brick: Brick, cause: 'ball' | 'laser'): void {
  if (!state.bricks.includes(brick)) return
  state.idleBounces = 0
  if (brick.hp > 1) {
    brick.hp -= 1
    state.score += HIT_POINTS
    state.events.push({ type: 'brickHit', brickId: brick.id, x: brick.x + brick.width / 2, y: brick.y + brick.height / 2, points: HIT_POINTS })
    return
  }
  destroy(state, brick, cause)
}

function destroy(state: BrickState, brick: Brick, cause: 'ball' | 'fire' | 'laser'): void {
  const index = state.bricks.indexOf(brick)
  if (index < 0) return
  state.bricks.splice(index, 1)
  state.idleBounces = 0
  state.combo++
  state.comboIdleMs = 0
  state.levelMaxCombo = Math.max(state.levelMaxCombo, state.combo)
  state.stats.maxCombo = Math.max(state.stats.maxCombo, state.combo)
  state.stats.bricks++
  if (cause === 'fire') state.stats.fireBricks++
  if (cause === 'laser') state.stats.laserBricks++
  const points = brickPoints(brick.kind, state.combo, state.effects.doubleScore !== undefined)
  state.score += points
  const x = brick.x + brick.width / 2
  const y = brick.y + brick.height / 2
  state.events.push({ type: 'brickDestroyed', brickId: brick.id, kind: brick.kind, x, y, points, combo: state.combo, cause })
  if (isComboMilestone(state.combo)) state.events.push({ type: 'combo', combo: state.combo })

  // Every destroyed brick rolls once for a drop, however it was destroyed and whoever plays.
  const { kind, seed } = rollBrickDrop(state.seed, state.level, brick.kind)
  state.seed = seed
  if (kind) {
    state.drops.push({ id: state.nextId++, kind, x, y })
    state.events.push({ type: 'drop', kind, x, y })
  }
}

function collect(state: BrickState, kind: PowerUpKind, x: number, y: number): void {
  state.stats.powerUps++
  state.events.push({ type: 'collect', kind, x, y })
  const duration = POWER_UPS[kind].durationMs
  if (duration !== undefined) {
    // Catching a timed power-up again starts its time over; it never stacks.
    state.effects[kind as TimedPowerUp] = duration
    if (kind === 'laser') state.laserCooldownMs = 0
    if (kind === 'widePaddle') setPaddleWidth(state, PADDLE.wideWidth)
    return
  }
  switch (kind) {
    case 'extraLife':
      state.lives = Math.min(state.lives + 1, MAX_LIVES)
      break
    case 'extraBall':
      split(state, [state.balls[0]], [SPLIT_ANGLE])
      break
    case 'twoBalls':
      split(state, [state.balls[0]], [SPLIT_ANGLE, -SPLIT_ANGLE])
      break
    case 'multiBall': {
      // Every ball becomes three (MULTI_BALL_SPLIT): two more, one either side of it.
      split(state, [...state.balls], [SPLIT_ANGLE, -SPLIT_ANGLE])
      break
    }
  }
}

/** New balls from each source ball, turned by each angle, up to the limit. */
function split(state: BrickState, sources: (Ball | undefined)[], angles: number[]): void {
  for (const source of sources) {
    if (!source) continue
    for (const angle of angles) {
      if (state.balls.length >= MAX_BALLS) return
      const { vx, vy } = rotateVelocity(source.vx, source.vy, angle, state.speed)
      state.balls.push({ id: state.nextId++, x: source.x, y: source.y, vx, vy })
    }
  }
  state.stats.maxBalls = Math.max(state.stats.maxBalls, state.balls.length)
}

// --- Lives and levels ---------------------------------------------------------------------------

function loseLife(state: BrickState): void {
  state.lives--
  state.stats.livesLost++
  state.levelLivesLost++
  state.combo = 0
  state.effects = {}
  state.drops = []
  state.bolts = []
  setPaddleWidth(state, PADDLE.width)
  state.events.push({ type: 'lifeLost', lives: state.lives })
  if (state.lives <= 0) {
    state.phase = 'over'
    state.events.push({ type: 'gameOver' })
    return
  }
  serve(state)
}

function clearLevel(state: BrickState): void {
  const bonus = levelBonus(state.level, state.lives, state.levelMaxCombo, state.levelMs / 1000, state.parSeconds, state.levelLivesLost === 0)
  state.score += bonus.total
  if (bonus.perfect > 0) state.stats.perfectClears++
  state.lastBonus = bonus
  state.phase = 'cleared'
  state.clearMs = 0
  state.balls = []
  state.drops = []
  state.bolts = []
  state.effects = {}
  state.combo = 0
  setPaddleWidth(state, PADDLE.width)
  state.events.push({ type: 'levelClear', bonus })
}

function loadLevel(state: BrickState, level: number): void {
  const definition = levelDefinition(level, state.initialSeed)
  state.level = level
  state.levelName = definition.name
  state.speed = definition.speed
  state.parSeconds = definition.parSeconds
  state.bricks = []
  definition.rows.forEach((row, rowIndex) => {
    ;[...row].forEach((cell, col) => {
      const kind = KIND_OF[cell]
      if (!kind) return
      const { x, y } = cellOf(rowIndex, col)
      state.bricks.push({ id: rowIndex * GRID.columns + col, row: rowIndex, col, x, y, width: GRID.brickWidth, height: GRID.brickHeight, kind, hp: HP_OF[kind], maxHp: HP_OF[kind] })
    })
  })
  state.levelMs = 0
  state.levelLivesLost = 0
  state.levelMaxCombo = 0
  state.combo = 0
  state.effects = {}
  state.drops = []
  state.bolts = []
  setPaddleWidth(state, PADDLE.width)
  state.events.push({ type: 'levelStart', level })
  serve(state)
}

/** One ball on the paddle, waiting to be launched. */
function serve(state: BrickState): void {
  state.phase = 'serving'
  state.serveMs = 0
  state.idleBounces = 0
  state.balls = [{ id: state.nextId++, x: state.paddle.x, y: PADDLE.y - BALL_RADIUS - 0.01, vx: 0, vy: 0 }]
}

function restOnPaddle(state: BrickState): void {
  const ball = state.balls[0]
  if (!ball) return
  ball.x = state.paddle.x
  ball.y = PADDLE.y - BALL_RADIUS - 0.01
}

function launch(state: BrickState): void {
  const ball = state.balls[0]
  if (!ball) return
  const direction = state.paddle.velocity < 0 ? -1 : 1
  const { vx, vy } = constrainVelocity(direction * Math.sin(LAUNCH_ANGLE), -Math.cos(LAUNCH_ANGLE), state.speed)
  ball.vx = vx
  ball.vy = vy
  state.phase = 'playing'
  state.started = true
  state.events.push({ type: 'launch' })
}

// --- The paddle ---------------------------------------------------------------------------------

function movePaddle(state: BrickState, dt: number): void {
  const { paddle } = state
  const before = paddle.x
  if (paddle.target !== null) {
    const distance = paddle.target - paddle.x
    const reach = PADDLE.pointerSpeed * dt
    paddle.x += Math.max(-reach, Math.min(reach, distance))
  } else if (paddle.direction !== 0) {
    paddle.x += paddle.direction * PADDLE.keySpeed * dt
  }
  paddle.x = clampPaddle(paddle.x, paddle.width)
  paddle.velocity = (paddle.x - before) / dt
}

function setPaddleWidth(state: BrickState, width: number): void {
  state.paddle.width = width
  state.paddle.x = clampPaddle(state.paddle.x, width)
  if (state.paddle.target !== null) state.paddle.target = clampPaddle(state.paddle.target, width)
}

function clampPaddle(x: number, width: number): number {
  return Math.max(width / 2, Math.min(ARENA.width - width / 2, x))
}

function copy(state: BrickState): BrickState {
  return {
    ...state,
    bricks: state.bricks.map((brick) => ({ ...brick })),
    balls: state.balls.map((ball) => ({ ...ball })),
    paddle: { ...state.paddle },
    drops: state.drops.map((drop) => ({ ...drop })),
    bolts: state.bolts.map((bolt) => ({ ...bolt })),
    effects: { ...state.effects },
    stats: { ...state.stats },
  }
}

export type { BrickEvent }
