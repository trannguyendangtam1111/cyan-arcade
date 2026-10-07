/**
 * The pixel-art toolkit: everything in Brick Breaker is drawn as square art pixels, never smooth
 * shapes. Art is painted once with whole-pixel rectangles into a small offscreen canvas (a sprite)
 * and stretched onto the screen without smoothing, so it stays crisp at any size and costs one
 * `drawImage` a frame. Where there is no canvas to paint into (tests), the same paint runs straight
 * onto the screen.
 *
 * Only pictures live here: nothing in this file knows the game's rules.
 */

type Ctx = CanvasRenderingContext2D

/** World units per art pixel: bricks, the paddle, capsules and scenery are drawn on this grid. */
export const PX = 2

/** Paints art in its own pixels: (0, 0) is its top-left pixel and one unit is one art pixel. */
export type Paint = (g: Ctx) => void

const sprites = new Map<string, HTMLCanvasElement | null>()
/** More than any game draws at once; past it the cache starts again rather than grow for ever. */
const MAX_SPRITES = 800

function sprite(key: string, columns: number, rows: number, paint: Paint): HTMLCanvasElement | null {
  const known = sprites.get(key)
  if (known !== undefined) return known
  let canvas: HTMLCanvasElement | null = null
  if (typeof document !== 'undefined') {
    const made = document.createElement('canvas')
    made.width = columns
    made.height = rows
    const g = made.getContext('2d')
    if (g) {
      paint(g)
      canvas = made
    }
  }
  if (sprites.size >= MAX_SPRITES) sprites.clear()
  sprites.set(key, canvas)
  return canvas
}

/**
 * Draws `columns` × `rows` art pixels with their top-left at (x, y), each `unit` world units wide:
 * from the sprite cached under `key`, painted on first use.
 */
export function blit(ctx: Ctx, key: string, x: number, y: number, columns: number, rows: number, unit: number, paint: Paint): void {
  const canvas = sprite(key, columns, rows, paint)
  if (canvas) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, x, y, columns * unit, rows * unit)
    return
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(unit, unit)
  paint(ctx)
  ctx.restore()
}

/** Draws part of a cached picture (`sx`…`sw` of its pixels) into a box, without smoothing. */
export function blitPart(
  ctx: Ctx,
  key: string,
  columns: number,
  rows: number,
  paint: Paint,
  source: { x: number; y: number; w: number; h: number },
  box: { x: number; y: number; w: number; h: number },
): void {
  const canvas = sprite(key, columns, rows, paint)
  if (canvas) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, source.x, source.y, source.w, source.h, box.x, box.y, box.w, box.h)
    return
  }
  ctx.save()
  ctx.translate(box.x, box.y)
  ctx.scale(box.w / source.w, box.h / source.h)
  ctx.translate(-source.x, -source.y)
  paint(ctx)
  ctx.restore()
}

// --- Painting whole pixels ----------------------------------------------------------------------

export function rect(g: Ctx, x: number, y: number, w: number, h: number, colour: string): void {
  if (w <= 0 || h <= 0) return
  g.fillStyle = colour
  g.fillRect(x, y, w, h)
}

/** A filled disc of whole pixels. */
export function disc(g: Ctx, cx: number, cy: number, r: number, colour: string): void {
  g.fillStyle = colour
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt((r + 0.5) ** 2 - dy * dy))
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1)
  }
}

/** A filled ellipse of whole pixels. */
export function oval(g: Ctx, cx: number, cy: number, rx: number, ry: number, colour: string): void {
  g.fillStyle = colour
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)))
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1)
  }
}

/** A triangle with a flat bottom from `left` to `right` at `base`, rising to a point at (`tipX`, `tipY`). */
export function peak(g: Ctx, left: number, right: number, base: number, tipX: number, tipY: number, colour: string): void {
  g.fillStyle = colour
  const height = base - tipY
  for (let row = 0; row <= height; row++) {
    const t = row / Math.max(1, height)
    const from = Math.round(tipX + (left - tipX) * t)
    const to = Math.round(tipX + (right - tipX) * t)
    g.fillRect(from, tipY + row, Math.max(1, to - from + 1), 1)
  }
}

/**
 * Art from a picture in characters, one string per row: each character is a pixel of the colour
 * the palette gives it, `.` (or any character it does not list) is left empty.
 */
export function bitmap(g: Ctx, rows: readonly string[], palette: Readonly<Record<string, string>>, x = 0, y = 0): void {
  rows.forEach((row, dy) => {
    let start = 0
    // Runs of one colour as one rectangle.
    for (let dx = 1; dx <= row.length; dx++) {
      if (dx < row.length && row[dx] === row[start]) continue
      const colour = palette[row[start]]
      if (colour) rect(g, x + start, y + dy, dx - start, 1, colour)
      start = dx
    }
  })
}

