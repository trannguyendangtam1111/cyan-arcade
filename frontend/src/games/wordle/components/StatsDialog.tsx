import { Check, Copy, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { formatTimeLeft } from '@/lib/format'
import { fetchStats } from '../api/wordleApi'
import { resultGrid } from '../engine/board'
import type { RunView, StatsView } from '../types/wordleTypes'

interface StatsDialogProps {
  open: boolean
  onClose: () => void
  /** Today's run, to highlight its row and offer a spoiler-free copy once it is over. */
  today: RunView | null
  puzzleNumber: number | null
  nextPuzzleAt: string | null
}

/** The player's daily puzzles: wins, streaks and how many guesses they usually need. */
export function StatsDialog({ open, onClose, today, puzzleNumber, nextPuzzleAt }: StatsDialogProps) {
  const [stats, setStats] = useState<StatsView | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    fetchStats(controller.signal)
      .then((loaded) => {
        setStats(loaded)
        setFailed(false)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true)
      })
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      controller.abort()
      window.clearInterval(tick)
    }
  }, [open])

  const finished = today && today.status !== 'PLAYING'
  const solvedIn = today?.status === 'SOLVED' ? today.guesses.length : null
  const most = Math.max(1, ...(stats?.distribution ?? [1]))

  const copy = async () => {
    if (!today) return
    const line = `Cyan Arcade Word Guess #${puzzleNumber ?? ''} ${solvedIn ?? 'X'}/6${today.hints.length ? ` (${today.hints.length} hint${today.hints.length === 1 ? '' : 's'})` : ''}`
    try {
      await navigator.clipboard.writeText(`${line}\n${resultGrid(today.guesses)}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Your Daily Word" footer={<Button onClick={onClose}>Close</Button>}>
      {!stats && !failed && (
        <p className="flex items-center gap-2 text-sm">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Loading your statistics…
        </p>
      )}
      {failed && <p className="text-sm text-danger">Your statistics couldn't be loaded.</p>}
      {stats && (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-5 gap-1 text-center">
            {[
              ['Played', stats.played],
              ['Win %', stats.winRate],
              ['Streak', stats.currentStreak],
              ['Best', stats.bestStreak],
              ['Avg', stats.averageGuesses ?? '–'],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse items-center">
                <dt className="text-[0.7rem] font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
                <dd className="font-display text-2xl font-semibold text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="wordle-distribution">
            <h3 id="wordle-distribution" className="mb-2 font-display text-sm font-semibold text-ink">
              Guesses to solve
            </h3>
            <ol className="flex flex-col gap-1">
              {stats.distribution.map((count, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="w-3 font-bold text-ink tabular-nums">{index + 1}</span>
                  <span
                    aria-label={`${count} solved in ${index + 1}`}
                    className={cn(
                      'flex h-6 min-w-7 items-center justify-end rounded-md px-2 text-xs font-bold text-white tabular-nums',
                      solvedIn === index + 1 ? 'bg-(--accent)' : 'bg-slate-400',
                    )}
                    style={{ width: `${Math.max(8, (count / most) * 100)}%` }}
                  >
                    {count}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {nextPuzzleAt && (
          <p className="text-sm">
            Next puzzle in <strong className="text-ink">{formatTimeLeft(Date.parse(nextPuzzleAt) - now)}</strong>
          </p>
        )}
        {finished && (
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            {copied ? 'Copied' : 'Copy result'}
          </Button>
        )}
      </div>
    </Modal>
  )
}
