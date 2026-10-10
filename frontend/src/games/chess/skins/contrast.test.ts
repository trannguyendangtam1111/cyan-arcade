import { describe, expect, it } from 'vitest'
import { contrast } from '@/lib/accent'
import { BOARD_THEMES, PIECE_SETS } from '.'

/** WCAG's bar for graphics that must be told apart. */
const GRAPHICS = 3

/** A colour with transparency, laid over the square it is drawn on. */
function over(colour: string, background: string): string {
  const rgba = colour.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
  if (!rgba) return colour
  const [r, g, b, a] = rgba.slice(1).map(Number)
  const base = [1, 3, 5].map((index) => parseInt(background.slice(index, index + 2), 16))
  const mixed = [r, g, b].map((channel, index) => Math.round(channel * a + base[index] * (1 - a)))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

describe('chess looks', () => {
  it.each(BOARD_THEMES.flatMap((board) => PIECE_SETS.map((pieces) => [board.name, pieces.name, board, pieces] as const)))(
    '%s with %s keeps every piece readable on both squares',
    (_, __, board, pieces) => {
      for (const square of [board.light, board.dark]) {
        // A piece's edge is its outline, or the halo around it: one of them stands out on the square.
        const edge = Math.max(contrast(pieces.outline, square), contrast(over(board.halo, square), square))
        expect(edge).toBeGreaterThanOrEqual(GRAPHICS)
      }
      // And the two sides are never confused.
      expect(contrast(pieces.whiteFill, pieces.blackFill)).toBeGreaterThanOrEqual(GRAPHICS)
    },
  )

  it.each(BOARD_THEMES.map((board) => [board.name, board] as const))('%s has coordinates that can be read', (_, board) => {
    expect(contrast(board.lightInk, board.light)).toBeGreaterThanOrEqual(GRAPHICS)
    expect(contrast(board.darkInk, board.dark)).toBeGreaterThanOrEqual(GRAPHICS)
    expect(contrast(board.light, board.dark)).toBeGreaterThan(1.5)
  })
})
