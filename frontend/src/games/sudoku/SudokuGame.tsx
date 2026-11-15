import { BarChart3, History, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { GameShell, Key, type GameStat } from '@/games/shared/components/GameShell'
import type { AiStatus } from '@/games/shared/components/AiPanel'
import { usePlaySession } from '@/games/shared/usePlaySession'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import { formatScore } from '@/lib/format'
import type { SudokuAiPlayer } from './ai/sudokuAiPlayer'
import { AiControls } from './components/AiControls'
import { UnrankedBadge } from './components/ArchivePicker'
import { Board } from './components/Board'
import { CompletionDialog, ConfirmDialog, SettingsDialog, StatsDialog } from './components/Dialogs'
import { HintCard, HintMenu } from './components/HintMenu'
import { LookPicker } from './components/LookPicker'
import { ModeBar } from './components/ModeBar'
import { NumberPad } from './components/NumberPad'
import { StartPanel, type Cover } from './components/StartPanel'
import { StatusBar } from './components/StatusBar'
import { STRATEGIES } from './components/strategies'
import { Toolbar } from './components/Toolbar'
import { formatClock } from './engine/format'
import { bit, CELLS, digitCounts, parseBoard } from './engine/grid'
import { keyCommand } from './engine/keys'
import { useLook } from './hooks/useLook'
import { useSettings } from './hooks/useSettings'
import { useSudokuAi } from './hooks/useSudokuAi'
import { useSudokuGame, type PlayMode } from './hooks/useSudokuGame'
import { DIFFICULTY_LABELS, type RunView } from './types/sudokuTypes'
import './sudoku.css'

const EMPTY = Array<number>(CELLS).fill(0)
const NO_CELLS = new Set<number>()
const HINT_PERCENTS = [100, 90, 75, 60]

/** Sudoku's screen. The play lives in `useSudokuGame` (and `useSudokuAi` for admins); this lays it out. */
export default function SudokuGame(props: GameProps<SudokuAiPlayer>) {
  const { ai: createAi } = props
  const player = useMemo(() => createAi?.(), [createAi])
  const session = usePlaySession()
  const isAi = session.mode === 'ai' && player !== undefined
  const { settings, change: changeSetting } = useSettings()
  const game = useSudokuGame(props, settings)
  const ai = useSudokuAi(player, session.speed, session.paused)
  const look = useLook(props.cosmetics)

  const [statsOpen, setStatsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  const [confirm, setConfirm] = useState<null | 'restart' | 'new'>(null)
  // Both belong to the run they were asked for: a new run starts without them.
  const [pickingFor, setPickingFor] = useState<{ mode: PlayMode; runId: string | null; date: string | null } | undefined>(undefined)
  const [solutionFor, setSolutionFor] = useState<string | null>(null)
  const dialogOpen = statsOpen || settingsOpen || confirm !== null || game.finished !== null

  const run = game.run
  const today = game.today
  // Picking a new practice puzzle or archive date, over the game of that mode it was asked from (if any).
  const picking = pickingFor !== undefined && pickingFor.mode === game.mode && pickingFor.runId === (game.runs[game.mode]?.id ?? null)
  const startPicking = (mode: PlayMode, date: string | null = null) => setPickingFor({ mode, runId: game.runs[mode]?.id ?? null, date })
  const stopPicking = () => setPickingFor(undefined)
  const showSolution = run !== null && solutionFor === run.id

  // The clock between the server's answers.
  const running = game.active && !game.paused
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!running) return
    const tick = window.setInterval(() => setNow(performance.now()), 500)
    return () => window.clearInterval(tick)
  }, [running])
  const elapsedMs = run ? run.elapsedMs + (running ? Math.max(0, now - game.syncedAt) : 0) : 0

  // --- What covers the board ---------------------------------------------------------------------
  let cover: Cover | null = null
  if (!isAi && today) {
    if (game.mode === 'practice' && (picking || !run)) {
      cover = { kind: 'practice', difficulties: today.difficulties, cancellable: picking && run !== null }
    } else if (game.mode === 'archive' && (picking || !run)) {
      cover = {
        kind: 'archive',
        today: today.date,
        puzzleNumber: today.puzzleNumber,
        initialDate: (picking ? pickingFor?.date : null) ?? run?.date ?? null,
        cancellable: picking && run !== null,
      }
    } else if (!run) {
      cover = game.mode === 'daily' ? { kind: 'daily', puzzleNumber: today.puzzleNumber, difficulty: today.difficulty } : null
    } else if (run.status === 'PLAYING' && !game.active) {
      cover = { kind: 'continue', elapsedMs }
    } else if (run.status === 'PLAYING' && game.paused) {
      cover = { kind: 'paused' }
    }
  }

  // --- Keyboard ----------------------------------------------------------------------------------
  const { enter, erase, move, toggleNotes, fillCandidates, askHint, undo, redo, togglePause, selected } = game
  useEffect(() => {
    if (isAi || dialogOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const command = keyCommand(event, settings.keyboardShortcuts)
      if (!command) return
      event.preventDefault()
      switch (command.kind) {
        case 'digit':
          enter(selected, command.digit, command.note)
          break
        case 'erase':
          erase()
          break
        case 'move':
          move(command.direction)
          break
        case 'notes':
          toggleNotes()
          break
        case 'candidates':
          fillCandidates()
          break
        case 'hint':
          askHint('REVEAL')
          break
        case 'undo':
          undo()
          break
        case 'redo':
          redo()
          break
        case 'pause':
          togglePause()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAi, dialogOpen, settings.keyboardShortcuts, enter, erase, move, toggleNotes, fillCandidates, askHint, undo, redo, togglePause, selected])

  // --- The board: the player's game, or the AI's --------------------------------------------------
  const frame = ai.frame
  const solution = ai.solution
  const teaching = solution?.strategy === 'TEACHING'
  const aiLast = frame?.last ?? null

  const givens = useMemo(() => {
    if (isAi) return solution ? parseBoard(solution.givens) : EMPTY
    return run ? parseBoard(run.givens) : EMPTY
  }, [isAi, solution, run])
  const values = isAi ? (frame?.values ?? givens) : showSolution && run?.solution ? parseBoard(run.solution) : game.values
  const notes = isAi ? (teaching && frame ? frame.candidates : EMPTY) : (game.board?.notes ?? EMPTY)
  const revealed = useMemo(() => new Set(isAi ? [] : (run?.revealed ?? [])), [isAi, run])
  const marked = useMemo(() => {
    if (isAi) return new Set(aiLast?.highlight ?? [])
    return game.hint && game.hint.type !== 'REVEAL' ? new Set(game.hint.highlight) : NO_CELLS
  }, [isAi, aiLast, game.hint])
  const aiSelected = aiLast && (aiLast.kind === 'PLACE' || aiLast.kind === 'GUESS') ? aiLast.cell : null
  const counts = isAi ? digitCounts(values) : game.counts
  const over = run !== null && run.status !== 'PLAYING'

  const removable = useMemo(() => {
    if (!game.hint || !game.board) return 0
    return game.hint.eliminations.filter((entry) => {
      const [cell, digit] = entry.split(':').map(Number)
      return (game.board!.notes[cell] & bit(digit)) !== 0
    }).length
  }, [game.hint, game.board])

  const title = isAi
    ? solution
      ? `${solution.date ? `Daily #${solution.puzzleNumber}` : 'Practice'} · ${DIFFICULTY_LABELS[solution.difficulty]}`
      : 'AI solver'
    : run
      ? `${run.mode === 'DAILY' ? `Daily #${run.puzzleNumber}` : run.mode === 'ARCHIVE' ? `Archive #${run.puzzleNumber}` : run.ranked ? 'Practice' : 'Relaxed'} · ${DIFFICULTY_LABELS[run.difficulty]}`
      : game.mode === 'daily' && today
        ? `Daily #${today.puzzleNumber} · ${DIFFICULTY_LABELS[today.difficulty]}`
        : game.mode === 'archive'
          ? 'Daily archive'
          : 'Practice'
  const rule =
    run && !run.ranked ? 'Relaxed: a digit that repeats in its row, column or box counts, with no limit' : 'A digit that is not the solution is a mistake; three end the game'

  const board = (
    <div className="relative flex w-full max-w-[32rem] flex-col items-center gap-3">
      {!isAi && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <ModeBar mode={game.mode} onChange={game.setMode} />
          {game.mode !== 'daily' && run && !cover && (
            <Button size="sm" variant="secondary" onClick={() => (run.status === 'PLAYING' ? setConfirm('new') : startPicking(game.mode, run.date))}>
              {game.mode === 'archive' ? <History aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
              {game.mode === 'archive' ? 'Pick a date' : 'New game'}
            </Button>
          )}
        </div>
      )}

      {!isAi && game.mode === 'archive' && run?.mode === 'ARCHIVE' && (
        <p className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
          <UnrankedBadge />
          <span>
            Replaying Daily Sudoku #{run.puzzleNumber} of {run.date} (UTC)
          </span>
        </p>
      )}

      {isAi ? (
        <p className="w-full truncate font-display text-sm font-semibold text-ink">{title}</p>
      ) : (
        <StatusBar
          title={title}
          mistakes={run?.mistakes ?? 0}
          mistakeLimit={run ? run.mistakeLimit : (today?.mistakeLimit ?? 3)}
          rule={rule}
          elapsedMs={elapsedMs}
          paused={game.paused}
          canPause={game.active}
          onPause={game.togglePause}
        />
      )}

      {game.message && !isAi && (
        <p
          key={game.message.id}
          role="status"
          className={cn(
            'pointer-events-none absolute top-24 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-full px-4 py-1.5 text-center font-display text-sm font-semibold shadow-lift motion-safe:animate-pop-in',
            game.message.tone === 'error' ? 'bg-danger text-white' : 'bg-night text-white',
          )}
        >
          {game.message.text}
        </p>
      )}

      {!isAi && !today && game.loadFailed ? (
        <ErrorState title="Sudoku couldn't be loaded" onRetry={game.reload} />
      ) : (
        <div className="relative w-full">
          <Board
            givens={givens}
            values={values}
            notes={notes}
            revealed={revealed}
            errors={isAi ? NO_CELLS : game.errors}
            selected={isAi ? aiSelected : game.selected}
            digit={isAi ? (aiSelected !== null ? values[aiSelected] : 0) : game.highlightDigit}
            highlights={{ related: isAi ? false : settings.highlightRelated, same: isAi ? aiSelected !== null : settings.highlightSame }}
            marked={marked}
            struck={isAi && teaching ? frame?.struck : undefined}
            pop={isAi ? (aiSelected !== null ? { cell: aiSelected, key: frame?.played ?? 0 } : null) : game.pop}
            glow={isAi ? null : game.glow}
            onSelect={isAi || cover || over ? undefined : game.select}
            theme={look.board}
            label={isAi ? 'AI board' : `Sudoku board, ${title}`}
            hidden={!isAi && cover !== null}
          />
          {cover && (
            <StartPanel
              cover={cover}
              busy={game.busy}
              onStart={(practice) => game.start(practice)}
              onArchive={game.startArchive}
              onResume={game.resume}
              onCancel={stopPicking}
            />
          )}
        </div>
      )}

      {isAi ? (
        <AiExplanation text={aiLast?.text ?? null} lesson={teaching ? (aiLast?.lesson ?? []) : []} />
      ) : (
        <>
          {over && run && <ResultBanner run={run} onStats={() => setStatsOpen(true)} />}
          {hintOpen && !over && (
            <HintMenu
              hintsLeft={run?.hintsLeft ?? 3}
              hintPercents={today?.hintPercents ?? HINT_PERCENTS}
              used={run?.hintsUsed ?? 0}
              disabled={!game.active || game.paused}
              onHint={(type) => {
                setHintOpen(false)
                game.askHint(type)
              }}
              onClose={() => setHintOpen(false)}
            />
          )}
          {game.hint && !over && <HintCard hint={game.hint} removable={removable} onRemoveNotes={game.applyHintEliminations} onClose={game.dismissHint} />}
        </>
      )}

      {/* The tools and the digits read as one set of controls: a little apart from the board on a
          phone, closer to each other; from sm the spacing is the column's own. */}
      <div className="mt-1 flex w-full flex-col gap-2 sm:mt-0 sm:gap-3">
        <Toolbar
          canUndo={!isAi && game.canUndo}
          canRedo={!isAi && game.canRedo}
          notesMode={game.notesMode}
          fillMode={game.fillMode}
          hintsLeft={run?.hintsLeft ?? 3}
          hintOpen={hintOpen}
          disabled={isAi || !game.active || game.paused}
          onUndo={game.undo}
          onRedo={game.redo}
          onErase={game.erase}
          onNotes={game.toggleNotes}
          onCandidates={game.fillCandidates}
          onFill={game.toggleFill}
          onHint={() => setHintOpen((open) => !open)}
        />
        <NumberPad
          counts={counts}
          onDigit={game.padDigit}
          active={!isAi && game.fillMode ? game.fillDigit : null}
          notesMode={game.notesMode}
          disabled={isAi || !game.active || game.paused}
          theme={look.pad}
        />
      </div>
    </div>
  )

  const stats: GameStat[] = isAi
    ? [
        { label: 'Strategy', value: <span className="text-base">{STRATEGIES.find((option) => option.id === ai.strategy)?.label}</span> },
        { label: 'Move', value: solution ? `${ai.played}/${solution.moves.length}` : '–' },
        { label: solution?.strategy === 'FAST' ? 'Guesses' : 'Techniques', value: solution ? (solution.strategy === 'FAST' ? solution.guesses : Object.keys(solution.techniques).length) : '–' },
      ]
    : [
        { label: 'Hints left', value: run?.hintsLeft ?? 3 },
        { label: 'Streak', value: game.stats?.currentStreak ?? 0 },
        { label: 'Time', value: formatClock(elapsedMs) },
      ]

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
                action: ai.state === 'loading' ? 'Solving…' : aiLast ? aiAction(aiLast.kind, aiLast.cell, aiLast.digit) : undefined,
                detail: solution ? undefined : 'Pick a strategy and a puzzle, then press Solve.',
                speed: session.speed,
                onSpeedChange: session.setSpeed,
              }
            : undefined
        }
        pause={isAi ? { paused: session.paused, onToggle: session.togglePause, disabled: ai.state !== 'playing' } : undefined}
        onRestart={isAi ? ai.restart : () => game.active && setConfirm('restart')}
        humanHelp={<HowToPlay />}
        sidebarExtra={
          isAi ? (
            <AiControls
              strategy={ai.strategy}
              onStrategy={(strategy) => void ai.setStrategy(strategy)}
              puzzle={ai.puzzle}
              onPuzzle={ai.setPuzzle}
              state={ai.state}
              solution={solution}
              played={ai.played}
              error={ai.error}
              onSolve={ai.solve}
              onStep={ai.step}
              onRestart={ai.restart}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setStatsOpen(true)}>
                  <BarChart3 aria-hidden className="size-4" />
                  Statistics
                </Button>
                <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                  <Settings2 aria-hidden className="size-4" />
                  Settings
                </Button>
              </div>
              <LookPicker cosmetics={props.cosmetics} look={look} />
            </>
          )
        }
      />
      <StatsDialog open={statsOpen} onClose={() => setStatsOpen(false)} nextPuzzleAt={today?.nextPuzzleAt ?? null} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={changeSetting} />
      <CompletionDialog
        run={game.finished}
        onClose={game.closeFinished}
        onStats={() => {
          game.closeFinished()
          setStatsOpen(true)
        }}
        onNewGame={() => {
          const finished = game.finished
          game.closeFinished()
          if (finished?.mode === 'ARCHIVE') {
            game.setMode('archive')
            startPicking('archive', finished.date)
          } else {
            game.setMode('practice')
            startPicking('practice')
          }
        }}
        onShowSolution={() => {
          game.closeFinished()
          setSolutionFor(game.finished?.id ?? null)
        }}
      />
      <ConfirmDialog
        open={confirm === 'restart'}
        title="Clear the board?"
        text="Your digits and notes go. The clock, mistakes and hints stay: it is the same game. You can undo it."
        confirm="Clear"
        onConfirm={game.clearAll}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'new'}
        title={game.mode === 'archive' ? 'Leave this replay?' : 'Start a new puzzle?'}
        text={
          game.mode === 'archive'
            ? 'It ends when you start another. Replays are unranked, so nothing counts: pick any date, this one included.'
            : 'This game ends here. A ranked game counts as played but not solved.'
        }
        confirm={game.mode === 'archive' ? 'Pick a date' : 'New puzzle'}
        onConfirm={() => startPicking(game.mode, run?.date ?? null)}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}

