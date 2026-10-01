import type { CSSProperties } from 'react'

/**
 * Accent colors: every game has one (from the catalog), and whatever takes that color on also
 * needs a text color that can be read on it.
 */

/** The app's dark text color, as in the `--color-ink` token. */
const INK = '#16323f'
const WHITE = '#ffffff'

/** Relative luminance of a `#rrggbb` color, 0 (black) to 1 (white), as WCAG defines it. */
export function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

/** WCAG contrast ratio between two `#rrggbb` colors, from 1 (none) to 21 (black on white). */
export function contrast(first: string, second: string): number {
  const [darker, lighter] = [luminance(first), luminance(second)].sort((a, b) => a - b)
  return (lighter + 0.05) / (darker + 0.05)
}

/** White or dark ink, whichever is easier to read on the given background. */
export function readableOn(background: string): string {
  return contrast(background, WHITE) >= contrast(background, INK) ? WHITE : INK
}

/**
 * Inline style that gives an element, and everything inside it, a game's color: `--accent` for
 * the color itself and `--accent-ink` for text and icons placed on it. Use them as
 * `bg-(--accent)` and `text-(--accent-ink)`.
 */
export function accentStyle(color: string): CSSProperties {
  return { '--accent': color, '--accent-ink': readableOn(color) } as CSSProperties
}
