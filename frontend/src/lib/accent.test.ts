import { describe, expect, it } from 'vitest'
import { accentStyle, contrast, luminance, readableOn } from './accent'

/** The smallest contrast WCAG AA accepts for ordinary text. */
const AA = 4.5

describe('contrast', () => {
  it('measures luminance from black to white', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1)
  })

  it('gives the WCAG ratio, whichever color comes first', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1)
  })
})

describe('readableOn', () => {
  it('picks dark ink for light colors and white for dark ones', () => {
    expect(readableOn('#fef08a')).toBe('#16323f')
    expect(readableOn('#1e1b4b')).toBe('#ffffff')
  })

  // The accent colors of the game catalog: snake, 2048, tetris.
  it.each(['#22c55e', '#f59e0b', '#7c3aed'])('gives text on the game accent %s enough contrast', (accent) => {
    expect(contrast(accent, readableOn(accent))).toBeGreaterThanOrEqual(AA)
  })

  it('shows why white text on the brand cyan was replaced by dark text', () => {
    const cyan = '#06b6d4'
    expect(contrast(cyan, '#ffffff')).toBeLessThan(3)
    expect(contrast(cyan, '#083344')).toBeGreaterThanOrEqual(AA)
  })
})

describe('accentStyle', () => {
  it('sets the accent and the text color that goes on it', () => {
    expect(accentStyle('#22c55e')).toEqual({ '--accent': '#22c55e', '--accent-ink': '#16323f' })
    expect(accentStyle('#7c3aed')).toEqual({ '--accent': '#7c3aed', '--accent-ink': '#ffffff' })
  })
})
