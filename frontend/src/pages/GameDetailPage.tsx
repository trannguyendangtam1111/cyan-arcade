import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Hammer,
  Keyboard,
  LoaderCircle,
  Pointer,
  Target,
  Trophy,
} from 'lucide-react'
import { Suspense, useCallback } from 'react'
import { Link, useParams } from 'react-router'
import { useSession } from '@/api/auth'
import { ApiError } from '@/api/client'
import { useDailyChallenges } from '@/api/dailyChallenges'
import type { Rewards } from '@/api/gameSessions'
import { Badge } from '@/components/ui/Badge'
import { CoinAmount } from '@/components/ui/CoinAmount'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { categoryLabels } from '@/games/registry'
import type { GameDefinition, GameModule } from '@/games/types'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGameAi } from '@/hooks/useGameAi'
import { useGameDefinition } from '@/hooks/useGameCatalog'
import { useGameCosmetics } from '@/hooks/useGameCosmetics'
import { useScoreSubmission, type ScoreSubmission } from '@/hooks/useScoreSubmission'
import { accentStyle } from '@/lib/accent'
import { recordRecentGame } from '@/lib/recentGames'
import { NotFoundPage } from './NotFoundPage'

/** Hosts any game from the catalog. Knows nothing about individual games beyond GameDefinition. */
export function GameDetailPage() {
  const { slug = '' } = useParams()
  const { game, isPending, error, refetch } = useGameDefinition(slug)
  useDocumentTitle(game?.name)

  if (isPending) return <LoadingState label="Loading game…" />
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (!game) return <ErrorState title="Couldn't load this game" onRetry={() => void refetch()} />

  return (
    <div style={accentStyle(game.accentColor)} className="flex flex-col gap-6">
      <Link
        to="/games"
        className="inline-flex items-center gap-1 self-start rounded-lg text-sm font-bold text-ink-soft hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All games
      </Link>

      <GameHeader game={game} />

      {game.module && <TodaysChallenge gameSlug={game.slug} />}

      {game.module ? <GameStage game={game} gameModule={game.module} /> : <ComingSoon game={game} />}
    </div>
  )
}

function GameHeader({ game }: { game: GameDefinition }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <img
        src={game.thumbnail}
        alt=""
        className="aspect-5/3 w-full rounded-card bg-(--accent) object-cover shadow-soft sm:w-56"
      />
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="accent">{categoryLabels[game.category]}</Badge>
          {game.module?.controls.keyboard && (
            <Badge tone="neutral">
              <Keyboard aria-hidden className="size-3.5" />
              Keyboard
            </Badge>
          )}
          {game.module?.controls.touch && (
            <Badge tone="neutral">
              <Pointer aria-hidden className="size-3.5" />
              Touch
            </Badge>
          )}
        </div>
        <h1 className="text-title font-bold">{game.name}</h1>
        <p className="mt-2 max-w-2xl text-lg text-ink-soft">{game.description}</p>
      </div>
    </header>
  )
}

/**
 * Today's daily challenge for this game, so the player knows what to aim for before starting.
 * Shows nothing while loading or when there is none: the game itself is what matters here.
 */
function TodaysChallenge({ gameSlug }: { gameSlug: string }) {
  const { data } = useDailyChallenges()
  const challenge = data?.challenges.find((candidate) => candidate.game?.slug === gameSlug)
  if (!challenge) return null

  return (
    <aside
      aria-label="Today's challenge"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-control bg-(--accent)/10 px-4 py-3 ring-1 ring-(--accent)/30"
    >
      <span className="inline-flex items-center gap-1.5 font-display font-semibold">
        <Target aria-hidden className="size-4.5" />
        Daily challenge
      </span>
      <span className="min-w-0">
        <strong>{challenge.title}</strong>
        <span className="text-ink-soft"> · {challenge.description}</span>
      </span>
      {challenge.completed ? (
        <Badge tone="success" className="ml-auto px-3 py-1 text-sm">
          <CircleCheck aria-hidden className="size-3.5" />
          Completed
        </Badge>
      ) : (
        <Badge tone="accent" className="ml-auto px-3 py-1 text-sm">
          +{challenge.xpReward} XP
          {challenge.coinReward > 0 && (
            <>
              {' · '}
              <CoinAmount amount={challenge.coinReward} signed className="text-sm" />
            </>
          )}
        </Badge>
      )}
    </aside>
  )
}

