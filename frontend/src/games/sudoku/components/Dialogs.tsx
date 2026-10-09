import { LoaderCircle, Trophy, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { formatScore, formatTimeLeft } from '@/lib/format'
import { fetchStats } from '../api/sudokuApi'
import { formatClock } from '../engine/format'
import type { SudokuSettings } from '../hooks/useSettings'
import { DIFFICULTIES, DIFFICULTY_LABELS, type ModeStats, type RunView, type StatsView } from '../types/sudokuTypes'

// --- Settings ----------------------------------------------------------------------------------------

const SETTING_LABELS: { key: keyof SudokuSettings; label: string; hint: string }[] = [
  { key: 'highlightRelated', label: 'Highlight row, column and box', hint: 'Tints the cells that share a house with the selected one.' },
  { key: 'highlightSame', label: 'Highlight same numbers', hint: 'Tints every cell with the selected digit.' },
  { key: 'highlightConflicts', label: 'Highlight conflicts', hint: 'Marks digits that repeat in a row, column or box.' },
  { key: 'showMistakes', label: 'Show mistakes', hint: 'Marks digits that are wrong (ranked games). The counter counts them either way.' },
  { key: 'autoRemoveNotes', label: 'Auto-remove notes', hint: 'Placing a digit removes it from the notes it rules out.' },
  { key: 'keyboardShortcuts', label: 'Keyboard shortcuts', hint: 'N notes, H hint, Esc pause, Ctrl+Z / Ctrl+Y undo and redo.' },
]

export function SettingsDialog({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean
  onClose: () => void
  settings: SudokuSettings
  onChange: (key: keyof SudokuSettings, value: boolean) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Settings" footer={<Button onClick={onClose}>Done</Button>}>
      <ul className="flex flex-col gap-3">
        {SETTING_LABELS.map(({ key, label, hint }) => (
          <li key={key}>
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span>
                <span className="block font-bold text-ink">{label}</span>
                <span className="block text-xs">{hint}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings[key]}
                onChange={(event) => onChange(key, event.target.checked)}
                className="mt-1 size-5 shrink-0 accent-brand-600"
              />
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs">Settings are kept in this browser. They change how the board helps you, never the rules or the score.</p>
    </Modal>
  )
}

// --- Statistics --------------------------------------------------------------------------------------

export function StatsDialog({ open, onClose, nextPuzzleAt }: { open: boolean; onClose: () => void; nextPuzzleAt: string | null }) {
  const [stats, setStats] = useState<StatsView | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<'daily' | 'practice'>('daily')
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

  return (
    <Modal open={open} onClose={onClose} title="Your Sudoku" footer={<Button onClick={onClose}>Close</Button>}>
      {!stats && !failed && (
        <p className="flex items-center gap-2 text-sm">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Loading your statistics…
        </p>
      )}
      {failed && <p className="text-sm text-danger">Your statistics couldn't be loaded.</p>}
      {stats && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2 text-center">
            <Tile label="Current streak" value={stats.currentStreak} />
            <Tile label="Best streak" value={stats.bestStreak} />
          </dl>
          <div role="tablist" aria-label="Statistics" className="grid grid-cols-2 gap-1 rounded-control bg-surface-muted p-1">
            {(['daily', 'practice'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn('h-8 rounded-xl text-sm font-bold', tab === value ? 'bg-surface text-ink shadow-soft' : 'text-ink-soft')}
              >
                {value === 'daily' ? 'Daily' : 'Practice'}
              </button>
            ))}
          </div>
          <ModeTable stats={stats[tab]} />
          <p className="text-xs">Ranked games only: relaxed practice is not counted. Streaks are daily puzzles solved on days in a row (UTC).</p>
        </div>
      )}
      {nextPuzzleAt && (
        <p className="mt-4 border-t border-line pt-3 text-sm">
          Next daily puzzle in <strong className="text-ink">{formatTimeLeft(Date.parse(nextPuzzleAt) - now)}</strong>
        </p>
      )}
    </Modal>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col-reverse items-center rounded-control bg-surface-muted px-2 py-2">
      <dt className="text-[0.7rem] font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="font-display text-2xl font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  )
}

function ModeTable({ stats }: { stats: ModeStats }) {
  const time = (seconds: number | null) => (seconds === null ? '–' : formatClock(seconds * 1000))
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Tile label="Played" value={stats.played} />
        <Tile label="Solved" value={stats.completed} />
        <Tile label="Win %" value={stats.winRate} />
        <Tile label="Avg time" value={time(stats.averageSeconds)} />
        <Tile label="Avg mistakes" value={stats.averageMistakes ?? '–'} />
        <Tile label="Avg hints" value={stats.averageHints ?? '–'} />
      </dl>
      <table className="w-full text-sm">
        <caption className="mb-1 text-left font-display font-semibold text-ink">Best times</caption>
        <tbody>
          {DIFFICULTIES.map((difficulty) => (
            <tr key={difficulty} className="border-t border-line">
              <th scope="row" className="py-1 text-left font-bold text-ink-soft">
                {DIFFICULTY_LABELS[difficulty]}
              </th>
              <td className="py-1 text-right font-bold text-ink tabular-nums">{time(stats.bestSeconds[difficulty])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Completion --------------------------------------------------------------------------------------

export function CompletionDialog({
  run,
  onClose,
  onStats,
  onNewGame,
  onShowSolution,
}: {
  run: RunView | null
  onClose: () => void
  onStats: () => void
  onNewGame: () => void
  onShowSolution: () => void
}) {
  const solved = run?.status === 'SOLVED'
  const result = run?.result ?? null
  return (
    <Modal
      open={run !== null}
      onClose={onClose}
      title={solved ? 'Solved!' : 'Out of mistakes'}
      footer={
        <>
          {!solved && (
            <Button variant="secondary" onClick={onShowSolution}>
              See the solution
            </Button>
          )}
          <Button variant="secondary" onClick={onStats}>
            Statistics
          </Button>
          <Button onClick={onNewGame}>New practice game</Button>
        </>
      }
    >
      {run && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {solved ? <Trophy aria-hidden className="size-10 text-amber-500" /> : <XCircle aria-hidden className="size-10 text-danger" />}
            <p>
              {run.mode === 'DAILY' ? `Daily Sudoku #${run.puzzleNumber}` : 'Practice'} · {DIFFICULTY_LABELS[run.difficulty]}
              {!run.ranked && ' · relaxed'}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Tile label="Time" value={formatClock(result ? result.seconds * 1000 : run.elapsedMs)} />
            <Tile label="Mistakes" value={run.mistakeLimit > 0 ? `${run.mistakes}/${run.mistakeLimit}` : run.mistakes} />
            <Tile label="Hints" value={run.hintsUsed} />
            <Tile label="Score" value={result ? formatScore(result.score) : '–'} />
          </dl>
          {result && solved && (
            <p className="text-sm">
              Base {DIFFICULTY_LABELS[run.difficulty].toLowerCase()} score × time {result.timePercent}% × mistakes {result.mistakePercent}% × hints{' '}
              {result.hintPercent}%.
            </p>
          )}
          {!run.ranked && <p className="text-sm">Relaxed games are just for fun: no score, no rewards.</p>}
        </div>
      )}
    </Modal>
  )
}

// --- Confirmation ------------------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  title,
  text,
  confirm,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  text: string
  confirm: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onClose()
              onConfirm()
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  )
}
