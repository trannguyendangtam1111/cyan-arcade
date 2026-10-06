import { Palette, Play, RotateCcw, Trophy } from 'lucide-react'
import type { PointerEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { BoardOverlay } from '@/games/shared/components/BoardOverlay'
import { GameShell, Key } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import type { FlappyAI, FlappyStrategy } from './ai/flappyAi'
import { CustomizeDialog } from './components/CustomizeDialog'
import { LookSummary } from './components/LookSummary'
import { WORLD } from './engine/flappyEngine'
import { useFlappyGame } from './hooks/useFlappyGame'
import { useOutfit } from './hooks/useOutfit'
import type { CrashCause } from './types/flappyTypes'

const CRASH_TITLES: Record<CrashCause, string> = {
  pipe: 'Bonk!',
  ground: 'Down you go!',
  ceiling: 'Too high!',
}

const STRATEGY_LABELS: Record<FlappyStrategy, string> = {
  start: 'taking off',
  climb: 'climbing towards the next gap',
  glide: 'gliding down to the next gap',
  dodge: 'only one move is safe here',
  'no-escape': 'no safe way through',
  waiting: 'between decisions',
}

/** Flappy Bird's screen. All behaviour lives in `useFlappyGame`; this file only lays it out. */
export default function FlappyBirdGame(props: GameProps<FlappyAI>) {
  const outfit = useOutfit(props.cosmetics)
  const game = useFlappyGame(props, outfit)
  const { canvasRef, status, isAi, score } = game

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // No text selection, no page scroll, no emulated mouse events: just a flap.
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    game.flap()
  }

  const leaderboard = (
    <Link to="/leaderboard?game=flappy-bird" className={buttonStyles('secondary', 'sm', 'h-11')}>
      <Trophy aria-hidden className="size-4" />
      Leaderboard
    </Link>
  )

  let overlay = null
  if (status === 'over' && !isAi) {
    overlay = (
      <BoardOverlay
        title={game.newBest ? 'New personal best!' : game.crash ? CRASH_TITLES[game.crash] : 'Game over'}
        description={
          <span className="flex flex-col items-center gap-2">
            <span className="flex items-center gap-6 font-display text-ink">
              <span>
                <span className="block text-xs font-bold tracking-wide text-ink-soft uppercase">Score</span>
                <span className="text-4xl font-semibold tabular-nums">{score}</span>
              </span>
              <span>
                <span className="block text-xs font-bold tracking-wide text-ink-soft uppercase">Best</span>
                <span className="text-4xl font-semibold tabular-nums">{Math.max(game.best, score)}</span>
              </span>
            </span>
            <span>
              You flew past {score} {score === 1 ? 'pipe' : 'pipes'}. Press <Key>Space</Key> or tap Retry to go again.
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
            {leaderboard}
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

  const average = game.aiStats.flights > 0 ? Math.round(game.aiStats.totalPipes / game.aiStats.flights) : 0

  return (
    <>
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
          action: game.decision ? (game.decision.action === 'flap' ? 'Flap' : 'Glide') : undefined,
          detail: game.decision ? STRATEGY_LABELS[game.decision.strategy] : undefined,
          speed: game.speed,
          onSpeedChange: game.setSpeed,
        }}
        sidebarExtra={
          isAi ? (
            <section aria-label="AI statistics" className="rounded-control bg-surface-muted p-3">
              <h2 className="mb-2 font-display text-base font-semibold">AI statistics</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-soft">Flights</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.flights}</dd>
                <dt className="text-ink-soft">Best</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.best}</dd>
                <dt className="text-ink-soft">Average</dt>
                <dd className="text-right font-bold tabular-nums">{average}</dd>
                <dt className="text-ink-soft">Last flight</dt>
                <dd className="text-right font-bold tabular-nums">{game.aiStats.last ?? '–'}</dd>
                <dt className="text-ink-soft">Looks ahead</dt>
                <dd className="text-right font-bold tabular-nums">
                  {game.decision ? `${Math.round((Math.max(game.decision.flapLookahead, game.decision.glideLookahead) * 1000) / 120)} ms` : '–'}
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
              Press <Key>Space</Key>, <Key>↑</Key> or <Key>W</Key>, or click or tap the sky, to flap. Fly through the gaps: every pipe
              you pass is a point.
            </p>
            <p>
              The world speeds up and the gaps get narrower as you go. Touching a pipe, the ground or the top of the sky ends the
              flight. <Key>P</Key> pauses.
            </p>
          </div>
        }
        board={
          <div
            className={cn(
              'relative aspect-2/3 w-full overflow-hidden rounded-card ring-4 ring-(--accent)/30',
              status === 'over' && 'motion-safe:animate-shake',
            )}
            style={{ maxWidth: 'min(25rem, calc((100dvh - 8rem) * 2 / 3))' }}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={isAi ? 'Flappy Bird, played by the AI' : 'Flappy Bird playfield: press Space or tap to flap'}
              aria-disabled={isAi}
              onPointerDown={isAi ? undefined : onPointerDown}
              className="absolute inset-0 cursor-pointer touch-none outline-none select-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-inset"
            >
              <canvas
                ref={canvasRef}
                width={WORLD.width}
                height={WORLD.height}
                aria-hidden
                className="block size-full"
              />
            </div>
            <p className="sr-only" aria-live="polite">
              {status === 'over' ? `Flight over. You scored ${score}.` : ''}
            </p>
            {status === 'ready' && (
              <p className="pointer-events-none absolute inset-x-0 bottom-[16%] mx-auto flex w-max max-w-[90%] flex-col items-center gap-1 rounded-2xl bg-ink/85 px-4 py-2 text-center font-display text-sm font-semibold text-white shadow-soft motion-safe:animate-pop-in">
                {isAi ? (
                  'The AI is getting ready…'
                ) : (
                  <>
                    <span>Tap, click or press Space to flap</span>
                    <span className="text-xs font-normal text-white/80">Flying as {outfit.bird.name}</span>
                  </>
                )}
              </p>
            )}
            {overlay}
          </div>
        }
      />
      {game.customizing && <CustomizeDialog open onClose={game.closeCustomize} outfit={outfit} cosmetics={props.cosmetics} />}
    </>
  )
}
