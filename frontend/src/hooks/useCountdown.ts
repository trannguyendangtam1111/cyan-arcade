import { useEffect, useState } from 'react'

const TICK_MS = 30_000

/**
 * Milliseconds left until a moment, refreshed twice a minute: often enough for a label that
 * counts in minutes, rare enough to cost nothing. `null` while the moment is unknown; never
 * negative.
 */
export function useCountdown(until: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!until) return
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [until])

  if (!until) return null
  return Math.max(0, new Date(until).getTime() - now)
}
