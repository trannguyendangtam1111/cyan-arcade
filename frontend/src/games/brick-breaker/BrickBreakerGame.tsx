import { Heart, Palette, Play, RotateCcw, Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import type { BrickAI, BrickDecision } from './ai/brickAi'
import { CustomizeDialog } from './components/CustomizeDialog'
import { LookSummary } from './components/LookSummary'
import { ARENA } from './engine/arena'
import { useBrickBreakerGame } from './hooks/useBrickBreakerGame'
import { useOutfit } from './hooks/useOutfit'

const STRATEGY_LABELS: Record<BrickDecision['strategy'], string> = {
  serve: 'lining up the serve',
  save: 'racing to save a ball',
  aim: 'aiming the bounce at the bricks',
  catch: 'grabbing a power-up',
  wait: 'waiting',
}

/** Brick Breaker's screen. All behaviour lives in `useBrickBreakerGame`; this file only lays it out. */
export default function BrickBreakerGame(props: GameProps<BrickAI>) {
  const outfit = useOutfit(props.cosmetics)
  const game = useBrickBreakerGame(props, outfit)
  const { canvasRef, status, isAi, score, bonus, summary } = game

  const lives = (
    <span className="inline-flex items-center gap-1" aria-label={`${game.lives} lives`}>
      <Heart aria-hidden className="size-5 fill-rose-500 text-rose-500" />
      {game.lives}
    </span>
  )

  let overlay = null
  if (status === 'over' && !isAi && summary) {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New personal best!' : 'Game over'}
        description={
          <span className="flex flex-col items-center gap-2">
            <span className="flex items-center gap-6 font-display text-ink">
              <span>
                <span className="block text-xs font-bold tracking-wide text-ink-soft uppercase">Score</span>
                <span className="text-3xl font-semibold tabular-nums">{score.toLocaleString('en-US')}</span>
              </span>
              <span>
                <span className="block text-xs font-bold tracking-wide text-ink-soft uppercase">Best</span>
                <span className="text-3xl font-semibold tabular-nums">{Math.max(game.best, score).toLocaleString('en-US')}</span>
              </span>
            </span>
            <span className="text-sm">
              Level {game.level} · {summary.bricks} bricks · best combo {summary.maxCombo} · {summary.powerUps} power-ups
            </span>
          </span>
        }
        action={
          <span className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={game.restart}>
              <RotateCcw aria-hidden className="size-4" />
              Retry
            </Button>
            <Button variant="secondary" size="sm" className="h-11" onClick={game.openCustomize}>
              <Palette aria-hidden className="size-4" />
              Customize
            </Button>
            <Link to="/leaderboard?game=brick-breaker" className={buttonStyles('secondary', 'sm', 'h-11')}>
              <Trophy aria-hidden className="size-4" />
              Leaderboard
            </Link>
          </span>
        }
      />
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

  const average = game.aiStats.runs > 0 ? game.aiStats.bestScore : 0

  return (
    <>
      <GameShell
        mode={game.mode}
        onModeChange={game.changeMode}
        aiAvailable={game.aiAvailable}
        onRestart={game.restart}
        pause={{ paused: game.paused, onToggle: game.togglePause, disabled: !game.canPause }}
        stats={[
          { label: 'Score', value: score.toLocaleString('en-US') },
          isAi ? { label: 'AI best', value: game.aiStats.bestScore.toLocaleString('en-US') } : { label: 'Best', value: Math.max(game.best, score).toLocaleString('en-US') },
          { label: 'Level', value: game.level },
          { label: 'Lives', value: lives },
        ]}
        ai={{
          status: status === 'over' ? 'finished' : status === 'paused' ? 'paused' : 'playing',
          action: game.decision ? (game.decision.landingX !== null ? `paddle → ${Math.round(game.decision.targetX)}` : 'Hold') : undefined,
          detail: game.decision ? STRATEGY_LABELS[game.decision.strategy] + (game.decision.catching ? ` (${game.decision.catching})` : '') : undefined,
          speed: game.speed,
          onSpeedChange: game.setSpeed,
        }}
        sidebarExtra={
          isAi ? (
            <section aria-label="AI statistics" className="rounded-control bg-surface-muted p-3">
              <h2 className="mb-2 font-display text-base font-semibold">AI statistics</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-soft">Runs</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.runs}</dd>
                <dt className="text-ink-soft">Best score</dt>
                <dd className="text-right font-bold tabular-nums">{average.toLocaleString('en-US')}</dd>
                <dt className="text-ink-soft">Best level</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.bestLevel || '–'}</dd>
                <dt className="text-ink-soft">Ball lands in</dt>
                <dd className="text-right font-bold tabular-nums">
                  {game.decision?.secondsToLanding != null ? `${game.decision.secondsToLanding.toFixed(2)} s` : '–'}
                </dd>
              </dl>
            </section>
          ) : (
            <LookSummary outfit={outfit} onCustomize={game.openCustomize} />
          )
        }
        humanHelp={
          <div className="flex flex-col gap-2">
            <p>
              Move the paddle with the mouse, your finger, <Key>←</Key> <Key>→</Key> or <Key>A</Key> <Key>D</Key>. Launch with a click, a
              tap or <Key>Space</Key>.
            </p>
            <p>
              Break bricks in a row for a combo. Catch the capsules that fall: extra balls, fireballs, lasers and more. <Key>P</Key> pauses.
            </p>
          </div>
        }
        board={
          <div
            className={cn('relative aspect-2/3 w-full overflow-hidden rounded-card ring-4 ring-(--accent)/30', status === 'over' && 'motion-safe:animate-shake')}
            style={{ maxWidth: 'min(25rem, calc((100dvh - 8rem) * 2 / 3))' }}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={isAi ? 'Brick Breaker, played by the AI' : 'Brick Breaker arena: move to steer the paddle, tap or press Space to launch'}
              aria-disabled={isAi}
              onPointerMove={isAi ? undefined : game.onPointerMove}
              onPointerDown={isAi ? undefined : game.onPointerDown}
              className="absolute inset-0 cursor-none touch-none outline-none select-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-inset"
            >
              <canvas ref={canvasRef} width={ARENA.width} height={ARENA.height} aria-hidden className="block size-full" />
            </div>
            <p className="sr-only" aria-live="polite">
              {status === 'over' ? `Game over. You scored ${score}.` : bonus ? `Level ${bonus.level} clear. Bonus ${bonus.total}.` : ''}
            </p>
            {status === 'ready' && (
              <p className="pointer-events-none absolute inset-x-0 bottom-[22%] mx-auto flex w-max max-w-[90%] flex-col items-center gap-1 border-4 border-white/85 bg-ink/90 px-4 py-2 text-center font-display text-sm font-semibold text-white shadow-[4px_4px_0_0_rgba(15,10,30,0.6)] motion-safe:animate-pop-in">
                <span>Tap, click or press Space to launch</span>
                <span className="text-xs font-normal text-white/80">Level 1 · {game.levelName}</span>
              </p>
            )}
            {bonus && (
              <div className="pointer-events-none absolute inset-x-6 top-1/4 flex flex-col items-center gap-1 border-4 border-white/85 bg-ink/90 px-4 py-4 text-center font-display text-white shadow-[6px_6px_0_0_rgba(15,10,30,0.6)] motion-safe:animate-pop-in">
                <p className="text-2xl font-bold text-amber-300">LEVEL CLEAR!</p>
                {bonus.perfect > 0 && <p className="text-lg font-bold text-pink-300">✨ PERFECT CLEAR ✨</p>}
                <dl className="mt-1 grid w-full max-w-56 grid-cols-2 gap-x-4 text-sm">
                  <dt className="text-left text-white/75">Level bonus</dt>
                  <dd className="text-right tabular-nums">+{bonus.base}</dd>
                  <dt className="text-left text-white/75">Lives bonus</dt>
                  <dd className="text-right tabular-nums">+{bonus.lives}</dd>
                  <dt className="text-left text-white/75">Combo bonus</dt>
                  <dd className="text-right tabular-nums">+{bonus.combo}</dd>
                  <dt className="text-left text-white/75">Time bonus</dt>
                  <dd className="text-right tabular-nums">+{bonus.time}</dd>
                  {bonus.perfect > 0 && (
                    <>
                      <dt className="text-left text-white/75">Perfect</dt>
                      <dd className="text-right tabular-nums">+{bonus.perfect}</dd>
                    </>
                  )}
                  <dt className="border-t border-white/25 pt-1 text-left font-bold">Total</dt>
                  <dd className="border-t border-white/25 pt-1 text-right font-bold text-amber-300 tabular-nums">+{bonus.total}</dd>
                </dl>
                <p className="mt-1 text-xs text-white/75">Next level coming up…</p>
              </div>
            )}
            {overlay}
          </div>
        }
      />
      {game.customizing && <CustomizeDialog open onClose={game.closeCustomize} outfit={outfit} cosmetics={props.cosmetics} />}
    </>
  )
}
