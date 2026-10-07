import { HANDCRAFTED_LEVELS } from '../engine/levels'
import type { BrickThemeLook, WorldId } from '../skins/skinTypes'
import type { BrickKind } from '../types/brickTypes'
import { bands, bitmap, disc, hash, oval, peak, rect } from './pixel'

/**
 * Brick Breaker's pixel worlds: a cute, original, anime-flavoured arcade, one world a level. A world
 * is pictures only: its scenery, the sparkle drifting in it, and the colours of its bricks. Which
 * world is drawn depends on the level number and the theme worn, never on anything random, so it can
 * never change how a level plays.
 *
 * Scenery is painted once at {@link SCENE_COLUMNS} × {@link SCENE_ROWS} art pixels (two world
 * units each) and kept as a picture.
 */

type Ctx = CanvasRenderingContext2D

export const SCENE_COLUMNS = 200
export const SCENE_ROWS = 300

export interface BrickColours {
  fill: string
  shade: string
  light: string
}

/** The little picture on a brick's face, the same on every brick of a world. */
export type Motif = 'blossom' | 'wrapper' | 'heart' | 'gem' | 'knot' | 'circuit' | 'scale' | 'crescent' | 'gloss'

/** What drifts in front of the scenery: falling petals, rising embers… */
export type Ambient = 'petals' | 'sprinkles' | 'hearts' | 'twinkles' | 'wisps' | 'rain' | 'embers' | 'fireflies' | 'pixels'

export interface World {
  /** Unique; sprites are cached under it. */
  id: string
  name: string
  /** Which scenery it shows (Endless's worlds share one). */
  scene: WorldId
  paint: (g: Ctx) => void
  ambient: { kind: Ambient; colours: readonly string[]; count: number }
  bricks: { [Kind in BrickKind]: BrickColours } & {
    outline: string
    motif: Motif
    /** Neon bricks are dark glass with glowing edges. */
    neon?: boolean
  }
  /** Pieces that fly when a brick breaks. */
  debris: readonly string[]
  /** The band behind the score, and its edge. */
  hud: { band: string; edge: string }
}

// --- Scenery pieces -----------------------------------------------------------------------------

function cloud(g: Ctx, x: number, y: number, w: number, colour: string, shadow: string): void {
  oval(g, x, y + 1, Math.round(w / 2), 3, shadow)
  oval(g, x, y, Math.round(w / 2), 3, colour)
  disc(g, x - Math.round(w / 6), y - 2, Math.max(2, Math.round(w / 6)), colour)
  disc(g, x + Math.round(w / 8), y - 3, Math.max(2, Math.round(w / 5)), colour)
}

function starfield(g: Ctx, count: number, seed: number, colours: readonly string[], top: number, bottom: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(seed + i) * SCENE_COLUMNS)
    const y = Math.floor(top + hash(seed + i * 3.7) * (bottom - top))
    const colour = colours[i % colours.length]
    rect(g, x, y, 1, 1, colour)
    if (i % 9 === 0) {
      rect(g, x - 1, y, 3, 1, colour)
      rect(g, x, y - 1, 1, 3, colour)
    }
  }
}

/** A crystal: a tall diamond with a lit facet. */
function crystal(g: Ctx, cx: number, base: number, w: number, h: number, colour: string, light: string, dark: string): void {
  peak(g, cx - w, cx + w, base - Math.round(h * 0.35), cx, base - h, colour)
  peak(g, cx - w, cx + w, base - Math.round(h * 0.35), cx, base, colour)
  for (let row = 0; row < Math.round(h * 0.65); row++) rect(g, cx - 1, base - h + 2 + row, 1, 1, light)
  rect(g, cx + Math.round(w / 2), base - Math.round(h * 0.4), 1, Math.round(h * 0.3), dark)
}

function lollipop(g: Ctx, cx: number, cy: number, r: number, colours: readonly string[]): void {
  rect(g, cx - 1, cy, 2, 300 - cy, '#fff7fb')
  rect(g, cx + 1, cy, 1, 300 - cy, '#f5d0e6')
  for (let ring = r, i = 0; ring > 0; ring -= 3, i++) disc(g, cx, cy, ring, colours[i % colours.length])
}

