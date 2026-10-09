import { ArrowBigDown, ArrowBigUp, Play, RotateCcw, Trophy } from 'lucide-react'
import { useId, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import type { DecisionReason, DinoAiKit, DinoStrategy } from './ai/dinoAi'
import { LookPicker } from './components/LookPicker'
import { WORLD } from './engine/physics'
import { useDinoGame } from './hooks/useDinoGame'
import { useOutfit } from './hooks/useOutfit'
import type { ObstacleKind } from './types/dinoTypes'

const CRASH_TITLES: Record<ObstacleKind, string> = {
  mound: 'Tripped!',
  pillar: 'Bonk!',
  bat: 'Bat attack!',
}

const STRATEGIES: { id: DinoStrategy; name: string; text: string }[] = [
  { id: 'safe', name: 'Safe Runner', text: 'Wide safety margin, acts at the first moment that works.' },
  { id: 'balanced', name: 'Balanced Runner', text: 'Smaller margin, acts a little before the last moment.' },
  { id: 'fast', name: 'Fast Reaction', text: 'Tight margin, acts at the last moment and drops fast out of jumps.' },
]

const REASONS: Record<DecisionReason, string> = {
  clear: 'nothing in the way',
  waiting: 'waiting for the right moment',
  jump: 'jumping',
  duck: 'ducking under',
  drop: 'dropping fast to land sooner',
  airborne: 'in the air, clearing it',
  'no-safe-move': 'no safe move left',
}

/** Dino Run's screen. All behaviour lives in `useDinoGame`; this file only lays it out. */
export default function DinoRunGame(props: GameProps<DinoAiKit>) {
  const outfit = useOutfit(props.cosmetics)
  const game = useDinoGame(props, outfit)
  const { canvasRef, status, isAi, score } = game
  const strategyLabel = useId()

  const onPlayfieldDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // No text selection, no page scroll, no emulated mouse events: just a jump.
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    game.jump()
  }

  const holdDuck = (held: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (held) event.currentTarget.setPointerCapture?.(event.pointerId)
    game.duck(held)
  }

  let overlay = null
  if (status === 'over' && !isAi) {
    // Compact, so it fits the short playfield of a phone: the buttons must stay in view.
    overlay = (
      <div className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-surface/85 p-2 text-center backdrop-blur-xs motion-safe:animate-pop-in">
        <div className="flex flex-col items-center gap-1.5 sm:gap-3">
          <h2 className="font-display text-lg font-bold sm:text-3xl">{game.newBest ? 'New personal best!' : game.crash ? CRASH_TITLES[game.crash] : 'Game over'}</h2>
          <p className="flex items-baseline gap-4 font-display text-ink">
            <span>
              <span className="mr-1 text-xs font-bold tracking-wide text-ink-soft uppercase">Score</span>
              <span className="text-xl font-semibold tabular-nums sm:text-3xl">{score}</span>
            </span>
            <span>
              <span className="mr-1 text-xs font-bold tracking-wide text-ink-soft uppercase">Best</span>
              <span className="text-xl font-semibold tabular-nums sm:text-3xl">{Math.max(game.best, score)}</span>
            </span>
          </p>
          <p className="hidden text-sm text-ink-soft sm:block">
            {game.cleared} {game.cleared === 1 ? 'obstacle' : 'obstacles'} cleared. Press <Key>Space</Key> or tap Retry to run again.
          </p>
          <span className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={game.restart}>
              <RotateCcw aria-hidden className="size-4" />
              Retry
            </Button>
            <Link to="/leaderboard?game=dino-run" className={buttonStyles('secondary', 'sm')}>
              <Trophy aria-hidden className="size-4" />
              Leaderboard
            </Link>
          </span>
        </div>
      </div>
    )
  } else if (status === 'paused') {
    overlay = (
      <BoardOverlay
        title="Paused"
        action={
          <Button onClick={game.togglePause}>
            <Play aria-hidden className="size-4" />
            Resume
          </Button>
        }
      />
    )
  }

  const average = game.aiStats.runs > 0 ? Math.round(game.aiStats.total / game.aiStats.runs) : 0
  const decision = game.decision

  return (
    <GameShell
      mode={game.mode}
      onModeChange={game.changeMode}
      aiAvailable={game.aiAvailable}
      onRestart={game.restart}
      pause={{ paused: game.paused, onToggle: game.togglePause, disabled: !game.canPause }}
      stats={
        isAi
          ? [
              { label: 'Score', value: score },
              { label: 'AI best', value: game.aiStats.best },
              { label: 'Level', value: game.level },
            ]
          : [
              { label: 'Score', value: score },
              { label: 'Best', value: Math.max(game.best, score) },
              { label: 'Level', value: game.level },
            ]
      }
      ai={{
        status: status === 'over' ? 'finished' : status === 'paused' ? 'paused' : 'playing',
        action: decision ? (decision.input.jump ? 'Jump' : decision.input.duck ? (decision.reason === 'drop' ? 'Drop' : 'Duck') : 'Run') : undefined,
        detail: decision ? `${REASONS[decision.reason]}${decision.threat ? ` (${decision.threat})` : ''}` : undefined,
        speed: game.speed,
        onSpeedChange: game.setSpeed,
      }}
      sidebarExtra={
        isAi ? (
          <>
            <section aria-labelledby={strategyLabel} className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
              <h2 id={strategyLabel} className="font-display text-base font-semibold">
                AI strategy
              </h2>
              <div role="radiogroup" aria-labelledby={strategyLabel} className="flex flex-col gap-1">
                {STRATEGIES.map(({ id, name, text }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={game.strategy === id}
                    onClick={() => game.chooseStrategy(id)}
                    className={cn(
                      'rounded-xl px-3 py-2 text-left ring-2 transition-colors',
                      game.strategy === id ? 'bg-(--accent) text-(--accent-ink) ring-(--accent)' : 'bg-surface ring-transparent hover:ring-line',
                    )}
                  >
                    <span className="block text-sm font-bold">{name}</span>
                    <span className="block text-xs opacity-80">{text}</span>
                  </button>
                ))}
              </div>
            </section>
            <section aria-label="AI statistics" className="rounded-control bg-surface-muted p-3">
              <h2 className="mb-2 font-display text-base font-semibold">AI statistics</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-soft">Runs</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.runs}</dd>
                <dt className="text-ink-soft">Best</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.best}</dd>
                <dt className="text-ink-soft">Average</dt>
                <dd className="text-right font-bold tabular-nums">{average}</dd>
                <dt className="text-ink-soft">Last run</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.last ?? '–'}</dd>
                <dt className="text-ink-soft">Jumps / ducks</dt>
                <dd className="text-right font-bold tabular-nums">
                  {game.aiStats.jumps} / {game.aiStats.ducks}
                </dd>
                <dt className="text-ink-soft">Next contact</dt>
                <dd className="text-right font-bold tabular-nums">{decision?.contactMs != null ? `${Math.round(decision.contactMs)} ms` : '–'}</dd>
              </dl>
            </section>
          </>
        ) : (
          <LookPicker cosmetics={props.cosmetics} outfit={outfit} />
        )
      }
      humanHelp={
        <div className="flex flex-col gap-2">
          <p>
            Press <Key>Space</Key> or <Key>↑</Key> (or tap the playfield) to jump, and hold <Key>↓</Key> to duck. Holding duck in the air drops
            you fast.
          </p>
          <p>
            Jump mounds and pillars, duck under bats at head height. Every 10 units run is a point; the world speeds up as you go. <Key>P</Key> or{' '}
            <Key>Esc</Key> pauses.
          </p>
        </div>
      }
      touchControls={
        <div className="grid w-full max-w-[40rem] grid-cols-2 gap-3" aria-label="Touch controls">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              game.jump()
            }}
            className="flex h-16 touch-none items-center justify-center gap-2 rounded-control bg-(--accent) font-display text-lg font-semibold text-(--accent-ink) shadow-soft select-none active:translate-y-0.5"
          >
            <ArrowBigUp aria-hidden className="size-6" />
            Jump
          </button>
          <button
            type="button"
            onPointerDown={holdDuck(true)}
            onPointerUp={holdDuck(false)}
            onPointerCancel={holdDuck(false)}
            onLostPointerCapture={() => game.duck(false)}
            className="flex h-16 touch-none items-center justify-center gap-2 rounded-control bg-surface-muted font-display text-lg font-semibold text-ink shadow-soft select-none active:translate-y-0.5"
          >
            <ArrowBigDown aria-hidden className="size-6" />
            Duck (hold)
          </button>
        </div>
      }
      board={
        <div
          className={cn('relative aspect-2/1 w-full max-w-[40rem] overflow-hidden rounded-card ring-4 ring-(--accent)/30', status === 'over' && 'motion-safe:animate-shake')}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label={isAi ? 'Dino Run, played by the AI' : 'Dino Run playfield: press Space or tap to jump'}
            aria-disabled={isAi}
            onPointerDown={isAi ? undefined : onPlayfieldDown}
            className="absolute inset-0 cursor-pointer touch-none outline-none select-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-inset"
          >
            <canvas ref={canvasRef} width={WORLD.width} height={WORLD.height} aria-hidden className="block size-full" />
          </div>
          <p className="sr-only" aria-live="polite">
            {status === 'over' ? `Run over. You scored ${score}.` : ''}
          </p>
          {status === 'ready' && (
            <p className="pointer-events-none absolute inset-x-0 top-[12%] mx-auto flex w-max max-w-[90%] flex-col items-center gap-1 rounded-2xl bg-ink/85 px-4 py-2 text-center font-display text-sm font-semibold text-white shadow-soft motion-safe:animate-pop-in">
              {isAi ? (
                'The AI is getting ready…'
              ) : (
                <>
                  <span>Tap, click or press Space to run</span>
                  <span className="text-xs font-normal text-white/80">Running as {outfit.runner.name}</span>
                </>
              )}
            </p>
          )}
          {overlay}
        </div>
      }
    />
  )
}