function GameStage({ game, gameModule }: { game: GameDefinition; gameModule: GameModule }) {
  // The platform owns score keeping: the game only reports that a run started and how it ended.
  const { submission, onGameStart, onGameOver, retry, currentSession } = useScoreSubmission(game.slug)
  // AI mode is for admins: everyone else gets the game without its AI.
  const ai = useGameAi(gameModule)
  // Skins from the shop, for a game that has them.
  const cosmetics = useGameCosmetics(gameModule)

  const handleGameStart = useCallback(() => {
    // Remembered on this device, for the hub's "Jump back in" row.
    recordRecentGame(game.slug)
    onGameStart()
  }, [game.slug, onGameStart])

  return (
    <Card padding="none" className="overflow-hidden border-t-8 border-(--accent)">
      <Suspense fallback={<LoadingState label={`Loading ${game.name}…`} className="min-h-80" />}>
        {/* The module pairs the component with its own AI (defineGameModule), so this is that AI. */}
        <gameModule.Component
          onGameStart={handleGameStart}
          onGameOver={onGameOver}
          currentSession={currentSession}
          ai={ai as (() => never) | undefined}
          cosmetics={cosmetics}
        />
      </Suspense>
      <ScoreStatus submission={submission} onRetry={retry} gameSlug={game.slug} />
    </Card>
  )
}

interface ScoreStatusProps {
  submission: ScoreSubmission
  onRetry: () => void
  gameSlug: string
}

/** Tells the player what happened to the score of the run that just ended. */
function ScoreStatus({ submission, onRetry, gameSlug }: ScoreStatusProps) {
  if (submission.status === 'idle') return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-surface-muted/60 px-4 py-3 text-sm sm:px-6"
    >
      {submission.status === 'saving' && (
        <>
          <LoaderCircle aria-hidden className="size-4 animate-spin text-ink-soft" />
          <span className="text-ink-soft">Saving your score…</span>
        </>
      )}
      {submission.status === 'saved' && (
        <>
          <CircleCheck aria-hidden className="size-4 text-success" />
          <span>
            Score <strong>{submission.score}</strong> {submission.alreadySaved ? 'was already saved.' : 'saved.'}
          </span>
          {submission.rewards ? (
            <RewardBadges rewards={submission.rewards} />
          ) : (
            !submission.alreadySaved && <GuestHint gameSlug={gameSlug} />
          )}
          <Link
            to={`/leaderboard?game=${encodeURIComponent(gameSlug)}`}
            className="ml-auto rounded font-bold text-brand-700 hover:text-brand-900"
          >
            View leaderboard →
          </Link>
        </>
      )}
      {submission.status === 'failed' && (
        <>
          <CircleAlert aria-hidden className="size-4 text-danger" />
          <span>
            {submission.reason === 'rejected' ? (
              <>
                Your score of <strong>{submission.score}</strong> couldn't be accepted.
              </>
            ) : submission.reason === 'expired' ? (
              <>This game was left open too long to save its score. Start a new game to play on.</>
            ) : (
              <>
                Your score of <strong>{submission.score}</strong> couldn't be saved.
              </>
            )}
          </span>
          {submission.canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded font-bold text-brand-700 underline underline-offset-2 hover:text-brand-900"
            >
              Try again
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * What a signed-in player's run earned: XP, coins, a best for the account, achievements, completed
 * daily challenges, a new level. Every amount is the server's.
 *
 * The best is named after the account because the game itself shows the best on this device, which
 * can be higher: a guest, or someone else's account, may have played here before.
 */
function RewardBadges({ rewards }: { rewards: Rewards }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone="brand">+{rewards.xpEarned} XP</Badge>
      {rewards.coinsEarned > 0 && (
        <Badge tone="warning" className="py-0">
          <CoinAmount amount={rewards.coinsEarned} signed className="text-xs" />
        </Badge>
      )}
      {rewards.personalBest && <Badge tone="warning">New account best</Badge>}
      {rewards.achievements.map((achievement) => (
        <Badge key={achievement.code} tone="warning" title={achievement.description}>
          <Trophy aria-hidden className="size-3.5" />
          Achievement: {achievement.name}
        </Badge>
      ))}
      {rewards.bonuses.map((bonus) => (
        <Badge key={`${bonus.type}-${bonus.title}`} tone="success">
          <Target aria-hidden className="size-3.5" />
          {bonus.type === 'DAILY_CHALLENGE' ? 'Daily challenge' : 'Bonus'}: {bonus.title}
        </Badge>
      ))}
      {rewards.leveledUp && <Badge tone="success">Level {rewards.level}!</Badge>}
    </span>
  )
}

/** Guests see what they are missing, with a way back to this game after signing in. */
function GuestHint({ gameSlug }: { gameSlug: string }) {
  const { user } = useSession()
  // Only for actual guests: a signed-in player can get no rewards too, when a retry finds the score already saved.
  if (user !== null) return null
  return (
    <Link
      to={`/login?redirect=${encodeURIComponent(`/games/${gameSlug}`)}`}
      className="rounded font-bold text-brand-700 hover:text-brand-900"
    >
      Log in to earn XP
    </Link>
  )
}

function ComingSoon({ game }: { game: GameDefinition }) {
  return (
    <EmptyState
      icon={Hammer}
      title={`${game.name} is being built`}
      description="This cabinet is still in the workshop. It will be playable right here as soon as it's ready."
      action={
        <Link to="/games" className={buttonStyles('secondary')}>
          Browse other games
        </Link>
      }
    />
  )
}