function sakuraTree(g: Ctx, x: number, flip: 1 | -1): void {
  const trunk = '#6b2f45'
  rect(g, x - 3, 188, 6, 112, trunk)
  for (let i = 0; i < 26; i++) rect(g, x + flip * (i + 2), 200 - Math.round(i * 0.8), 3, 2, trunk)
  for (const [dx, dy, r, colour] of [
    [0, 178, 16, '#f472b6'],
    [flip * 16, 168, 13, '#f9a8d4'],
    [flip * 30, 180, 11, '#f472b6'],
    [flip * -8, 160, 10, '#fbcfe8'],
    [flip * 6, 196, 9, '#f9a8d4'],
  ] as const) {
    disc(g, x + dx, dy, r, colour)
  }
  for (let i = 0; i < 26; i++) rect(g, x + flip * Math.floor(hash(x + i) * 34) - 6, 156 + Math.floor(hash(i * 7.1 + x) * 46), 1, 1, '#fff1f7')
}

function torii(g: Ctx, cx: number, top: number): void {
  const red = '#d1262b'
  const dark = '#2a0d10'
  rect(g, cx - 50, top, 100, 4, dark)
  rect(g, cx - 54, top - 3, 6, 4, dark)
  rect(g, cx + 48, top - 3, 6, 4, dark)
  rect(g, cx - 46, top + 4, 92, 4, red)
  rect(g, cx - 40, top + 18, 80, 3, red)
  rect(g, cx - 3, top + 8, 6, 10, dark)
  for (const side of [-1, 1]) {
    rect(g, cx + side * 33 - 3, top + 8, 6, 300 - top, red)
    rect(g, cx + side * 33 - 3, top + 8, 2, 300 - top, '#f05252')
    rect(g, cx + side * 33 - 4, 282, 8, 6, dark)
  }
}

function lantern(g: Ctx, cx: number, base: number): void {
  const stone = '#6b5e73'
  const dark = '#3f3647'
  rect(g, cx - 6, base - 4, 12, 4, dark)
  rect(g, cx - 2, base - 20, 4, 16, stone)
  rect(g, cx - 6, base - 24, 12, 4, dark)
  rect(g, cx - 5, base - 32, 10, 8, stone)
  rect(g, cx - 3, base - 30, 6, 4, '#fde68a')
  peak(g, cx - 9, cx + 9, base - 32, cx, base - 39, dark)
}

function skyline(g: Ctx, seed: number, base: number, colour: string, lit: readonly string[], minHeight: number, maxHeight: number): void {
  let x = -4
  let i = 0
  while (x < SCENE_COLUMNS) {
    const w = 10 + Math.floor(hash(seed + i) * 16)
    const h = minHeight + Math.floor(hash(seed + i * 5.3) * (maxHeight - minHeight))
    rect(g, x, base - h, w, h, colour)
    for (let wy = base - h + 3; wy < base - 2; wy += 4) {
      for (let wx = x + 2; wx < x + w - 2; wx += 3) {
        if (hash(wx * 1.3 + wy * 7.7 + seed) < 0.28) rect(g, wx, wy, 1, 2, lit[(wx + wy) % lit.length])
      }
    }
    x += w + 1
    i++
  }
}

/** A floor of glowing lines running to the horizon. */
function gridFloor(g: Ctx, horizon: number, colour: string, faint: string): void {
  rect(g, 0, horizon, SCENE_COLUMNS, SCENE_ROWS - horizon, '#0a0620')
  rect(g, 0, horizon, SCENE_COLUMNS, 1, colour)
  for (let k = -12; k <= 12; k++) {
    for (let y = horizon + 1; y < SCENE_ROWS; y++) {
      const t = (y - horizon) / (SCENE_ROWS - horizon)
      rect(g, Math.round(100 + k * (6 + t * 22)), y, 1, 1, faint)
    }
  }
  for (let step = 1, y = horizon + 2; y < SCENE_ROWS; step++, y += step) rect(g, 0, y, SCENE_COLUMNS, 1, faint)
}

