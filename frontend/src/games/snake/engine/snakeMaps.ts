import type { Direction, Point } from '../types/snakeTypes'

/**
 * Snake maps: fixed wall layouts on the standard 16x16 board.
 *
 * Each layout is drawn as text, one string per row: `#` is a wall, `.` is a free cell. Walls are fatal,
 * like the board edge, and the board never wraps around. Classic is not a map: it is the board with no
 * walls, created without a `map` option.
 */

export type SnakeMapId = 'pillars' | 'tunnels' | 'rooms'

export interface SnakeMap {
  id: SnakeMapId
  name: string
  width: number
  height: number
  /** Wall cells, in row-major order. */
  walls: readonly Point[]
  /** The starting body, head first, and the direction it faces. */
  start: { snake: readonly Point[]; direction: Direction }
}

/** Free cells the snake must have straight ahead of its head when a map starts. */
export const START_CLEARANCE = 3

function defineMap(
  id: SnakeMapId,
  name: string,
  layout: readonly string[],
  start: SnakeMap['start'],
): SnakeMap {
  const height = layout.length
  const width = layout[0].length
  const walls: Point[] = []
  layout.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Map '${id}': row ${y} is ${row.length} cells wide, expected ${width}`)
    ;[...row].forEach((cell, x) => {
      if (cell === '#') walls.push({ x, y })
      else if (cell !== '.') throw new Error(`Map '${id}': unknown cell '${cell}' at (${x}, ${y})`)
    })
  })
  return { id, name, width, height, walls, start }
}

/** The Classic start: head in the middle, three cells long, heading right. */
const CENTRE_START: SnakeMap['start'] = {
  snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }],
  direction: 'RIGHT',
}

/** Four 2x2 blocks, one in each quarter. */
const PILLARS = defineMap(
  'pillars',
  'Pillars',
  [
    '................',
    '................',
    '................',
    '...##......##...',
    '...##......##...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...##......##...',
    '...##......##...',
    '................',
    '................',
    '................',
  ],
  CENTRE_START,
)

/** Two full-width bars, each with two 2-wide gaps, staggered so the bands do not line up. */
const TUNNELS = defineMap(
  'tunnels',
  'Tunnels',
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '####..####..####',
    '................',
    '................',
    '................',
    '................',
    '##..########..##',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  CENTRE_START,
)

/** Four 7x7 rooms behind a 2-thick cross, joined by one 2-wide door on each arm. */
const ROOMS = defineMap(
  'rooms',
  'Rooms',
  [
    '.......##.......',
    '.......##.......',
    '.......##.......',
    '................',
    '................',
    '.......##.......',
    '.......##.......',
    '###..######..###',
    '###..######..###',
    '.......##.......',
    '.......##.......',
    '................',
    '................',
    '.......##.......',
    '.......##.......',
    '.......##.......',
  ],
  // Top-left room, facing the door into the top-right room.
  { snake: [{ x: 4, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 3 }], direction: 'RIGHT' },
)

export const SNAKE_MAPS: readonly SnakeMap[] = [PILLARS, TUNNELS, ROOMS]

export function snakeMap(id: SnakeMapId): SnakeMap {
  const map = SNAKE_MAPS.find((candidate) => candidate.id === id)
  if (!map) throw new Error(`Unknown Snake map '${id}'`)
  return map
}

/** Cells the snake can ever occupy. */
export function freeCellCount(map: SnakeMap): number {
  return map.width * map.height - map.walls.length
}

/** The highest score a run on this map can reach: every free cell filled, minus the starting body. */
export function mapMaxScore(map: SnakeMap): number {
  return freeCellCount(map) - map.start.snake.length
}

const STEPS: Record<Direction, Point> = { UP: { x: 0, y: -1 }, RIGHT: { x: 1, y: 0 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 } }

/**
 * Everything wrong with a map, or an empty list. A valid map:
 * - has all its free cells in one connected region;
 * - has no dead ends: every free cell has at least two free neighbours;
 * - starts the snake on free, connected cells, with {@link START_CLEARANCE} free cells ahead of the head.
 */
export function mapProblems(map: SnakeMap): string[] {
  const { width, height } = map
  const problems: string[] = []
  const wall = new Uint8Array(width * height)
  for (const cell of map.walls) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) problems.push(`wall (${cell.x}, ${cell.y}) is off the board`)
    else wall[cell.y * width + cell.x] = 1
  }
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && wall[y * width + x] === 0
  const neighbours = (x: number, y: number) => Object.values(STEPS).map((d) => ({ x: x + d.x, y: y + d.y }))

  let first: Point | null = null
  let freeCount = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!free(x, y)) continue
      freeCount++
      first ??= { x, y }
      const exits = neighbours(x, y).filter((n) => free(n.x, n.y)).length
      if (exits < 2) problems.push(`free cell (${x}, ${y}) is a dead end`)
    }
  }

  if (first) {
    const seen = new Uint8Array(width * height)
    seen[first.y * width + first.x] = 1
    const stack = [first]
    let reached = 1
    while (stack.length > 0) {
      const current = stack.pop()!
      for (const n of neighbours(current.x, current.y)) {
        if (!free(n.x, n.y) || seen[n.y * width + n.x]) continue
        seen[n.y * width + n.x] = 1
        reached++
        stack.push(n)
      }
    }
    if (reached !== freeCount) problems.push(`free cells are split: ${reached} of ${freeCount} connected`)
  }

  const { snake, direction } = map.start
  snake.forEach((cell, index) => {
    if (!free(cell.x, cell.y)) problems.push(`start cell ${index} (${cell.x}, ${cell.y}) is not free`)
    const next = snake[index + 1]
    if (next && Math.abs(cell.x - next.x) + Math.abs(cell.y - next.y) !== 1) problems.push(`start cells ${index} and ${index + 1} are not adjacent`)
  })
  const head = snake[0]
  const behind = snake[1]
  if (head && behind && head.x + STEPS[direction].x === behind.x && head.y + STEPS[direction].y === behind.y) {
    problems.push('the start direction points back into the body')
  }
  for (let distance = 1; head && distance <= START_CLEARANCE; distance++) {
    const ahead = { x: head.x + STEPS[direction].x * distance, y: head.y + STEPS[direction].y * distance }
    if (!free(ahead.x, ahead.y)) problems.push(`no clear space ahead of the start: (${ahead.x}, ${ahead.y}) is blocked`)
  }
  return problems
}
