import { nextRandom, randomInt } from '@/games/shared/random'
import type { BrickKind } from '../types/brickTypes'
import { GRID } from './arena'

/**
 * Brick Breaker's levels: eight handcrafted ones, each with its own idea, then Endless, made from the
 * run's seed with a few reusable patterns.
 *
 * A layout is one string per row, one character per column:
 * `.` empty, `1` normal (1 hit), `2` tough (2), `3` armored (3), `S` special (1 hit, always drops a
 * power-up). Every brick can be destroyed, so no layout can trap the game.
 *
 * Difficulty rises a different way at each step rather than everything at once: the first levels
 * teach, the middle ones add tougher bricks and denser shapes, the last ones are fast and armored.
 * The server's rules (`gamerules/BrickBreakerRunRules.java`) know each handcrafted level's brick
 * count and Endless's limits: change them together.
 */

export interface LevelDefinition {
  level: number
  name: string
  /** One-line flavour, shown when the level begins. */
  tagline: string
  /** The ball's speed, units per second. */
  speed: number
  rows: string[]
  /** Seconds a good clear takes; finishing sooner earns a time bonus. */
  parSeconds: number
}

const HANDCRAFTED: readonly LevelDefinition[] = [
  {
    level: 1,
    name: 'Cute Sakura',
    tagline: 'Get a feel for the paddle.',
    speed: 300,
    parSeconds: 70,
    rows: ['1111111111', '1111111111', '1111S11111', '.11111111.', '..111111..'],
  },
  {
    level: 2,
    name: 'Kawaii Candy',
    tagline: 'Tough bricks take two hits.',
    speed: 320,
    parSeconds: 75,
    rows: ['2........2', '22.1111.22', '2211SS1122', '22.1111.22', '2........2', '..111111..', '..1.11.1..'],
  },
  {
    level: 3,
    name: 'Anime Café',
    tagline: 'Long lines: keep the combo going.',
    speed: 340,
    parSeconds: 80,
    rows: ['1.1.1.1.1.', '.2.2.2.2.2', '1111111111', '..........', '2211221122', '.1S1..1S1.', '1111111111'],
  },
  {
    level: 4,
    name: 'Magical Galaxy',
    tagline: 'Armored bricks take three.',
    speed: 355,
    parSeconds: 85,
    rows: ['....11....', '..122221..', '.12233221.', '1223SS3221', '.12233221.', '..122221..', '....11....', '1........1', '.1......1.'],
  },
  {
    level: 5,
    name: 'Kitsune Shrine',
    tagline: 'Dense, hot and faster.',
    speed: 380,
    parSeconds: 95,
    rows: ['2.2.22.2.2', '1212112121', '2121SS1212', '1212112121', '2222222222', '1111111111', '3........3'],
  },
  {
    level: 6,
    name: 'Cyber Anime',
    tagline: 'Gaps everywhere, armor in the walls.',
    speed: 400,
    parSeconds: 100,
    rows: ['2323232323', '1.1.1.1.1.', '.1.1.1.1.1', '3322SS2233', '1.1.1.1.1.', '.1.1.1.1.1', '2222..2222'],
  },
  {
    level: 7,
    name: 'Fantasy Dragon',
    tagline: 'Break into the core.',
    speed: 415,
    parSeconds: 110,
    rows: ['3121111213', '1........1', '1.222222.1', '1.2S33S2.1', '1.222222.1', '1........1', '3121111213', '2222222222'],
  },
  {
    level: 8,
    name: 'Dark Moon',
    tagline: 'The fortress. Good luck.',
    speed: 430,
    parSeconds: 130,
    rows: [
      '3333333333',
      '3222222223',
      '32.1111.23',
      '32.1SS1.23',
      '32.1111.23',
      '3222222223',
      '3.3.33.3.3',
      '2222222222',
      '1111111111',
    ],
  },
]

export const HANDCRAFTED_LEVELS = HANDCRAFTED.length

/** Endless's hard limits: it gets harder for a while, then stays at its hardest. */
export const ENDLESS = {
  firstLevel: HANDCRAFTED.length + 1,
  minBricks: 36,
  maxBricks: 96,
  maxRows: 10,
  baseSpeed: 435,
  speedPerLevel: 4,
  maxSpeed: 470,
  /** Shares of tough and armored bricks, growing per level up to their caps. */
  toughShare: { start: 0.25, perLevel: 0.03, max: 0.45 },
  armoredShare: { start: 0.1, perLevel: 0.03, max: 0.35 },
} as const

export const KIND_OF: Record<string, BrickKind | undefined> = { '1': 'normal', '2': 'tough', '3': 'armored', S: 'special' }
export const HP_OF: Record<BrickKind, number> = { normal: 1, tough: 2, armored: 3, special: 1 }