function bat(g: Ctx, x: number, y: number, colour: string): void {
  bitmap(g, ['#.....#', '##.#.##', '.#####.', '..#.#..'], { '#': colour }, x, y)
}

// --- The worlds ---------------------------------------------------------------------------------

const SAKURA: World = {
  id: 'sakura',
  name: 'Cute Sakura',
  scene: 'sakura',
  paint: (g) => {
    bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#fde2f0', '#fbd5ec', '#f6cdee', '#efd3f7', '#e7dafc', '#f3dcf3'])
    disc(g, 150, 62, 15, '#fff4fa')
    disc(g, 150, 62, 12, '#ffe8f4')
    cloud(g, 36, 52, 26, '#ffffff', '#f5d0e6')
    cloud(g, 118, 92, 20, '#ffffff', '#f5d0e6')
    cloud(g, 176, 36, 16, '#ffffff', '#f5d0e6')
    peak(g, 30, 180, 236, 105, 150, '#e6c3ea')
    peak(g, 89, 121, 168, 105, 150, '#fff7fc')
    oval(g, 46, 276, 92, 34, '#f5b3d6')
    oval(g, 172, 282, 84, 30, '#efa1cb')
    sakuraTree(g, 14, 1)
    sakuraTree(g, 186, -1)
    rect(g, 0, 288, SCENE_COLUMNS, 12, '#ec8fbd')
    for (let x = 2; x < SCENE_COLUMNS; x += 7) rect(g, x, 287, 1, 2, '#f9c6de')
  },
  ambient: { kind: 'petals', colours: ['#f9a8d4', '#fbcfe8', '#f472b6'], count: 18 },
  bricks: {
    normal: { fill: '#f472b6', shade: '#be185d', light: '#fce7f3' },
    tough: { fill: '#a78bfa', shade: '#6d28d9', light: '#ede9fe' },
    armored: { fill: '#d6d3d1', shade: '#78716c', light: '#fafaf9' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#5b1035',
    motif: 'blossom',
  },
  debris: ['#f9a8d4', '#fbcfe8', '#ffffff', '#f472b6'],
  hud: { band: 'rgba(80,7,36,0.78)', edge: '#f9a8d4' },
}

const CANDY: World = {
  id: 'candy',
  name: 'Kawaii Candy',
  scene: 'candy',
  paint: (g) => {
    bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#c9f2e4', '#d8f5ea', '#eaf6f0', '#fde3f1', '#fcd2e8', '#f9c2de'])
    cloud(g, 40, 60, 30, '#fbcfe8', '#f9a8d4')
    cloud(g, 150, 44, 26, '#bae6fd', '#93c5fd')
    cloud(g, 104, 118, 22, '#fde68a', '#fcd34d')
    oval(g, 30, 296, 70, 48, '#f9a8d4')
    oval(g, 170, 300, 76, 52, '#a5f3fc')
    oval(g, 100, 304, 60, 34, '#fde68a')
    for (let i = 0; i < 40; i++) rect(g, Math.floor(hash(i) * 200), 262 + Math.floor(hash(i * 2.3) * 36), 2, 1, '#ffffff')
    lollipop(g, 22, 186, 13, ['#f472b6', '#ffffff'])
    lollipop(g, 180, 170, 11, ['#38bdf8', '#ffffff'])
    lollipop(g, 160, 226, 8, ['#a3e635', '#ffffff'])
    for (const [x, colour] of [
      [60, '#fb7185'],
      [80, '#c084fc'],
      [132, '#34d399'],
      [112, '#fbbf24'],
    ] as const) {
      oval(g, x, 284, 6, 6, colour)
      rect(g, x - 2, 280, 2, 1, '#ffffff')
    }
    rect(g, 0, 290, SCENE_COLUMNS, 10, '#f472b6')
    for (let x = 0; x < SCENE_COLUMNS; x += 8) oval(g, x + 4, 290, 3, 2, '#fff1f7')
  },
  ambient: { kind: 'sprinkles', colours: ['#f472b6', '#38bdf8', '#facc15', '#a3e635', '#c084fc'], count: 22 },
  bricks: {
    normal: { fill: '#5eead4', shade: '#0f766e', light: '#eafaf2' },
    tough: { fill: '#f9a8d4', shade: '#db2777', light: '#fdf2f8' },
    armored: { fill: '#fdba74', shade: '#c2410c', light: '#fff7ed' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#4a0d2e',
    motif: 'wrapper',
  },
  debris: ['#f472b6', '#5eead4', '#fde047', '#ffffff', '#c084fc'],
  hud: { band: 'rgba(74,13,46,0.78)', edge: '#5eead4' },
}

const CAFE: World = {
  id: 'cafe',
  name: 'Anime Café',
  scene: 'cafe',
  paint: (g) => {
    rect(g, 0, 0, SCENE_COLUMNS, SCENE_ROWS, '#2c5552')
    for (let x = 0; x < SCENE_COLUMNS; x += 10) rect(g, x, 0, 4, 236, '#306059')
    // A big window on the evening.
    rect(g, 66, 26, 68, 92, '#4a2c1d')
    for (const [y, colour] of [
      [30, '#fcd29a'],
      [50, '#fbb586'],
      [70, '#f699a0'],
      [92, '#d58ec7'],
    ] as const) {
      rect(g, 70, y, 60, 22, colour)
    }
    disc(g, 112, 52, 7, '#fff1c9')
    rect(g, 99, 30, 2, 84, '#4a2c1d')
    rect(g, 70, 70, 60, 2, '#4a2c1d')
    rect(g, 62, 116, 76, 5, '#6b4430')
    // Lamps.
    for (const x of [34, 166]) {
      rect(g, x, 0, 1, 40, '#1b2f2d')
      peak(g, x - 9, x + 9, 48, x, 38, '#e9b44c')
      oval(g, x, 52, 5, 2, '#fff1c9')
    }
    // Shelves of cups and jars.
    for (const [x, side] of [
      [8, 1],
      [146, -1],
    ] as const) {
      rect(g, x, 160, 46, 3, '#6b4430')
      rect(g, x, 200, 46, 3, '#6b4430')
      for (let i = 0; i < 5; i++) {
        const colour = ['#fca5a5', '#fde68a', '#a7f3d0', '#f9a8d4', '#bfdbfe'][(i + (side > 0 ? 0 : 2)) % 5]
        rect(g, x + 3 + i * 9, 151, 6, 9, colour)
        rect(g, x + 3 + i * 9, 151, 6, 1, '#ffffff')
        rect(g, x + 4 + i * 9, 192, 5, 8, ['#fef3c7', '#fecaca', '#e9d5ff'][i % 3])
      }
    }
    // The counter and a checkered floor.
    rect(g, 0, 236, SCENE_COLUMNS, 6, '#8b5a3c')
    rect(g, 0, 242, SCENE_COLUMNS, 44, '#6b4430')
    for (let x = 6; x < SCENE_COLUMNS; x += 24) rect(g, x, 248, 18, 32, '#5a3826')
    for (let y = 286; y < SCENE_ROWS; y += 7) for (let x = ((y - 286) / 7) % 2 === 0 ? 0 : 7; x < SCENE_COLUMNS; x += 14) rect(g, x, y, 7, 7, '#f3e3cf')
    for (let y = 286; y < SCENE_ROWS; y += 7) for (let x = ((y - 286) / 7) % 2 === 0 ? 7 : 0; x < SCENE_COLUMNS; x += 14) rect(g, x, y, 7, 7, '#7a4f37')
  },
  ambient: { kind: 'hearts', colours: ['#fda4af', '#fff1f2', '#fde68a'], count: 9 },
  bricks: {
    normal: { fill: '#f5c992', shade: '#b45309', light: '#fff7ed' },
    tough: { fill: '#fda4af', shade: '#e11d48', light: '#fff1f2' },
    armored: { fill: '#a16a4a', shade: '#4a2617', light: '#e9c8a8' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#2b140a',
    motif: 'heart',
  },
  debris: ['#f5c992', '#fda4af', '#ffffff', '#a16a4a'],
  hud: { band: 'rgba(43,20,10,0.8)', edge: '#f5c992' },
}

const GALAXY: World = {
  id: 'galaxy',
  name: 'Magical Galaxy',
  scene: 'galaxy',
  paint: (g) => {
    bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#0b0626', '#140a38', '#1d0f4f', '#271464', '#1f1056', '#170c43'])
    oval(g, 56, 130, 54, 22, '#2c1670')
    oval(g, 60, 128, 34, 12, '#3a1d86')
    oval(g, 150, 196, 50, 20, '#311567')
    oval(g, 146, 194, 30, 10, '#42208a')
    starfield(g, 150, 3, ['#ffffff', '#fde68a', '#a5f3fc', '#f5d0fe'], 20, 290)
    // A ringed planet.
    const ring = (front: boolean) => {
      for (let x = -28; x <= 28; x++) {
        const y = Math.round(Math.sqrt(1 - (x / 28) ** 2) * 6)
        rect(g, 40 + x, 232 + (front ? y : -y), 1, 1, '#fde68a')
      }
    }
    ring(false)
    disc(g, 40, 232, 16, '#e879f9')
    disc(g, 36, 228, 10, '#f0abfc')
    rect(g, 44, 238, 6, 2, '#c026d3')
    ring(true)
    // A little moon.
    disc(g, 162, 54, 11, '#fef9c3')
    disc(g, 167, 50, 9, '#140a38')
    // Floating crystals.
    crystal(g, 16, 292, 8, 40, '#67e8f9', '#d5f6ff', '#0e7490')
    crystal(g, 32, 296, 5, 24, '#c084fc', '#f5f3ff', '#7e22ce')
    crystal(g, 184, 294, 9, 46, '#c084fc', '#f5f3ff', '#7e22ce')
    crystal(g, 168, 298, 5, 22, '#67e8f9', '#d5f6ff', '#0e7490')
  },
  ambient: { kind: 'twinkles', colours: ['#ffffff', '#fde68a', '#a5f3fc'], count: 22 },
  bricks: {
    normal: { fill: '#7dd3fc', shade: '#0369a1', light: '#f0f9ff' },
    tough: { fill: '#c084fc', shade: '#7e22ce', light: '#faf5ff' },
    armored: { fill: '#cbd5e1', shade: '#475569', light: '#f8fafc' },
    special: { fill: '#fde047', shade: '#ca8a04', light: '#fefce8' },
    outline: '#0b0626',
    motif: 'gem',
  },
  debris: ['#7dd3fc', '#c084fc', '#fde68a', '#ffffff'],
  hud: { band: 'rgba(11,6,38,0.8)', edge: '#c084fc' },
}

const SHRINE: World = {
  id: 'shrine',
  name: 'Kitsune Shrine',
  scene: 'shrine',
  paint: (g) => {
    bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#1e1338', '#2e1a4f', '#4b2563', '#7c2d63', '#b6455f', '#e8775a'])
    starfield(g, 50, 11, ['#fde68a', '#ffffff'], 20, 120)
    disc(g, 100, 250, 34, '#f8b26a')
    disc(g, 100, 250, 28, '#fcd08a')
    peak(g, -30, 90, 266, 30, 214, '#5a2347')
    peak(g, 70, 240, 266, 160, 206, '#4a1c3d')
    torii(g, 100, 176)
    lantern(g, 22, 286)
    lantern(g, 178, 286)
    rect(g, 0, 286, SCENE_COLUMNS, 14, '#2b1526')
    for (let x = 0; x < SCENE_COLUMNS; x += 12) rect(g, x, 290, 10, 1, '#3d2135')
    // Maple leaves on the ground.
    for (let i = 0; i < 18; i++) rect(g, Math.floor(hash(i * 4.1) * 200), 288 + Math.floor(hash(i) * 10), 2, 1, i % 2 ? '#f97316' : '#dc2626')
  },
  ambient: { kind: 'wisps', colours: ['#67e8f9', '#a5f3fc', '#e0f2fe'], count: 7 },
  bricks: {
    normal: { fill: '#f87171', shade: '#b91c1c', light: '#fee2e2' },
    tough: { fill: '#fbbf24', shade: '#b45309', light: '#fffbeb' },
    armored: { fill: '#a8a29e', shade: '#57534e', light: '#e7e5e4' },
    special: { fill: '#67e8f9', shade: '#0e7490', light: '#d9f4fb' },
    outline: '#3a0a0f',
    motif: 'knot',
  },
  debris: ['#f87171', '#fbbf24', '#67e8f9', '#ffffff'],
  hud: { band: 'rgba(30,19,56,0.8)', edge: '#f87171' },
}

const CYBER: World = {
  id: 'cyber',
  name: 'Cyber Anime',
  scene: 'cyber',
  paint: (g) => {
    bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#05030f', '#0a0720', '#110b33', '#190f45', '#231250', '#170c38'])
    starfield(g, 40, 21, ['#a5f3fc', '#f5d0fe'], 20, 110)
    disc(g, 150, 70, 16, '#3b1460')
    disc(g, 150, 70, 12, '#5b1f86')
    skyline(g, 5, 262, '#160f3a', ['#22d3ee', '#f472b6', '#a78bfa'], 70, 150)
    skyline(g, 9, 262, '#0b0822', ['#22d3ee', '#f472b6'], 30, 90)
    // Neon signs.
    rect(g, 26, 150, 10, 36, '#0b0822')
    rect(g, 26, 150, 10, 1, '#f472b6')
    rect(g, 26, 185, 10, 1, '#f472b6')
    rect(g, 26, 150, 1, 36, '#f472b6')
    rect(g, 35, 150, 1, 36, '#f472b6')
    for (let y = 154; y < 182; y += 6) rect(g, 29, y, 4, 3, '#22d3ee')
    rect(g, 156, 176, 28, 12, '#0b0822')
    for (const [x, y, w, h] of [
      [156, 176, 28, 1],
      [156, 187, 28, 1],
      [156, 176, 1, 12],
      [183, 176, 1, 12],
    ] as const) {
      rect(g, x, y, w, h, '#22d3ee')
    }
    rect(g, 160, 180, 6, 4, '#f472b6')
    rect(g, 168, 180, 12, 1, '#a78bfa')
    rect(g, 168, 183, 9, 1, '#a78bfa')
    gridFloor(g, 262, '#f472b6', '#3b1460')
  },
  ambient: { kind: 'rain', colours: ['#22d3ee', '#67e8f9'], count: 26 },
  bricks: {
    normal: { fill: '#22d3ee', shade: '#0e7490', light: '#cffafe' },
    tough: { fill: '#e879f9', shade: '#a21caf', light: '#fae8ff' },
    armored: { fill: '#a3e635', shade: '#4d7c0f', light: '#ecfccb' },
    special: { fill: '#fde047', shade: '#a16207', light: '#fefce8' },
    outline: '#020617',
    motif: 'circuit',
    neon: true,
  },
  debris: ['#22d3ee', '#e879f9', '#a3e635', '#ffffff'],
  hud: { band: 'rgba(5,3,15,0.82)', edge: '#22d3ee' },
}

const DRAGON_SHAPE = [
  '..........#.......#.......',
  '.........###.....###......',
  '........#####...#####.....',
  '.......#######.#######....',
  '##....##################..',
  '.####################.###.',
  '..##########......###...##',
  '...#....#..........#......',
]

const DRAGON: World = {
  id: 'dragon',
  name: 'Fantasy Dragon',
  scene: 'dragon',
  paint: (g) => {
    bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#14040a', '#220810', '#360c17', '#4d1220', '#6b1c1c', '#8f2d14'])
    starfield(g, 30, 31, ['#fecaca', '#fde68a'], 20, 100)
    peak(g, -40, 110, 270, 40, 168, '#24070d')
    peak(g, 34, 46, 174, 40, 168, '#f97316')
    rect(g, 38, 168, 5, 3, '#fde047')
    // A dragon gliding over the mountains, its edges lit by the lava.
    DRAGON_SHAPE.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        if (row[dx] !== '#') continue
        rect(g, 96 + dx * 2, 138 + dy * 2, 2, 2, '#0e0306')
        if (dy === 0 || DRAGON_SHAPE[dy - 1][dx] !== '#') rect(g, 96 + dx * 2, 138 + dy * 2, 2, 1, '#9a3412')
      }
    })
    rect(g, 98, 146, 1, 1, '#fde047')
    peak(g, 90, 250, 270, 165, 188, '#1a0509')
    for (let i = 0; i < 14; i++) rect(g, 34 + Math.floor(hash(i) * 14), 172 + i * 3, 2, 3, i % 2 ? '#ea580c' : '#f97316')
    crystal(g, 18, 296, 9, 50, '#22d3ee', '#d5f6ff', '#0e7490')
    crystal(g, 36, 298, 6, 30, '#a855f7', '#f3e8ff', '#6b21a8')
    crystal(g, 182, 296, 10, 56, '#a855f7', '#f3e8ff', '#6b21a8')
    crystal(g, 162, 298, 6, 28, '#22d3ee', '#d5f6ff', '#0e7490')
    rect(g, 0, 292, SCENE_COLUMNS, 8, '#14040a')
  },
  ambient: { kind: 'embers', colours: ['#fb923c', '#facc15', '#f97316'], count: 22 },
  bricks: {
    normal: { fill: '#34d399', shade: '#047857', light: '#d1fae5' },
    tough: { fill: '#fb7185', shade: '#be123c', light: '#ffe4e6' },
    armored: { fill: '#94a3b8', shade: '#334155', light: '#e2e8f0' },
    special: { fill: '#facc15', shade: '#a16207', light: '#fef9c3' },
    outline: '#12030a',
    motif: 'scale',
  },
  debris: ['#34d399', '#facc15', '#fb7185', '#fb923c'],
  hud: { band: 'rgba(20,4,10,0.82)', edge: '#facc15' },
}