/** A sky in bands from top to bottom, each change of colour softened by two rows of dithering. */
export function bands(g: Ctx, width: number, height: number, colours: readonly string[]): void {
  const band = height / colours.length
  colours.forEach((colour, i) => rect(g, 0, Math.round(i * band), width, Math.ceil(band) + 1, colour))
  for (let i = 1; i < colours.length; i++) {
    const y = Math.round(i * band)
    g.fillStyle = colours[i - 1]
    for (let x = 0; x < width; x += 2) {
      g.fillRect(x, y, 1, 1)
      g.fillRect(x + 1, y + 1, 1, 1)
    }
  }
}

/** A repeatable pseudo-random number in [0, 1) for scenery: the same picture every time. */
export function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

// --- Pixel text ---------------------------------------------------------------------------------

/** A 5 × 5 arcade font: capitals, digits and the few signs the game writes. */
const GLYPHS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  F: ['#####', '#....', '####.', '#....', '#....'],
  G: ['.####', '#....', '#..##', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '####.', '#....', '#....'],
  Q: ['.###.', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  Z: ['#####', '...#.', '..#..', '.#...', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['####.', '....#', '.###.', '#....', '#####'],
  '3': ['####.', '....#', '.###.', '....#', '####.'],
  '4': ['#..#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '####.'],
  '6': ['.###.', '#....', '####.', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..'],
  '8': ['.###.', '#...#', '.###.', '#...#', '.###.'],
  '9': ['.###.', '#...#', '.####', '....#', '.###.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['###.', '...#', '.##.', '....', '.#..'],
  ':': ['.', '#', '.', '#', '.'],
  '/': ['....#', '...#.', '..#..', '.#...', '#....'],
  '%': ['#...#', '...#.', '..#..', '.#...', '#...#'],
  "'": ['#', '#', '.', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
  '✨': ['..#..', '..#..', '##.##', '..#..', '..#..'],
}

export const GLYPH_ROWS = 5
const SPACE = 3

/** The text in the font's own characters: capitals, no accents, a few signs mapped to the ones it has. */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[×]/g, 'X')
    .replace(/[−–—]/g, '-')
    .replace(/…/g, '...')
}

function glyph(char: string): readonly string[] | null {
  return GLYPHS[char] ?? null
}

/** The characters of a text the font has no picture for (spaces aside). */
export function unsupported(text: string): string[] {
  return [...normalise(text)].filter((char) => char !== ' ' && !glyph(char))
}

/** How wide a text is, in world units, at `scale` units per font pixel. */
export function textWidth(text: string, scale: number): number {
  let columns = 0
  for (const char of normalise(text)) columns += (glyph(char)?.[0].length ?? SPACE) + 1
  return Math.max(0, columns - 1) * scale
}

export interface TextStyle {
  scale: number
  colour: string
  align?: 'left' | 'center' | 'right'
  /** A dark copy one pixel down and right, so the text reads on anything. */
  shadow?: string
  /** A dark ring all round instead, for big words. */
  outline?: string
}

/** Pixel text with its vertical middle at `y`. */
export function drawText(ctx: Ctx, text: string, x: number, y: number, style: TextStyle): void {
  const { scale } = style
  const width = textWidth(text, scale)
  const left = style.align === 'center' ? x - width / 2 : style.align === 'right' ? x - width : x
  const top = y - (GLYPH_ROWS * scale) / 2
  const cells: [number, number][] = []
  let column = 0
  for (const char of normalise(text)) {
    const rows = glyph(char)
    if (!rows) {
      column += SPACE + 1
      continue
    }
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') cells.push([column + dx, dy])
    })
    column += rows[0].length + 1
  }
  const fill = (colour: string, ox: number, oy: number) => {
    ctx.fillStyle = colour
    ctx.beginPath()
    for (const [cx, cy] of cells) ctx.rect(left + (cx + ox) * scale, top + (cy + oy) * scale, scale, scale)
    ctx.fill()
  }
  if (style.outline) {
    for (const [ox, oy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [1, 1],
    ]) {
      fill(style.outline, ox, oy)
    }
  } else if (style.shadow) {
    fill(style.shadow, 1, 1)
  }
  fill(style.colour, 0, 0)
}

/** The font's pixels for a short text, as bitmap rows (for icons made of characters, like `+1`). */
export function textBitmap(text: string): string[] {
  const rows = Array.from({ length: GLYPH_ROWS }, () => '')
  normalise(text)
    .split('')
    .forEach((char, i) => {
      const art = glyph(char) ?? Array.from({ length: GLYPH_ROWS }, () => '.'.repeat(SPACE))
      art.forEach((row, dy) => {
        rows[dy] += (i > 0 ? '.' : '') + row
      })
    })
  return rows
}
