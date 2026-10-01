// Builds the bundled "Cyan Critters" card game: its dataset file and all of its artwork.
//
//   node tools/tcg/build-cyan-critters.mjs
//
// Output:
//   backend/src/main/resources/tcg/datasets/cyan-critters.json   the dataset the backend imports
//   frontend/public/tcg-assets/cyan-critters/**                   card, pack, set and game art (SVG)
//
// Everything here is original: the creatures are drawn from a few shapes and colours, so the repo
// ships a complete card game without depending on anyone else's artwork or on the network.
// The dataset uses the same format as any other TCG dataset (see ARCHITECTURE.md, "TCG").

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ASSET_DIR = join(root, 'frontend', 'public', 'tcg-assets', 'cyan-critters')
const ASSET_URL = '/tcg-assets/cyan-critters'
const DATASET_FILE = join(root, 'backend', 'src', 'main', 'resources', 'tcg', 'datasets', 'cyan-critters.json')

const FONT = "'Trebuchet MS', Verdana, system-ui, sans-serif"

// --- The game ------------------------------------------------------------------------------------

const rarities = [
  { code: 'common', name: 'Common', tier: 1 },
  { code: 'uncommon', name: 'Uncommon', tier: 2 },
  { code: 'rare', name: 'Rare', tier: 3 },
  { code: 'epic', name: 'Epic', tier: 4 },
  { code: 'legendary', name: 'Legendary', tier: 5 },
]
const tierOf = Object.fromEntries(rarities.map((rarity) => [rarity.code, rarity.tier]))

/** Colours per creature type: body, belly, and the two ends of the art background. */
const types = {
  Leaf: { body: '#4ade80', belly: '#dcfce7', from: '#d9f99d', to: '#22c55e', ink: '#14532d' },
  Spark: { body: '#facc15', belly: '#fef9c3', from: '#fef08a', to: '#f59e0b', ink: '#713f12' },
  Breeze: { body: '#7dd3fc', belly: '#f0f9ff', from: '#e0f2fe', to: '#38bdf8', ink: '#0c4a6e' },
  Stone: { body: '#a8a29e', belly: '#f5f5f4', from: '#e7e5e4', to: '#78716c', ink: '#292524' },
  Wave: { body: '#60a5fa', belly: '#dbeafe', from: '#bfdbfe', to: '#2563eb', ink: '#1e3a8a' },
  Glow: { body: '#f472b6', belly: '#fce7f3', from: '#fbcfe8', to: '#db2777', ink: '#831843' },
  Shade: { body: '#a78bfa', belly: '#ede9fe', from: '#6d28d9', to: '#1e1b4b', ink: '#2e1065' },
  Frost: { body: '#67e8f9', belly: '#ecfeff', from: '#cffafe', to: '#0891b2', ink: '#164e63' },
}

// number, name, type, rarity, hp, look [shape, ears, eyes, mark, tail], flavor
const c = (number, name, type, rarity, hp, look, flavor) => {
  const [shape, ears, eyes, mark, tail] = look.split(' ')
  return { number, name, type, rarity, hp, shape, ears, eyes, mark, tail: tail === 'tail', flavor }
}