const MOON: World = {
  id: 'moon',
  name: 'Dark Moon',
  scene: 'moon',
  paint: (g) => {
    bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#06030d', '#0b0619', '#110a26', '#170d33', '#1d1040', '#120a2a'])
    starfield(g, 60, 41, ['#e9d5ff', '#ffffff'], 20, 250)
    disc(g, 100, 74, 42, '#1f1442')
    disc(g, 100, 74, 37, '#2a1b57')
    disc(g, 100, 74, 33, '#ece4ff')
    for (const [x, y, r] of [
      [88, 62, 5],
      [112, 84, 7],
      [104, 58, 3],
      [84, 90, 4],
    ] as const) {
      disc(g, x, y, r, '#d6caf2')
    }
    disc(g, 114, 66, 30, 'rgba(23,13,51,0.42)')
    bat(g, 40, 120, '#05020a')
    bat(g, 150, 136, '#05020a')
    bat(g, 168, 100, '#05020a')
    // Bare, twisted trees.
    for (const [x, flip] of [
      [12, 1],
      [188, -1],
    ] as const) {
      rect(g, x - 3, 190, 6, 110, '#05020a')
      for (let i = 0; i < 22; i++) rect(g, x + flip * i, 206 - i - Math.floor(i / 3), 2, 2, '#05020a')
      for (let i = 0; i < 14; i++) rect(g, x + flip * (10 + i), 190 - Math.floor(i * 1.6), 2, 2, '#05020a')
      for (let i = 0; i < 10; i++) rect(g, x - flip * i, 232 - i * 2, 2, 2, '#05020a')
    }
    for (let y = 262; y < 286; y += 2) for (let x = (y / 2) % 2; x < SCENE_COLUMNS; x += 2) rect(g, x, y, 1, 1, '#2a1650')
    rect(g, 0, 286, SCENE_COLUMNS, 14, '#05020a')
  },
  ambient: { kind: 'fireflies', colours: ['#c4b5fd', '#86efac', '#f0abfc'], count: 14 },
  bricks: {
    normal: { fill: '#a78bfa', shade: '#5b21b6', light: '#ede9fe' },
    tough: { fill: '#f43f5e', shade: '#9f1239', light: '#ffe4e6' },
    armored: { fill: '#64748b', shade: '#1e293b', light: '#cbd5e1' },
    special: { fill: '#fde68a', shade: '#b45309', light: '#fffbeb' },
    outline: '#07030f',
    motif: 'crescent',
  },
  debris: ['#a78bfa', '#f43f5e', '#ede9fe', '#86efac'],
  hud: { band: 'rgba(6,3,13,0.84)', edge: '#a78bfa' },
}

