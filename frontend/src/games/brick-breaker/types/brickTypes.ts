/**
 * Brick Breaker's state, as plain data. The engine (`engine/brickEngine.ts`) is the only thing that
 * changes it; the screen, the effects, the AI and the tests only read it.
 *
 * Positions are world units on a 400 × 600 arena (x to the right, y downwards); times are
 * milliseconds of game time, which stops while paused.
 */

export type BrickKind = 'normal' | 'tough' | 'armored' | 'special'

export interface Brick {
  /** Unique within a level: row × columns + column. */
  id: number
  row: number
  col: number
  x: number
  y: number
  width: number
  height: number
  kind: BrickKind
  hp: number
  maxHp: number
}

export interface Ball {
  id: number
  x: number
  y: number
  vx: number
  vy: number
}

export interface Paddle {
  /** Centre of the paddle. Its top edge is at `PADDLE_Y`. */
  x: number
  width: number
  /** Where the pointer wants it, or `null`. */
  target: number | null
  /** Held keys: −1 left, 1 right, 0 none. */
  direction: -1 | 0 | 1
  /** How far it moved in the last step, for the magnet. */
  velocity: number
}

export type PowerUpKind =
  | 'extraBall'
  | 'twoBalls'
  | 'multiBall'
  | 'doubleScore'
  | 'widePaddle'
  | 'fireball'
  | 'laser'
  | 'magnet'
  | 'extraLife'

/** The power-ups that last a while, rather than happening once. */
export type TimedPowerUp = 'doubleScore' | 'widePaddle' | 'fireball' | 'laser' | 'magnet'

/** A power-up falling from a destroyed brick, waiting to be caught. */
export interface Drop {
  id: number
  kind: PowerUpKind
  x: number
  y: number
}

/** A laser shot from the paddle. */
export interface Bolt {
  id: number
  x: number
  y: number
}

export type GamePhase =
  /** The ball rests on the paddle, waiting to be launched. */
  | 'serving'
  | 'playing'
  /** The level is cleared: its bonus is shown, then the next level begins. */
  | 'cleared'
  | 'over'

export interface LevelBonus {
  level: number
  base: number
  lives: number
  combo: number
  time: number
  perfect: number
  total: number
}

/** What happened during the last `advance`: the hooks for effects (and, later, sounds). */
export type BrickEvent =
  | { type: 'launch' }
  | { type: 'paddle'; x: number }
  | { type: 'brickHit'; brickId: number; x: number; y: number; points: number }
  | { type: 'brickDestroyed'; brickId: number; kind: BrickKind; x: number; y: number; points: number; combo: number; cause: 'ball' | 'fire' | 'laser' }
  | { type: 'combo'; combo: number }
  | { type: 'drop'; kind: PowerUpKind; x: number; y: number }
  | { type: 'collect'; kind: PowerUpKind; x: number; y: number }
  | { type: 'missedDrop'; kind: PowerUpKind }
  | { type: 'laser'; x: number; y: number }
  | { type: 'ballLost'; x: number }
  | { type: 'lifeLost'; lives: number }
  | { type: 'levelClear'; bonus: LevelBonus }
  | { type: 'levelStart'; level: number }
  | { type: 'gameOver' }

/** Totals for the run, reported with its score. */
export interface RunStats {
  bricks: number
  maxCombo: number
  powerUps: number
  fireBricks: number
  laserBricks: number
  livesLost: number
  perfectClears: number
  /** The most balls in play at once. */
  maxBalls: number
}

export interface BrickState {
  phase: GamePhase
  /** The run's seed; power-up drops and Endless levels come from it. */
  initialSeed: number
  /** The random generator's current state. */
  seed: number
  level: number
  levelName: string
  /** The ball's speed on this level. */
  speed: number
  parSeconds: number
  bricks: Brick[]
  balls: Ball[]
  paddle: Paddle
  drops: Drop[]
  bolts: Bolt[]
  /** Time left on each active timed power-up. */
  effects: Partial<Record<TimedPowerUp, number>>
  laserCooldownMs: number
  lives: number
  score: number
  combo: number
  /** Time since the last brick was destroyed, for the combo. */
  comboIdleMs: number
  /** Time spent serving (the ball launches itself after a while). */
  serveMs: number
  /** Time spent on the level-clear screen. */
  clearMs: number
  /** Time spent playing this level, for its time bonus. */
  levelMs: number
  levelLivesLost: number
  levelMaxCombo: number
  lastBonus: LevelBonus | null
  stats: RunStats
  /** Fixed steps simulated since the run began. */
  steps: number
  elapsedMs: number
  pendingMs: number
  /** The next id for a ball, drop or bolt. */
  nextId: number
  /** Paddle bounces since the last brick was hit: the ball starts leaning towards the bricks after two. */
  idleBounces: number
  /** A launch was asked for and happens on the next step. */
  launchRequested: boolean
  /**
   * Whether the run has begun: the first serve waits for the player, and game time counts from the
   * first launch.
   */
  started: boolean
  events: BrickEvent[]
}

export type BrickAction =
  /** Pointer or touch: the paddle heads for this x. */
  | { type: 'aim'; x: number }
  /** Keys: move left, right, or stop. */
  | { type: 'steer'; direction: -1 | 0 | 1 }
  | { type: 'launch' }
  | { type: 'tick'; ms: number }