const sets = [
  {
    code: 'pixel-meadow',
    name: 'Pixel Meadow',
    description: 'Sunny fields, mossy rocks and the critters that nap on them.',
    releasedOn: '2026-09-01',
    palette: ['#bef264', '#22c55e', '#0e7490'],
    cards: [
      c('001', 'Sproutle', 'Leaf', 'common', 40, 'round leaf dot none -', 'Grows a new leaf every time it is praised.'),
      c('002', 'Pebblit', 'Stone', 'common', 50, 'wide none sleepy spots -', 'Often mistaken for a rock, which suits it fine.'),
      c('003', 'Zapling', 'Spark', 'common', 40, 'round antenna dot bolt tail', 'Its tail tingles just before a thunderstorm.'),
      c('004', 'Puffkin', 'Breeze', 'common', 30, 'round round big none -', 'Light enough to ride a dandelion seed.'),
      c('005', 'Mossnip', 'Leaf', 'common', 50, 'wide pointy dot spots tail', 'Keeps a tiny garden on its back.'),
      c('006', 'Flickit', 'Spark', 'common', 40, 'tall pointy big none tail', 'Blinks on and off when it gets the hiccups.'),
      c('007', 'Dustbun', 'Stone', 'common', 60, 'round round sleepy none -', 'Rolls downhill for fun, then walks all the way back.'),
      c('008', 'Bloomtail', 'Leaf', 'uncommon', 70, 'tall leaf big stripes tail', 'The flower on its tail opens only at sunrise.'),
      c('009', 'Voltbug', 'Spark', 'uncommon', 60, 'wide antenna dot stripes -', 'Hums like a tiny power line.'),
      c('010', 'Galeowl', 'Breeze', 'uncommon', 70, 'tall horns big spots -', 'Turns its head all the way round to feel the wind.'),
      c('011', 'Craglet', 'Stone', 'uncommon', 80, 'wide horns dot stripes tail', 'Stacks pebbles into towers and guards them.'),
      c('012', 'Twirlwing', 'Breeze', 'uncommon', 60, 'round fins dot stripes tail', 'Spins when it is happy, which is nearly always.'),
      c('013', 'Thornback', 'Leaf', 'rare', 100, 'wide horns sleepy stripes tail', 'Gentle, unless you step on its flowerbed.'),
      c('014', 'Stormane', 'Spark', 'rare', 90, 'tall pointy big bolt tail', 'Its mane crackles when it runs at full speed.'),
      c('015', 'Boulderon', 'Stone', 'rare', 120, 'wide horns dot spots -', 'Moves one step a day, and never backwards.'),
      c('016', 'Zephyra', 'Breeze', 'epic', 130, 'tall fins big star tail', 'Wherever it lands, the clouds part.'),
      c('017', 'Solarhorn', 'Spark', 'epic', 140, 'round horns big star tail', 'Carries a little piece of noon between its horns.'),
      c('018', 'Pixelord', 'Leaf', 'legendary', 180, 'round leaf big star tail', 'The first critter of the meadow. Every blade of grass knows its name.'),
    ],
    packs: [
      {
        code: 'sunrise',
        name: 'Sunrise Pack',
        description: 'Warm light and crackling manes. Solarhorn waits inside.',
        cover: '017',
        rares: ['013', '014', '017', '018'],
      },
      {
        code: 'twilight',
        name: 'Twilight Pack',
        description: 'Cool winds over quiet stone. Zephyra waits inside.',
        cover: '016',
        rares: ['014', '015', '016', '018'],
      },
    ],
  },
  {
    code: 'neon-depths',
    name: 'Neon Depths',
    description: 'A glowing sea under the arcade, full of things that shimmer and lurk.',
    releasedOn: '2026-09-15',
    palette: ['#f0abfc', '#7c3aed', '#1e1b4b'],
    cards: [
      c('001', 'Dripple', 'Wave', 'common', 40, 'round fins dot none -', 'Leaves wet footprints even on a dry day.'),
      c('002', 'Glimmit', 'Glow', 'common', 30, 'round antenna big none -', 'Glows brighter the more it is looked at.'),
      c('003', 'Murkit', 'Shade', 'common', 50, 'wide pointy sleepy none tail', 'Naps in shadows and is rarely found twice.'),
      c('004', 'Chillo', 'Frost', 'common', 40, 'round round dot spots -', 'Sneezes snowflakes.'),
      c('005', 'Bubblu', 'Wave', 'common', 50, 'wide round big spots -', 'Talks only in bubbles. Nobody minds.'),
      c('006', 'Neonip', 'Glow', 'common', 40, 'tall pointy dot stripes tail', 'Collects lost light and keeps it in its cheeks.'),
      c('007', 'Shadelet', 'Shade', 'common', 40, 'round horns dot none tail', 'Follows you home, then pretends it did not.'),
      c('008', 'Tidefin', 'Wave', 'uncommon', 70, 'tall fins big stripes tail', 'Knows the tide tables by heart.'),
      c('009', 'Lumoth', 'Glow', 'uncommon', 60, 'wide antenna big spots -', 'Draws slow circles around every lantern.'),
      c('010', 'Frostpaw', 'Frost', 'uncommon', 70, 'round pointy dot stripes tail', 'Its paw prints stay frozen until spring.'),
      c('011', 'Gloomcap', 'Shade', 'uncommon', 80, 'wide round sleepy spots -', 'Grows where nobody has looked for a while.'),
      c('012', 'Coralisk', 'Wave', 'uncommon', 70, 'tall horns dot spots tail', 'Wears a reef like a crown and tends it daily.'),
      c('013', 'Abyssail', 'Wave', 'rare', 110, 'wide fins sleepy stripes tail', 'Drifts up from the deep once every full moon.'),
      c('014', 'Prismoth', 'Glow', 'rare', 90, 'tall antenna big star -', 'Its wings split one beam into seven.'),
      c('015', 'Rimeclaw', 'Frost', 'rare', 110, 'wide horns dot stripes tail', 'Carves its name into glaciers.'),
      c('016', 'Voidmaw', 'Shade', 'epic', 140, 'wide horns big star tail', 'Swallows echoes. The depths are quiet around it.'),
      c('017', 'Aurorix', 'Frost', 'epic', 130, 'tall fins big star tail', 'Paints the ice with the colours of the sky.'),
      c('018', 'Neonarch', 'Glow', 'legendary', 190, 'round antenna big star tail', 'The light at the bottom of the sea. Every glow in the depths is borrowed from it.'),
    ],
    packs: [
      {
        code: 'tide',
        name: 'Tide Pack',
        description: 'Bright water and drifting lights. Aurorix waits inside.',
        cover: '017',
        rares: ['013', '014', '017', '018'],
      },
      {
        code: 'abyss',
        name: 'Abyss Pack',
        description: 'Cold, dark and very quiet. Voidmaw waits inside.',
        cover: '016',
        rares: ['014', '015', '016', '018'],
      },
    ],
  },
]

