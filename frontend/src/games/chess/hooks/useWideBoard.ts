import { useSyncExternalStore } from 'react'

/** From this width the evaluation bar stands beside the board; below it, a strip above the board. */
const WIDE = '(min-width: 640px)'

const media = () => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null)

function subscribe(onChange: () => void) {
  const query = media()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** Whether the screen is wide enough for a bar beside the board (without media queries: yes). */
export function useWideBoard(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? true,
    () => true,
  )
}
