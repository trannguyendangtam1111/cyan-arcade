import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The width of an element, in whole pixels, kept up to date as it resizes; `null` until it is known
 * (and where `ResizeObserver` is missing, as in tests). Put the returned `ref` on the element. The
 * observer reports the first width as soon as it starts watching, before the browser paints.
 * @param watching whether the element is on the page: measuring starts again whenever this turns true
 */
export function useElementWidth<T extends HTMLElement>(watching = true) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!watching || !element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [watching])

  return { ref, width }
}