/** The handcrafted levels' brick counts, in order: what the server's rules check progress against. */
export const handcraftedBrickCounts = (): number[] => HANDCRAFTED.map((level) => countBricks(level.rows))

export function countBricks(rows: readonly string[]): number {
  return rows.reduce((sum, row) => sum + [...row].filter((cell) => KIND_OF[cell]).length, 0)
}

/** A level by number: handcrafted up to 8, then Endless, the same for the same seed. */
export function levelDefinition(level: number, runSeed: number): LevelDefinition {
  if (level <= HANDCRAFTED.length) return HANDCRAFTED[level - 1]
  return endlessLevel(level, runSeed)
}

/** Endless pieces: each says whether a cell has a brick in it. */
const PATTERNS: readonly ((row: number, col: number, rows: number) => boolean)[] = [
  // Checkerboard.
  (row, col) => (row + col) % 2 === 0,
  // Stripes with gaps.
  (row, col) => row % 2 === 0 || col % 3 === 1,
  // A diamond.
  (row, col, rows) => Math.abs(col - 4.5) + Math.abs(row - (rows - 1) / 2) <= rows / 2 + 1.5,
  // A pyramid.
  (row, col) => Math.abs(col - 4.5) <= row + 0.5,
  // Columns.
  (_, col) => col % 3 !== 2,
  // Rings.
  (row, col, rows) => row === 0 || row === rows - 1 || col === 0 || col === 9 || (row === Math.floor(rows / 2) && col > 2 && col < 7),
  // Waves.
  (row, col) => Math.abs(Math.round(Math.sin(col * 0.9) * 1.5) + 2 - (row % 4)) <= 1,
  // Full block.
  () => true,
]

function endlessLevel(level: number, runSeed: number): LevelDefinition {
  const depth = level - ENDLESS.firstLevel
  // A seed for this level alone, from the run's seed: the same run always gets the same Endless.
  let seed = (runSeed ^ Math.imul(level, 0x9e3779b1)) >>> 0
  const roll = (max: number) => {
    const result = randomInt(seed, max)
    seed = result.seed
    return result.value
  }
  const chance = () => {
    const result = nextRandom(seed)
    seed = result.seed
    return result.value
  }

  const rows = Math.min(6 + Math.floor(depth / 2), ENDLESS.maxRows)
  const first = PATTERNS[roll(PATTERNS.length)]
  const second = PATTERNS[roll(PATTERNS.length)]
  const mirror = roll(2) === 0
  const tough = Math.min(ENDLESS.toughShare.start + ENDLESS.toughShare.perLevel * depth, ENDLESS.toughShare.max)
  const armored = Math.min(ENDLESS.armoredShare.start + ENDLESS.armoredShare.perLevel * depth, ENDLESS.armoredShare.max)

  const filled: boolean[][] = []
  for (let row = 0; row < rows; row++) {
    filled.push([])
    for (let col = 0; col < GRID.columns; col++) {
      const c = mirror && col >= 5 ? 9 - col : col
      filled[row].push(row % 2 === 0 ? first(row, c, rows) : first(row, c, rows) || second(row, c, rows))
    }
  }
  // Keep the count within Endless's limits: fill from the top, or empty from the bottom.
  const cells = filled.flat()
  let count = cells.filter(Boolean).length
  for (let i = 0; count < ENDLESS.minBricks && i < cells.length; i++) {
    if (!cells[i]) {
      cells[i] = true
      count++
    }
  }
  for (let i = cells.length - 1; count > ENDLESS.maxBricks && i >= 0; i--) {
    if (cells[i]) {
      cells[i] = false
      count--
    }
  }

  let specials = 0
  const layout: string[] = []
  for (let row = 0; row < rows; row++) {
    let text = ''
    for (let col = 0; col < GRID.columns; col++) {
      if (!cells[row * GRID.columns + col]) {
        text += '.'
        continue
      }
      const r = chance()
      if (specials < 2 && r < 0.03) {
        specials++
        text += 'S'
      } else if (r < 0.03 + armored) text += '3'
      else if (r < 0.03 + armored + tough) text += '2'
      else text += '1'
    }
    layout.push(text)
  }

  const speed = Math.min(ENDLESS.baseSpeed + ENDLESS.speedPerLevel * depth, ENDLESS.maxSpeed)
  return {
    level,
    name: `Endless ${depth + 1}`,
    tagline: 'How far can you go?',
    speed,
    rows: layout,
    parSeconds: Math.round(45 + countBricks(layout) * 1.2),
  }
}
