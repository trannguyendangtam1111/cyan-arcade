import { ChevronLeft, ChevronRight, History, Play } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { fetchArchivePuzzle } from '../api/sudokuApi'
import { DIFFICULTY_LABELS, type ArchivePuzzleView } from '../types/sudokuTypes'

const DAY_MS = 86_400_000

/** A UTC date (`YYYY-MM-DD`) moved by whole days. */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function longDate(date: string): string {
  return LONG_DATE.format(new Date(`${date}T00:00:00Z`))
}

/** A day back or forward: a 44px touch target. */
const STEP =
  'grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-ink-soft ring-2 ring-line transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'

type Lookup = { date: string; puzzle: ArchivePuzzleView } | { date: string; error: string }

interface ArchivePickerProps {
  /** Today's UTC date and Daily number: the archive is every day before it. */
  today: string
  puzzleNumber: number
  /** The date to open on; yesterday when absent or out of range. */
  initialDate: string | null
  busy: boolean
  onPlay: (date: string) => void
}

/**
 * Picks a past Daily puzzle by UTC date and replays it unranked. Only its number and difficulty are
 * shown here; the board stays hidden until the replay starts.
 */
export function ArchivePicker({ today, puzzleNumber, initialDate, busy, onPlay }: ArchivePickerProps) {
  const first = addDays(today, -(puzzleNumber - 1))
  const last = addDays(today, -1)
  const empty = puzzleNumber <= 1
  const [date, setDate] = useState(() => (initialDate && initialDate >= first && initialDate <= last ? initialDate : last))
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const headingId = useId()
  const inputId = useId()

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= first && date <= last
  useEffect(() => {
    if (empty || !valid) return
    const controller = new AbortController()
    fetchArchivePuzzle(date, controller.signal)
      .then((puzzle) => setLookup({ date, puzzle }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLookup({ date, error: error instanceof ApiError && error.status > 0 ? error.message : "Couldn't reach the arcade. Try again." })
      })
    return () => controller.abort()
  }, [date, valid, empty])

  const current = lookup?.date === date ? lookup : null
  const puzzle = current && 'puzzle' in current ? current.puzzle : null

  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col items-center gap-2.5">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <h2 id={headingId} className="flex items-center gap-1.5 font-display text-xl font-semibold">
          <History aria-hidden className="size-5 text-brand-600" />
          Daily archive
        </h2>
        <UnrankedBadge />
      </div>
      {empty ? (
        <p className="text-sm text-ink-soft">No past puzzles yet: the archive starts tomorrow, with today&apos;s Daily.</p>
      ) : (
        <>
          <div className="flex w-full flex-col gap-1 text-left">
            <label htmlFor={inputId} className="text-xs font-semibold text-ink-soft">
              Puzzle date (UTC)
            </label>
            <div className="flex w-full items-center gap-1.5">
              <button type="button" className={STEP} aria-label="Previous day" disabled={valid && date <= first} onClick={() => setDate(valid ? addDays(date, -1) : last)}>
                <ChevronLeft aria-hidden className="size-5" />
              </button>
              <input
                id={inputId}
                type="date"
                value={date}
                min={first}
                max={last}
                required
                onChange={(event) => setDate(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl bg-surface px-2 text-center font-display text-sm font-semibold text-ink ring-2 ring-line focus:ring-(--accent) focus:outline-none"
              />
              <button type="button" className={STEP} aria-label="Next day" disabled={valid && date >= last} onClick={() => setDate(valid ? addDays(date, 1) : last)}>
                <ChevronRight aria-hidden className="size-5" />
              </button>
            </div>
          </div>
          <div aria-live="polite" className="min-h-[2.5rem] text-sm leading-5">
            {!valid ? (
              <p className="text-danger">
                Pick a date from {longDate(first)} to {longDate(last)}.
              </p>
            ) : puzzle ? (
              <>
                <p className="font-display font-semibold text-ink">
                  Daily Sudoku #{puzzle.puzzleNumber} · {DIFFICULTY_LABELS[puzzle.difficulty]}
                </p>
                <p className="text-ink-soft">{longDate(puzzle.date)} (UTC)</p>
              </>
            ) : current && 'error' in current ? (
              <p className="text-danger">{current.error}</p>
            ) : (
              <p className="text-ink-soft">Looking it up…</p>
            )}
          </div>
          <Button onClick={() => puzzle && onPlay(puzzle.date)} disabled={busy || !valid || !puzzle}>
            <Play aria-hidden className="size-4" />
            Play unranked
          </Button>
          <p className="text-xs text-ink-soft">No score, streak or rewards; your Daily results stay as they are. Replay as often as you like.</p>
        </>
      )}
    </section>
  )
}

/** Marks an archive replay as not counting. */
export function UnrankedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 font-display text-xs font-semibold text-amber-900 ring-1 ring-amber-300">
      Practice / Unranked
    </span>
  )
}