function ResultBanner({ run, onStats }: { run: RunView; onStats: () => void }) {
  const solved = run.status === 'SOLVED'
  return (
    <section aria-label="Result" className="flex w-full flex-wrap items-center justify-between gap-2 rounded-control bg-surface-muted p-3 text-sm">
      <p>
        <strong className="text-ink">{solved ? 'Solved' : run.status === 'FAILED' ? 'Out of mistakes' : 'Left unfinished'}</strong>
        {run.result && ` in ${formatClock(run.result.seconds * 1000)} · ${formatScore(run.result.score)} points`}
        {!run.ranked && solved && (run.mode === 'ARCHIVE' ? ' · practice / unranked, no score' : ' · relaxed, no score')}
      </p>
      <Button size="sm" variant="secondary" onClick={onStats}>
        <BarChart3 aria-hidden className="size-4" />
        Statistics
      </Button>
    </section>
  )
}

function AiExplanation({ text, lesson }: { text: string | null; lesson: string[] }) {
  if (!text) return null
  return (
    <section aria-label="AI reasoning" className="w-full rounded-control bg-surface-muted p-3 text-sm">
      {lesson.length ? (
        <ul className="flex flex-col gap-1">
          {lesson.map((line, index) => (
            <li key={index} className={cn(index === 0 && 'font-bold text-ink')}>
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p>{text}</p>
      )}
    </section>
  )
}

function aiAction(kind: string, cell: number, digit: number): string {
  const where = `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`
  switch (kind) {
    case 'PLACE':
      return `${digit} in ${where}`
    case 'GUESS':
      return `Trying ${digit} in ${where}`
    case 'BACKTRACK':
      return 'Backing out'
    default:
      return 'Ruling out candidates'
  }
}

function HowToPlay() {
  return (
    <div className="flex flex-col gap-2">
      <p>Fill the grid so every row, column and 3×3 box holds the digits 1 to 9 once each.</p>
      <p>
        Pick a cell, then a digit. <Key>N</Key> switches to notes; <Key>Auto</Key> (or <Key>C</Key>) pencils in every empty cell's candidates;{' '}
        <Key>Fill</Key> places one digit with every tap. Arrows move, <Key>Del</Key> erases,{' '}
        <Key>Ctrl</Key>+<Key>Z</Key> undoes, <Key>Esc</Key> pauses.
      </p>
      <p>
        Everyone gets the same <strong className="text-ink">Daily Sudoku</strong> (UTC); practice puzzles come in four difficulties. In a ranked game a
        wrong digit is a mistake and three end it. Faster solves score more; each mistake and hint costs a share.
      </p>
      <p>
        The <strong className="text-ink">Archive</strong> replays any past Daily by its UTC date, as practice: unranked, with no mistake limit, score,
        rewards or streak, and as often as you like.
      </p>
    </div>
  )
}