/** Five cards a pack: three commons, an uncommon that can turn out rare, and one rare or better. */
const slots = [
  { count: 3, odds: { common: 100 } },
  { count: 1, odds: { uncommon: 90, rare: 10 } },
  { count: 1, odds: { rare: 75, epic: 20, legendary: 5 } },
]

// --- Drawing ------------------------------------------------------------------------------------

const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Darkens (negative) or lightens (positive) a #rrggbb colour. */
function shade(hex, amount) {
  const channel = (index) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
    const target = amount < 0 ? 0 : 255
    return Math.round(value + (target - value) * Math.abs(amount))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

/** A five-pointed star centred on (cx, cy). */
function star(cx, cy, outer, fill) {
  const points = []
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 === 0 ? outer : outer * 0.45
    const angle = (Math.PI / 5) * index - Math.PI / 2
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`)
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}"/>`
}

/** A critter, centred on (0, 0) and roughly 130 units wide. */
function critter(card) {
  const { body, belly } = types[card.type]
  const dark = shade(body, -0.28)
  const [rx, ry] = card.shape === 'tall' ? [46, 60] : card.shape === 'wide' ? [66, 48] : [56, 54]
  const earX = rx * 0.55
  const earY = -ry * 0.82
  const parts = []

  if (card.tail) {
    parts.push(`<path d="M ${rx - 10} 18 q 46 -4 36 -46 q -4 26 -28 28 z" fill="${dark}"/>`)
  }

  const ears = {
    round: [-1, 1].map((side) => `<circle cx="${side * earX}" cy="${earY}" r="15" fill="${dark}"/>`),
    pointy: [-1, 1].map(
      (side) =>
        `<polygon points="${side * (earX - 14)},${earY + 12} ${side * (earX + 14)},${earY + 12} ${side * (earX + 6)},${earY - 26}" fill="${dark}"/>`,
    ),
    antenna: [-1, 1].map(
      (side) =>
        `<path d="M ${side * earX * 0.6} ${earY + 8} q ${side * 8} -26 ${side * 18} -30" stroke="${dark}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="${side * (earX * 0.6 + 18)}" cy="${earY - 24}" r="7" fill="${belly}" stroke="${dark}" stroke-width="3"/>`,
    ),
    horns: [-1, 1].map(
      (side) =>
        `<path d="M ${side * (earX - 10)} ${earY + 14} q ${side * 4} -30 ${side * 26} -32 q ${side * -8} 14 ${side * -6} 34 z" fill="#fef3c7" stroke="${dark}" stroke-width="3"/>`,
    ),
    fins: [-1, 1].map(
      (side) => `<path d="M ${side * (rx - 6)} -10 q ${side * 34} -22 ${side * 30} 14 q ${side * -14} -8 ${side * -30} 10 z" fill="${dark}"/>`,
    ),
    leaf: [
      `<path d="M 0 ${-ry + 6} q -4 -26 -26 -30 q 2 22 26 30 z" fill="#16a34a"/>`,
      `<path d="M 0 ${-ry + 6} q 6 -30 30 -32 q -4 24 -30 32 z" fill="#22c55e"/>`,
    ],
    none: [],
  }
  parts.push(...ears[card.ears])

  // Feet, body, belly.
  parts.push(`<ellipse cx="${-rx * 0.45}" cy="${ry - 3}" rx="16" ry="9" fill="${dark}"/>`)
  parts.push(`<ellipse cx="${rx * 0.45}" cy="${ry - 3}" rx="16" ry="9" fill="${dark}"/>`)
  parts.push(`<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="${body}"/>`)
  parts.push(`<ellipse cx="0" cy="${ry * 0.34}" rx="${rx * 0.6}" ry="${ry * 0.48}" fill="${belly}"/>`)

  const marks = {
    spots: [
      [-0.62, -0.3, 7],
      [0.66, -0.12, 6],
      [-0.4, -0.66, 5],
    ].map(([x, y, r]) => `<circle cx="${rx * x}" cy="${ry * y}" r="${r}" fill="${dark}" opacity="0.55"/>`),
    stripes: [-0.74, -0.58].map(
      (y, index) =>
        `<path d="M ${-rx * (0.34 - index * 0.12)} ${ry * y} q ${rx * (0.34 - index * 0.12)} 8 ${rx * (0.68 - index * 0.24)} 0" stroke="${dark}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.6"/>`,
    ),
    bolt: [`<polygon points="-6,${ry * 0.12} 8,${ry * 0.12} 0,${ry * 0.36} 10,${ry * 0.36} -8,${ry * 0.74} -2,${ry * 0.46} -10,${ry * 0.46}" fill="#f59e0b"/>`],
    star: [star(0, ry * 0.4, 13, '#fbbf24')],
    none: [],
  }
  parts.push(...marks[card.mark])

  // Face.
  const eyeY = -ry * 0.18
  const eyeX = rx * 0.34
  const eyes = {
    dot: [-1, 1].map((side) => `<circle cx="${side * eyeX}" cy="${eyeY}" r="6" fill="#1f2937"/><circle cx="${side * eyeX + 2}" cy="${eyeY - 2}" r="2" fill="#fff"/>`),
    big: [-1, 1].map(
      (side) =>
        `<circle cx="${side * eyeX}" cy="${eyeY}" r="11" fill="#fff"/><circle cx="${side * eyeX + 1}" cy="${eyeY + 1}" r="7" fill="#1f2937"/><circle cx="${side * eyeX + 4}" cy="${eyeY - 3}" r="2.5" fill="#fff"/>`,
    ),
    sleepy: [-1, 1].map(
      (side) => `<path d="M ${side * eyeX - 8} ${eyeY} q 8 8 16 0" stroke="#1f2937" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    ),
  }
  parts.push(...eyes[card.eyes])
  parts.push(`<circle cx="${-eyeX - 12}" cy="${eyeY + 14}" r="6" fill="#fb7185" opacity="0.55"/>`)
  parts.push(`<circle cx="${eyeX + 12}" cy="${eyeY + 14}" r="6" fill="#fb7185" opacity="0.55"/>`)
  parts.push(`<path d="M -7 ${eyeY + 13} q 7 8 14 0" stroke="#1f2937" stroke-width="3.5" fill="none" stroke-linecap="round"/>`)

  if (tierOf[card.rarity] === 5) {
    // A legendary wears a crown.
    const top = -ry - 6
    parts.push(
      `<polygon points="-24,${top} -24,${top - 22} -12,${top - 10} 0,${top - 28} 12,${top - 10} 24,${top - 22} 24,${top}" fill="#fbbf24" stroke="#b45309" stroke-width="3" stroke-linejoin="round"/>`,
    )
  }
  return parts.join('')
}

/** The little shape in the corner of a card that says how rare it is. */
function raritySymbol(tier, x, y) {
  switch (tier) {
    case 1:
      return `<circle cx="${x}" cy="${y}" r="6" fill="#64748b"/>`
    case 2:
      return `<polygon points="${x},${y - 8} ${x + 7},${y} ${x},${y + 8} ${x - 7},${y}" fill="#0f766e"/>`
    case 3:
      return star(x, y, 9, '#2563eb')
    case 4:
      return star(x - 10, y, 9, '#9333ea') + star(x + 10, y, 9, '#9333ea')
    default:
      return star(x - 18, y, 9, '#d97706') + star(x, y, 11, '#d97706') + star(x + 18, y, 9, '#d97706')
  }
}

/** Splits text into lines of at most `width` characters, breaking between words. */
function wrap(text, width) {
  const lines = ['']
  for (const word of text.split(' ')) {
    const current = lines[lines.length - 1]
    if ((current + ' ' + word).trim().length > width) lines.push(word)
    else lines[lines.length - 1] = (current + ' ' + word).trim()
  }
  return lines
}

const FRAMES = {
  1: { from: '#f8fafc', to: '#e2e8f0', edge: '#cbd5e1' },
  2: { from: '#f0fdfa', to: '#ccfbf1', edge: '#5eead4' },
  3: { from: '#eff6ff', to: '#bfdbfe', edge: '#60a5fa' },
  4: { from: '#fae8ff', to: '#e9d5ff', edge: '#c084fc' },
  5: { from: '#fffbeb', to: '#fde68a', edge: '#f59e0b' },
}

/** A whole card face, 300 x 420. */
function cardSvg(card, set) {
  const type = types[card.type]
  const tier = tierOf[card.rarity]
  const frame = FRAMES[tier]
  const flavor = wrap(card.flavor, 40)
  const total = String(set.cards.length).padStart(3, '0')

  // Rarer cards get a little extra in the art window: rays for epics, rays and stars for legendaries.
  const rays =
    tier >= 4
      ? Array.from({ length: 12 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 12
          const x = 150 + 220 * Math.cos(angle)
          const y = 160 + 220 * Math.sin(angle)
          return `<path d="M 150 160 L ${x.toFixed(1)} ${y.toFixed(1)}" stroke="#fff" stroke-width="16" opacity="0.16"/>`
        }).join('')
      : ''
  const sparkles =
    tier === 5
      ? [
          [52, 96, 7],
          [246, 84, 9],
          [236, 226, 6],
          [60, 222, 8],
        ]
          .map(([x, y, size]) => star(x, y, size, '#fff'))
          .join('')
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" role="img" aria-label="${esc(card.name)}">
<defs>
<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${frame.from}"/><stop offset="1" stop-color="${frame.to}"/></linearGradient>
<linearGradient id="art" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${type.from}"/><stop offset="1" stop-color="${type.to}"/></linearGradient>
<clipPath id="window"><rect x="18" y="54" width="264" height="212" rx="12"/></clipPath>
</defs>
<rect x="3" y="3" width="294" height="414" rx="20" fill="url(#frame)" stroke="${frame.edge}" stroke-width="6"/>
<text x="22" y="40" font-family="${FONT}" font-size="22" font-weight="700" fill="#0f172a">${esc(card.name)}</text>
<text x="278" y="40" font-family="${FONT}" font-size="17" font-weight="700" fill="#b91c1c" text-anchor="end">HP ${card.hp}</text>
<g clip-path="url(#window)">
<rect x="18" y="54" width="264" height="212" fill="url(#art)"/>
${rays}
<ellipse cx="150" cy="246" rx="96" ry="16" fill="#000" opacity="0.18"/>
<g transform="translate(150 166) scale(1.18)">${critter(card)}</g>
${sparkles}
</g>
<rect x="18" y="54" width="264" height="212" rx="12" fill="none" stroke="${frame.edge}" stroke-width="3"/>
<rect x="22" y="280" width="${card.type.length * 10 + 26}" height="26" rx="13" fill="${type.to}"/>
<text x="35" y="298" font-family="${FONT}" font-size="14" font-weight="700" fill="#fff">${card.type}</text>
${flavor.map((line, index) => `<text x="22" y="${330 + index * 19}" font-family="${FONT}" font-size="14" font-style="italic" fill="#334155">${esc(line)}</text>`).join('\n')}
<text x="22" y="400" font-family="${FONT}" font-size="13" font-weight="700" fill="#64748b">${card.number}/${total}</text>
${raritySymbol(tier, tier === 5 ? 250 : tier === 4 ? 262 : 272, 395)}
</svg>
`
}

/** A sealed booster pack, 240 x 340: a foil pouch with crimped ends and the cover critter. */
function packSvg(pack, set) {
  const cover = set.cards.find((card) => card.number === pack.cover)
  const [light, mid, deep] = set.palette
  const teeth = (y, direction) =>
    Array.from({ length: 12 }, (_, index) => `${index * 20 + 10},${y + direction * 9} ${index * 20 + 20},${y}`).join(' ')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 340" role="img" aria-label="${esc(pack.name)}">
<defs>
<linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
<linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<polygon points="0,14 ${teeth(14, -1)} 240,14 240,326 ${teeth(326, 1).split(' ').reverse().join(' ')} 0,326" fill="url(#foil)"/>
<rect x="0" y="26" width="240" height="10" fill="#000" opacity="0.12"/>
<rect x="0" y="304" width="240" height="10" fill="#000" opacity="0.12"/>
<rect x="40" y="14" width="46" height="312" fill="url(#shine)" transform="skewX(-12)"/>
<circle cx="120" cy="176" r="78" fill="#fff" opacity="0.22"/>
<g transform="translate(120 182) scale(1.05)">${critter(cover)}</g>
<text x="120" y="70" font-family="${FONT}" font-size="15" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="2">${esc(set.name.toUpperCase())}</text>
<text x="120" y="98" font-family="${FONT}" font-size="25" font-weight="700" fill="#fff" text-anchor="middle">${esc(pack.name)}</text>
<rect x="76" y="270" width="88" height="26" rx="13" fill="#000" opacity="0.28"/>
<text x="120" y="288" font-family="${FONT}" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">5 CARDS</text>
</svg>
`
}

/** A set's banner, 400 x 220: its name over a few of its critters. */
function setSvg(set) {
  const [light, mid, deep] = set.palette
  const stars = set.cards.filter((card) => tierOf[card.rarity] >= 3).slice(0, 3)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" role="img" aria-label="${esc(set.name)}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.6" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient></defs>
<rect width="400" height="220" fill="url(#sky)"/>
<circle cx="330" cy="40" r="90" fill="#fff" opacity="0.14"/>
<ellipse cx="200" cy="236" rx="260" ry="60" fill="#000" opacity="0.16"/>
${stars.map((card, index) => `<g transform="translate(${100 + index * 100} ${150 - (index === 1 ? 10 : 0)}) scale(${index === 1 ? 0.78 : 0.62})">${critter(card)}</g>`).join('\n')}
<text x="200" y="52" font-family="${FONT}" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${esc(set.name)}</text>
</svg>
`
}

/** The game's emblem, 240 x 240. */
function gameSvg() {
  const mascot = sets[0].cards.find((card) => card.number === '018')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="Cyan Critters">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c084fc"/><stop offset="0.6" stop-color="#ec4899"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
<rect width="240" height="240" rx="48" fill="url(#bg)"/>
<circle cx="120" cy="128" r="84" fill="#fff" opacity="0.2"/>
<g transform="translate(120 140) scale(1.12)">${critter(mascot)}</g>
</svg>
`
}

// --- Output -------------------------------------------------------------------------------------

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

let files = 0
write(join(ASSET_DIR, 'game.svg'), gameSvg())
files++

for (const set of sets) {
  write(join(ASSET_DIR, set.code, 'set.svg'), setSvg(set))
  files++
  for (const card of set.cards) {
    write(join(ASSET_DIR, set.code, 'cards', `${card.number}.svg`), cardSvg(card, set))
    files++
  }
  for (const pack of set.packs) {
    write(join(ASSET_DIR, set.code, 'packs', `${pack.code}.svg`), packSvg(pack, set))
    files++
  }
}

const dataset = {
  game: {
    slug: 'cyan-critters',
    name: 'Cyan Critters',
    description: 'The arcade\'s own card game: small, round and very collectible.',
    imageUrl: `${ASSET_URL}/game.svg`,
  },
  rarities,
  sets: sets.map((set) => ({
    code: set.code,
    name: set.name,
    description: set.description,
    imageUrl: `${ASSET_URL}/${set.code}/set.svg`,
    releasedOn: set.releasedOn,
    cards: set.cards.map((card) => ({
      number: card.number,
      name: card.name,
      rarity: card.rarity,
      imageUrl: `${ASSET_URL}/${set.code}/cards/${card.number}.svg`,
      metadata: { type: card.type, hp: card.hp, flavor: card.flavor },
    })),
    packs: set.packs.map((pack) => ({
      code: pack.code,
      name: pack.name,
      description: pack.description,
      imageUrl: `${ASSET_URL}/${set.code}/packs/${pack.code}.svg`,
      slots,
      // Every common and uncommon of the set, plus this pack's own rares.
      cards: set.cards
        .filter((card) => tierOf[card.rarity] <= 2 || pack.rares.includes(card.number))
        .map((card) => card.number),
    })),
  })),
}
write(DATASET_FILE, JSON.stringify(dataset, null, 2) + '\n')

const cards = sets.reduce((sum, set) => sum + set.cards.length, 0)
console.log(`Cyan Critters: ${sets.length} sets, ${cards} cards, ${files} images, dataset at ${DATASET_FILE}`)
