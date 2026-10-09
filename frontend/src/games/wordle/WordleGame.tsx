import { BarChart3, CalendarDays, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { GameShell, Key, type GameStat } from '@/games/shared/components/GameShell'
import type { AiStatus } from '@/games/shared/components/AiPanel'
import { usePlaySession } from '@/games/shared/usePlaySession'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import type { AiAction, WordleAiPlayer } from './ai/wordleAiPlayer'
import { AiControls } from './components/AiControls'
import { Board } from './components/Board'
import { Confetti } from './components/Confetti'
import { HintBar } from './components/HintBar'
import { Keyboard } from './components/Keyboard'
import { LookPicker } from './components/LookPicker'
import { ResultPanel } from './components/ResultPanel'
import { StatsDialog } from './components/StatsDialog'
import { boardRows, keyAction, keyboardStates, MAX_GUESSES } from './engine/board'
import { useLook } from './hooks/useLook'
import { useWordleAi } from './hooks/useWordleAi'
import { FLIP_MS, useWordleGame, type PlayMode } from './hooks/useWordleGame'
import type { AiSolution } from './types/wordleTypes'
import './wordle.css'

const FIRST_DAY = '2026-01-01'

/** Word Guess's screen. The play lives in `useWordleGame` (and `useWordleAi` for admins); this lays it out. */
export default function WordleGame(props: GameProps<WordleAiPlayer>) {
  const { ai: createAi } = props
  const player = useMemo(() => createAi?.(), [createAi])
  const session = usePlaySession()
  const isAi = session.mode === 'ai' && player !== undefined
  const game = useWordleGame(props)
  const ai = useWordleAi(player, session.speed, session.paused, game.daily?.date ?? null)
  const look = useLook(props.cosmetics)
  const [statsOpen, setStatsOpen] = useState(false)

  const { press, cancelPicking } = game
  // The physical keyboard plays the human game, unless a dialog or a form field has the keys.
  useEffect(() => {
    if (isAi || statsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape') return cancelPicking()
      const action = keyAction(event.key)
      if (!action) return
      event.preventDefault()
      press(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAi, statsOpen, press, cancelPicking])

  const aiSolved = ai.state === 'finished' && ai.solution?.solved === true
  // A new key plays the confetti again: each solve, the player's or the AI's.
  const confetti = isAi ? (aiSolved ? `ai-${ai.history.length}` : null) : game.celebration > 0 ? `player-${game.celebration}` : null

  const flipMs = isAi ? Math.min(900, Math.max(90, FLIP_MS / session.speed)) : FLIP_MS

  // --- What the board shows: the player's game, or the AI's ----------------------------------
  const run = game.run
  const frame = ai.frame
  const guesses = isAi ? (frame?.guesses ?? []) : (run?.guesses ?? [])
  const hints = isAi ? [] : (run?.hints ?? [])
  const over = isAi ? (frame?.done ?? false) : game.over
  const rows = boardRows(guesses, isAi ? (frame?.input ?? '') : game.input, { over, hints })
  const states = keyboardStates(guesses, hints)
  const reveal = isAi
    ? ai.last?.kind === 'submit'
      ? { row: guesses.length - 1, key: ai.played }
      : null
    : game.reveal
  const solved = isAi ? aiSolved : run?.status === 'SOLVED'
  const pressed = isAi && ai.last?.kind === 'type' && frame ? { letter: frame.input.slice(-1), id: ai.played } : undefined

  const puzzleLabel = game.daily ? `#${game.daily.puzzleNumber}` : '…'
  const stats: GameStat[] = isAi
    ? [
        { label: 'Puzzle', value: ai.solution ? `#${ai.solution.puzzleNumber}` : '–' },
        { label: 'Guess', value: `${guesses.length}/${MAX_GUESSES}` },
        { label: 'Words left', value: aiWordsLeft(ai.solution, guesses.length) },
        { label: 'Score', value: ai.state === 'finished' && ai.solution ? ai.solution.score : '–' },
      ]
    : [
        { label: 'Puzzle', value: game.mode === 'daily' ? puzzleLabel : 'Practice' },
        { label: 'Guess', value: `${guesses.length}/${MAX_GUESSES}` },
        { label: 'Hints', value: run?.hintsLeft ?? 3 },
        { label: 'Streak', value: game.stats?.currentStreak ?? 0 },
      ]

  const board = (
    <div className="relative flex w-full flex-col items-center gap-3">
      {!isAi && <ModeTabs mode={game.mode} onChange={game.setMode} />}

      {game.message && !isAi && (
        <p
          key={game.message.id}
          role="status"
          className={cn(
            'pointer-events-none absolute top-12 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 font-display text-sm font-semibold whitespace-nowrap shadow-lift motion-safe:animate-pop-in',
            game.message.tone === 'error' ? 'bg-danger text-white' : game.message.tone === 'success' ? 'bg-(--accent) text-(--accent-ink)' : 'bg-ink text-white',
          )}
        >
          {game.message.text}
        </p>
      )}

      {!isAi && !game.daily && game.loadFailed && game.mode === 'daily' ? (
        <ErrorState title="Today's puzzle couldn't be loaded" onRetry={game.reload} />
      ) : (
        <div className="relative">
          <Board
            rows={rows}
            theme={look.tiles}
            reveal={reveal}
            activeRow={over ? -1 : guesses.length}
            shakeKey={isAi ? 0 : game.shakeKey}
            solvedRow={solved ? guesses.length - 1 : null}
            flipMs={flipMs}
            label={isAi ? 'AI board' : game.mode === 'daily' ? `Daily Word ${puzzleLabel}` : 'Practice board'}
          />
          {confetti && <Confetti key={confetti} />}
        </div>
      )}

      {isAi ? (
        <Keyboard states={states} onKey={() => undefined} tiles={look.tiles} theme={look.keyboard} disabled pressed={pressed} />
      ) : game.over && !game.settling && run ? (
        <ResultPanel run={run} onStats={() => setStatsOpen(true)} onPractice={game.newPractice} />
      ) : (
        <>
          <HintBar
            available={run?.availableHints ?? ['REVEAL_LETTER', 'CHECK_LETTER', 'ELIMINATE_LETTERS']}
            taken={hints}
            hintPercents={game.daily?.hintPercents ?? [100, 90, 75, 60]}
            onHint={(type) => game.hint(type)}
            picking={game.picking}
            disabled={game.busy || game.over || game.settling || (game.mode === 'daily' && !game.daily)}
          />
          <Keyboard
            states={states}
            onKey={press}
            tiles={look.tiles}
            theme={look.keyboard}
            disabled={game.busy || game.settling || (game.mode === 'daily' && !game.daily)}
            picking={game.picking}
          />
        </>
      )}
    </div>
  )

  const aiStatus: AiStatus = ai.state === 'finished' ? 'finished' : ai.state === 'playing' && !session.paused ? 'playing' : 'paused'

  return (
    <>
      <GameShell
        board={board}
        stats={stats}
        mode={session.mode}
        onModeChange={session.setMode}
        aiAvailable={player !== undefined}
        ai={
          player
            ? {
                status: aiStatus,
                action: aiAction(ai.last, frame?.input ?? '', ai.solution, ai.state),
                detail: aiDetail(ai.solution, ai.last?.step ?? -1, ai.state),
                speed: session.speed,
                onSpeedChange: session.setSpeed,
              }
            : undefined
        }
        pause={isAi ? { paused: session.paused, onToggle: session.togglePause, disabled: ai.state !== 'playing' } : undefined}
        onRestart={isAi ? ai.solve : game.newPractice}
        humanHelp={<HowToPlay hintPercents={game.daily?.hintPercents ?? [100, 90, 75, 60]} />}
        sidebarExtra={
          isAi ? (
            <AiControls
              strategy={ai.strategy}
              onStrategy={ai.setStrategy}
              date={ai.date}
              onDate={ai.setDate}
              firstDay={FIRST_DAY}
              today={game.daily?.date ?? ai.date}
              onSolve={ai.solve}
              solving={ai.state === 'loading'}
              error={ai.error}
              history={ai.history}
              benchmark={ai.benchmark}
              onBenchmark={ai.runBenchmark}
            />
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStatsOpen(true)}>
                <BarChart3 aria-hidden className="size-4" />
                Statistics
              </Button>
              <LookPicker cosmetics={props.cosmetics} look={look} />
            </>
          )
        }
      />
      <StatsDialog
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        today={game.dailyRun}
        puzzleNumber={game.daily?.puzzleNumber ?? null}
        nextPuzzleAt={game.daily?.nextPuzzleAt ?? null}
      />
    </>
  )
}

function ModeTabs({ mode, onChange }: { mode: PlayMode; onChange: (mode: PlayMode) => void }) {
  const options: { value: PlayMode; label: string; icon: typeof CalendarDays }[] = [
    { value: 'daily', label: 'Daily Word', icon: CalendarDays },
    { value: 'practice', label: 'Practice', icon: Shuffle },
  ]
  return (
    <div role="tablist" aria-label="Puzzle" className="grid w-full max-w-[20rem] grid-cols-2 gap-1 rounded-control bg-surface-muted p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'flex h-9 items-center justify-center gap-1.5 rounded-xl font-display text-sm font-semibold transition-colors',
            mode === value ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:bg-surface hover:text-ink',
          )}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

function HowToPlay({ hintPercents }: { hintPercents: number[] }) {
  const swatch = 'inline-block size-3.5 translate-y-0.5 rounded'
  return (
    <div className="flex flex-col gap-2">
      <p>Find the hidden five-letter word in six guesses. Type a word and press <Key>Enter</Key>.</p>
      <ul className="flex flex-col gap-1">
        <li>
          <span aria-hidden className={cn(swatch, 'bg-teal-600')} /> <strong className="text-ink">Teal</strong>: right letter, right place
        </li>
        <li>
          <span aria-hidden className={cn(swatch, 'bg-amber-400')} /> <strong className="text-ink">Amber</strong>: in the word, somewhere else
        </li>
        <li>
          <span aria-hidden className={cn(swatch, 'bg-slate-500')} /> <strong className="text-ink">Grey</strong>: not in the word
        </li>
      </ul>
      <p>
        Everyone gets the same <strong className="text-ink">Daily Word</strong>, once a day (UTC). Fewer guesses score more, and solving
        days in a row adds a streak bonus. Practice words are just for fun.
      </p>
      <p>
        Stuck? Three hints, one of each kind. Each costs part of the score: {hintPercents.slice(1).join('%, ')}% after one, two or three.
      </p>
    </div>
  )
}

/** Words still possible after the guesses shown so far. */
function aiWordsLeft(solution: AiSolution | null, shown: number) {
  if (!solution) return '–'
  if (shown === 0) return solution.steps[0]?.candidatesBefore ?? '–'
  return solution.steps[shown - 1]?.candidatesAfter ?? '–'
}

function aiAction(last: AiAction | undefined, input: string, solution: AiSolution | null, state: string): string | undefined {
  if (state === 'loading') return 'Solving…'
  if (!last || !solution) return undefined
  if (last.kind === 'think') return 'Thinking…'
  if (last.kind === 'type') return `Typing ${input}`
  return `Guessed ${solution.steps[last.step].guess}`
}

function aiDetail(solution: AiSolution | null, step: number, state: string): string | undefined {
  if (!solution) return 'Pick a strategy and a puzzle, then press Solve.'
  if (state === 'finished') {
    return solution.solved ? `Solved in ${solution.steps.length}: ${solution.answer}.` : `Out of guesses. The word was ${solution.answer}.`
  }
  const current = solution.steps[Math.max(0, step)]
  if (!current) return undefined
  return `${current.reason}. ${current.candidatesBefore} → ${current.candidatesAfter} words left${current.remaining.length && current.candidatesAfter <= 6 ? `: ${current.remaining.join(', ')}` : ''}.`
}
