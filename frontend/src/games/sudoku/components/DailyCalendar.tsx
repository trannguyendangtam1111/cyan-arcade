import { Check, Hourglass, X } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { formatClock } from '../engine/format'
import { DIFFICULTY_LABELS, type DailyHistoryView, type DayStatus, type HistoryDayView } from '../types/sudokuTypes'

/**
 * The player's last 30 UTC dates of Daily Sudoku as a small calendar, Monday first: one button a
 * day, coloured and marked by what they did with that day's puzzle. Arrow keys move a day (up and
 * down a week), Home and End jump to the ends; the chosen day's run is shown under the calendar.
 */

const STATUS_LABELS: Record<DayStatus, string> = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  IN_PROGRESS: 'In progress',
  NOT_ATTEMPTED: 'Not attempted',
  NO_PUZZLE: 'No puzzle',
}

const LEGEND: DayStatus[] = ['COMPLETED', 'FAILED', 'IN_PROGRESS', 'NOT_ATTEMPTED']

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const utcDay = (date: string) => new Date(`${date}T00:00:00Z`)

const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "Saturday 7 November 2026". */
const spoken = (date: string) => longDate.format(utcDay(date)).replace(',', '')

/** Mon = 0 … Sun = 6. */
const weekdayIndex = (date: string) => (utcDay(date).getUTCDay() + 6) % 7

const DAY_STYLES: Record<DayStatus, string> = {
  COMPLETED: 'bg-success text-night',
  FAILED: 'bg-danger text-night',
  IN_PROGRESS: 'border-2 border-warning bg-warning/25 text-ink',
  NOT_ATTEMPTED: 'bg-surface-muted text-ink-soft',
  NO_PUZZLE: 'border border-dashed border-line text-ink-soft/60',
}

function StatusMark({ status, className }: { status: DayStatus; className?: string }) {
  if (status === 'COMPLETED') return <Check aria-hidden strokeWidth={3} className={className} />
  if (status === 'FAILED') return <X aria-hidden strokeWidth={3} className={className} />
  if (status === 'IN_PROGRESS') return <Hourglass aria-hidden strokeWidth={2.5} className={className} />
  return null
}

export function DailyCalendar({ history }: { history: DailyHistoryView }) {
  const { days, today } = history
  const [selected, setSelected] = useState(days.length - 1)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const lead = days.length > 0 ? weekdayIndex(days[0].date) : 0

  const choose = (index: number) => {
    const next = Math.min(days.length - 1, Math.max(0, index))
    setSelected(next)
    buttons.current[next]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: selected - 1, ArrowRight: selected + 1, ArrowUp: selected - 7, ArrowDown: selected + 7, Home: 0, End: days.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    choose(moves[event.key])
  }

  const day = days[selected]
  return (
    <section aria-labelledby="sudoku-history-title" className="@container flex flex-col gap-2">
      <h3 id="sudoku-history-title" className="font-display font-semibold text-ink">
        Last 30 days
      </h3>
      {/* On the narrowest phones the calendar takes some of the dialog's side padding, for wider days. */}
      <div aria-hidden className="-mx-4 grid grid-cols-7 gap-1 text-center text-[0.65rem] font-bold tracking-wide text-ink-soft uppercase @min-[17rem]:mx-0">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday.slice(0, 2)}</span>
        ))}
      </div>
      <div role="radiogroup" aria-label="Daily history, UTC dates" aria-describedby="sudoku-history-note" onKeyDown={onKeyDown} className="-mx-4 grid grid-cols-7 gap-1 @min-[17rem]:mx-0">
        {Array.from({ length: lead }, (_, index) => (
          <span key={`lead-${index}`} aria-hidden />
        ))}
        {days.map((entry, index) => {
          const isToday = entry.date === today
          const isSelected = index === selected
          return (
            <button
              key={entry.date}
              ref={(button) => {
                buttons.current[index] = button
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${spoken(entry.date)}: ${STATUS_LABELS[entry.status]}${isToday ? ', today' : ''}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => choose(index)}
              data-status={entry.status}
              className={cn(
                'flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-bold tabular-nums transition-transform focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                DAY_STYLES[entry.status],
                isSelected && 'scale-105 ring-3 ring-brand-500 ring-offset-2 ring-offset-surface',
              )}
            >
              <span className={cn(isToday && 'underline decoration-2 underline-offset-2')}>{utcDay(entry.date).getUTCDate()}</span>
              <StatusMark status={entry.status} className="size-3" />
            </button>
          )
        })}
      </div>
      <ul aria-label="Legend" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {LEGEND.map((status) => (
          <li key={status} className="flex items-center gap-1">
            <span aria-hidden className={cn('flex size-4 items-center justify-center rounded', DAY_STYLES[status])}>
              <StatusMark status={status} className="size-2.5" />
            </span>
            {STATUS_LABELS[status]}
          </li>
        ))}
      </ul>
      {day && <DayDetails day={day} isToday={day.date === today} />}
      <p id="sudoku-history-note" className="text-xs">
        Days follow UTC dates: each Daily runs from 00:00 to 24:00 UTC, so a day here may start or end at a different time where you are.
      </p>
    </section>
  )
}

function DayDetails({ day, isToday }: { day: HistoryDayView; isToday: boolean }) {
  const date = `${shortDate.format(utcDay(day.date)).replace(',', '')} (UTC)`
  const title = day.puzzleNumber === null ? 'No Daily puzzle' : `Daily Sudoku #${day.puzzleNumber}${day.difficulty ? ` · ${DIFFICULTY_LABELS[day.difficulty]}` : ''}`
  const played = day.status === 'COMPLETED' || day.status === 'FAILED' || day.status === 'IN_PROGRESS'
  return (
    <section aria-live="polite" aria-label="Selected day" className="rounded-control bg-surface-muted p-3 text-sm">
      <p className="font-bold text-ink">{date}</p>
      <p className="flex items-center gap-1.5">
        {title} ·{' '}
        <span className="inline-flex items-center gap-1 font-bold text-ink">
          <span aria-hidden className={cn('flex size-4 items-center justify-center rounded', DAY_STYLES[day.status])}>
            <StatusMark status={day.status} className="size-2.5" />
          </span>
          {STATUS_LABELS[day.status]}
        </span>
      </p>
      {played && (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Time" value={day.seconds === null ? '–' : formatClock(day.seconds * 1000)} />
          <Stat label="Mistakes" value={day.mistakes ?? '–'} />
          <Stat label="Hints" value={day.hints ?? '–'} />
        </dl>
      )}
      {day.status === 'COMPLETED' && day.streak !== null && day.streak > 0 && (
        <p className="mt-2 text-xs">
          Streak after this day: <strong className="text-ink">{day.streak}</strong>
        </p>
      )}
      {day.status === 'IN_PROGRESS' && <p className="mt-2 text-xs">Started and not finished yet: the time is counted when the run ends.</p>}
      {day.status === 'NOT_ATTEMPTED' && <p className="mt-2 text-xs">{isToday ? "You haven't started today's puzzle yet." : 'You did not play this puzzle.'}</p>}
      {day.status === 'NO_PUZZLE' && <p className="mt-2 text-xs">The Daily Sudoku had not started on this date.</p>}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col-reverse items-center rounded-lg bg-surface px-1 py-1">
      <dt className="text-[0.65rem] font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="font-display text-lg font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  )
}
