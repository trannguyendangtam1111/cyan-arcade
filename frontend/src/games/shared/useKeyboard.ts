import { useEffect, useRef } from 'react'

/**
 * Listens for key presses on the window while `enabled`.
 *
 * The handler returns `true` when it used the key; the default browser action (scrolling on arrow
 * keys or space) is then prevented. Keys typed into form fields or combined with a modifier are
 * ignored, so browser and assistive-technology shortcuts keep working.
 */
export function useKeyboard(handler: (event: KeyboardEvent) => boolean, enabled = true): void {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement) {
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return
        // Space and Enter must keep activating a focused button or link.
        if ((event.key === ' ' || event.key === 'Enter') && target.closest('button, a')) return
      }
      if (latest.current(event)) {
        event.preventDefault()
        // The player is now using the keyboard for the game: release any button that was clicked
        // earlier, so that a later Space or Enter reaches the game instead of re-pressing it.
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
