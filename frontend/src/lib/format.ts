/** Formats a run length: `8.7s` under a minute, `1:05` from a minute, `1:02:03` from an hour. */
export function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`

  const seconds = Math.floor(totalSeconds) % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** Formats how long is left until something, to the minute: `5h 12m`, `12m`, `under a minute`. */
export function formatTimeLeft(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 1) return 'under a minute'

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Formats an ISO timestamp as a short date in the viewer's locale, e.g. "30 Sep 2026". */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Formats an ISO timestamp as a short date and time in the viewer's locale and time zone. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

const numberFormat = new Intl.NumberFormat()

/** Formats a score with thousands separators in the viewer's locale. */
export function formatScore(score: number): string {
  return numberFormat.format(score)
}
