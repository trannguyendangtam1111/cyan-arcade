import { useRef, type PointerEvent } from 'react'

export type SwipeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

const MIN_SWIPE_DISTANCE = 24

/**
 * Turns a drag on an element into a direction. Spread the returned handlers onto the element and
 * give it the `touch-none` class so the browser does not scroll the page during the gesture.
 */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onPointerDown: (event: PointerEvent) => {
      start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: PointerEvent) => {
      const origin = start.current
      start.current = null
      if (!origin) return

      const dx = event.clientX - origin.x
      const dy = event.clientY - origin.y
      if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_DISTANCE) return

      if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? 'RIGHT' : 'LEFT')
      else onSwipe(dy > 0 ? 'DOWN' : 'UP')
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