/** Endless: a retro arcade at sunset, its bricks in each level world's colours in turn. */
function paintArcade(g: Ctx): void {
  bands(g, SCENE_COLUMNS, SCENE_ROWS, ['#0a0a23', '#121034', '#1b1348', '#29105c', '#3b0f63', '#250b45'])
  starfield(g, 90, 51, ['#ffffff', '#a5f3fc', '#fde68a'], 20, 230)
  const colours = ['#fde047', '#fbbf24', '#fb923c', '#f472b6', '#e879f9']
  for (let r = 30, i = 0; r > 0; r -= 6, i++) disc(g, 100, 246, r, colours[Math.min(i, colours.length - 1)])
  for (let y = 234; y < 262; y += 5) rect(g, 60, y, 80, 2, '#29105c')
  gridFloor(g, 262, '#22d3ee', '#1e3a8a')
}

/** The handcrafted levels' worlds, in level order. */
export const LEVEL_WORLDS: readonly World[] = [SAKURA, CANDY, CAFE, GALAXY, SHRINE, CYBER, DRAGON, MOON]

export const WORLDS: Readonly<Record<Exclude<WorldId, 'arcade'>, World>> = {
  sakura: SAKURA,
  candy: CANDY,
  cafe: CAFE,
  galaxy: GALAXY,
  shrine: SHRINE,
  cyber: CYBER,
  dragon: DRAGON,
  moon: MOON,
}

