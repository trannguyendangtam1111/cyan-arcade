/**
 * The shapes of everything that can collide, as pixel masks: one string per row, `.` for an empty
 * pixel and a letter for a filled one. The letter says which part a pixel is (outline, body,
 * belly…), which only the renderer cares about: skins colour the parts, they never change a shape.
 *
 * Collision uses these masks row by row (see `collision.ts`), so what collides is exactly what is
 * drawn: no invisible padding around a sprite, and no drawn pixel that cannot be hit.
 *
 * Pip the runner is an original chubby dinosaur, facing right; the obstacles are a mound, a pillar
 * and a little bat. One mask pixel is {@link PX} world units.
 */

/** World units per mask pixel. */
export const PX = 2

export interface Mask {
  /** Unique: pictures of it are cached under it. */
  name: string
  rows: readonly string[]
  columns: number
  /** For each row, the first and last filled column, or `null` for an empty row. */
  spans: readonly (readonly [number, number] | null)[]
  /** Size in world units. */
  width: number
  height: number
}

export function mask(name: string, rows: readonly string[]): Mask {
  const columns = rows[0].length
  if (rows.some((row) => row.length !== columns)) throw new Error('A mask is a rectangle of pixels')
  const spans = rows.map((row): readonly [number, number] | null => {
    const first = row.search(/[^.]/)
    if (first < 0) return null
    let last = row.length - 1
    while (row[last] === '.') last--
    return [first, last]
  })
  return { name, rows, columns, spans, width: columns * PX, height: rows.length * PX }
}

// --- Pip, the runner -------------------------------------------------------------------------------
// o outline, b body, l belly, s spikes, c cheek, w eye shine, e eye.

const HEAD_AND_BODY = [
  '......oooooooo..',
  '.....obbbbbbbbo.',
  '....obbbbbbbbbbo',
  '....obbbbbbwebbo',
  '....obbbbbbeebbo',
  '....obbbcbbbbbbo',
  '.s..obbbbbbbbooo',
  'ssoobbbbbbbbo...',
  '.sbbbbbbbbbbo...',
  '.obbbbbbbbbbbo..',
  'obbbbbbllllbbbo.',
  'obbbbbllllllbo..',
  '.obbbbllllllbo..',
  '..obbbllllllbo..',
  '...obbbllllbbo..',
  '....obbbbbbbo...',
  '.....obbbbbo....',
]

/** Running, legs apart. */
export const RUN_A = mask('run-a', [...HEAD_AND_BODY, '.....obo.obo....', '.....obo..oo....', '....ooo...oo....'])
/** Running, legs crossing. */
export const RUN_B = mask('run-b', [...HEAD_AND_BODY, '.....obo.obo....', '.....oo..obo....', '.....oo..ooo....'])
/** In the air, legs tucked. */
export const JUMP = mask('jump', [...HEAD_AND_BODY, '.....oboobo.....', '......oo.oo.....', '................'])

const DUCK_BODY = [
  '............ooooooo...',
  '...........obbbbbbbo..',
  '.s..ooooooobbbbbwebo..',
  'ssoobbbbbbbbbbbbeebo..',
  '.sbbbbbbbbbbbbcbbbbooo',
  '.obbbbbbbbbbbbbbbbo...',
  'obbbbbllllllllbbbo....',
  'obbbbllllllllllbo.....',
  '.obbbbbbbbbbbbbo......',
  '..obbbo....obbbo......',
]

/** Ducking low, legs apart and crossing. */
export const DUCK_A = mask('duck-a', [...DUCK_BODY, '..obo......obo........', '..oo.......oo.........'])
export const DUCK_B = mask('duck-b', [...DUCK_BODY, '...obo.....obo........', '...oo......ooo........'])

// --- Obstacles ---------------------------------------------------------------------------------------
// o outline, a main colour, b shade, c light, d accent.

/** A low mound: jump over it. */
export const MOUND = mask('mound', [
  '...oooooo...',
  '..oaaaaaao..',
  '.oaccaaaaao.',
  '.oacaaaadao.',
  'oaaaaaaaaaao',
  'oaaadaaaaaao',
  'oaaaaaaaaabo',
  'oaaaaaaaabbo',
  'oaadaaaaabbo',
  'oaaaaaaabbbo',
  'oaaaaaaaabbo',
  'obaaaadaabbo',
  'obbaaaaabbbo',
  'obbbbbbbbbbo',
  'obbbbbbbbbbo',
  'oooooooooooo',
])

const PILLAR_SHAFT = '.oacaaaaabo.'
const PILLAR_BAND = '.oddddddddo.'

/** A tall pillar: jump early enough to clear it. */
export const PILLAR = mask('pillar', [
  '....oooo....',
  '...oaaaao...',
  '..oacaaaao..',
  '..oacaaabo..',
  ...Array.from({ length: 20 }, (_, row) => (row % 6 === 2 ? PILLAR_BAND : PILLAR_SHAFT)),
  'oaaaaaaaaabo',
  'oooooooooooo',
])

/** A little bat, wings up and wings down. It flies at a fixed height. */
export const BAT_UP = mask('bat-up', [
  'o..............o',
  'oo....oooo....oo',
  'obo..oaaaao..obo',
  'obbooaeaeaaoobbo',
  'obbbbaaaaaabbbbo',
  '.obbbaacaaabbbo.',
  '..ooobaaaabooo..',
  '.....oaaaao.....',
  '......o..o......',
  '................',
])

export const BAT_DOWN = mask('bat-down', [
  '................',
  '......oooo......',
  '.....oaaaao.....',
  '....oaeaeaao....',
  'oooooaaaaaaooooo',
  'obbbbaacaaabbbbo',
  'obbbobaaaabobbbo',
  '.obo.oaaaao.obo.',
  '..o...o..o...o..',
  '................',
])

/** Mounds side by side, one empty column apart: a group to clear in one jump. */
export function mounds(count: number): Mask {
  const rows = MOUND.rows.map((row) => Array.from({ length: count }, () => row).join('.'))
  return mask(`mounds-${count}`, rows)
}

const GROUPS = new Map<number, Mask>([1, 2, 3].map((count) => [count, mounds(count)]))

export function moundGroup(count: number): Mask {
  return GROUPS.get(count) ?? mounds(count)
}
