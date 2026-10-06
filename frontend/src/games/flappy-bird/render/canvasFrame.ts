import { WORLD } from '../engine/flappyEngine'

export interface CanvasFrame {
  /** The canvas's size in device pixels. */
  width: number
  height: number
  /** Device pixels per world unit, the same across and down. */
  scale: number
}

/**
 * The playfield canvas for a box `cssWidth` CSS pixels wide on a screen with this pixel ratio (up to
 * 2 device pixels per CSS pixel). The canvas keeps the world's shape and the world is drawn with one
 * scale on both axes, so what is drawn sits exactly where the engine has it, on any screen: collision
 * happens in world units and never depends on the screen.
 */
export function canvasFrame(cssWidth: number, devicePixelRatio: number): CanvasFrame {
  const ratio = Math.min(devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(cssWidth * ratio))
  return { width, height: Math.round((width * WORLD.height) / WORLD.width), scale: width / WORLD.width }
}