/** Endless's worlds: the arcade, with each level world's bricks in turn. */
const ARCADE_WORLDS: readonly World[] = LEVEL_WORLDS.map((world, i) => ({
  id: `arcade-${i}`,
  name: 'Starlight Arcade',
  scene: 'arcade',
  paint: paintArcade,
  ambient: { kind: 'pixels', colours: ['#22d3ee', '#f472b6', '#fde047', '#a3e635'], count: 14 },
  bricks: { ...world.bricks, motif: 'gloss', neon: false },
  debris: world.debris,
  hud: { band: 'rgba(10,10,35,0.82)', edge: '#22d3ee' },
}))

/** The world of a level: its own for the handcrafted ones, then the arcade, its colours changing each level. */
export function levelWorld(level: number): World {
  if (level >= 1 && level <= HANDCRAFTED_LEVELS) return LEVEL_WORLDS[level - 1]
  const index = (((Math.max(1, level) - HANDCRAFTED_LEVELS - 1) % ARCADE_WORLDS.length) + ARCADE_WORLDS.length) % ARCADE_WORLDS.length
  return ARCADE_WORLDS[index]
}

/** The world drawn for a brick theme on a level: the level's own, or the theme's everywhere. */
export function worldOf(look: BrickThemeLook, level: number): World {
  if (look.world === 'levels') return levelWorld(level)
  if (look.world === 'arcade') return ARCADE_WORLDS[0]
  return WORLDS[look.world]
}
