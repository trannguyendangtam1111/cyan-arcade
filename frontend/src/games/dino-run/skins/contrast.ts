/**
 * Colour contrast, as WCAG measures it (relative luminance, ratio 1 to 21). Used to keep obstacles
 * readable against every world they run through: WCAG asks 3:1 for graphics that must be seen.
 */

/** The colour as red, green, blue (0–255) and alpha (0–1); `null` for anything it cannot read. */
export function parseColour(colour: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    return [parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16), 1]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(colour.trim())
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  return null
}

export function luminance(colour: string): number {
  const parsed = parseColour(colour)
  if (!parsed) return 0
  const [r, g, b] = parsed.slice(0, 3).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** WCAG's minimum for graphics that must be seen (1.4.11). */
export const GRAPHIC_CONTRAST = 3
