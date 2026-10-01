import { Eye, FastForward, PackageOpen, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useReducer } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cn } from '@/lib/cn'
import { useOpenPack, type Allowance, type PulledCard, type TcgPack } from '../api'
import { CardBack, CardFace } from '../components/CardFace'
import { RarityBadge } from '../components/RarityBadge'
import { tcgButton } from '../components/tcgButton'
import { SPECIAL_TIER, TOP_TIER, tierStyle } from '../rarity'
import { openingReducer, sealed, summarize } from './openingMachine'

/** How long the pack takes to tear open. Purely for show: the cards are known before it starts. */
export const TEAR_MS = 900

/** True when the player asked their system for less motion. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface PackOpeningProps {
  pack: TcgPack
  /** What the player may still open today; `undefined` while that is being looked up. */
  allowance: Allowance | undefined
  /** The back of this game's cards, when it has its own. */
  cardBackUrl?: string | null
}

/**
 * Opening a pack, from the sealed pack to the results.
 *
 * The component asks the server to open the pack and then stages what came back: tear, deal, flip,
 * results. Nothing here chooses, reorders or hides a card, and the animation never decides what
 * happens next by itself: every step is a state in {@link openingReducer}, moved on by the server's
 * answer, a timer or the player.
 */
export function PackOpening({ pack, allowance, cardBackUrl }: PackOpeningProps) {
  const [state, dispatch] = useReducer(openingReducer, sealed)
  const openPack = useOpenPack()
  const { phase, opening, revealed } = state

  const noneLeft = allowance?.leftToday === 0
  const open = () => {
    dispatch({ type: 'open' })
    openPack.mutate(pack.id, {
      onSuccess: (response) => dispatch({ type: 'opened', opening: response.opening }),
      onError: (error) =>
        dispatch({
          type: 'failed',
          message: error instanceof ApiError ? error.message : 'The pack could not be opened. Please try again.',
        }),
    })
  }

  // The tear is a pause for effect. When it is over (or skipped, or unwanted) the cards are dealt.
  useEffect(() => {
    if (phase !== 'tearing') return
    const timer = window.setTimeout(() => dispatch({ type: 'torn' }), prefersReducedMotion() ? 0 : TEAR_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  const summary = phase === 'results' && opening ? summarize(opening) : null
  const lastRevealed = opening?.cards.find((card) => card.position === revealed.at(-1))

  return (
    <div className="flex flex-col items-center gap-6">
      {(phase === 'sealed' || phase === 'requesting' || phase === 'tearing') && (
        <div className="relative grid place-items-center py-2">
          {phase === 'tearing' && (
            <span
              aria-hidden
              className="absolute size-64 rounded-full bg-amber-200 blur-2xl motion-safe:animate-flash"
            />
          )}
          <img
            src={pack.imageUrl}
            alt={pack.name}
            draggable={false}
            className={cn(
              'relative w-52 drop-shadow-[0_18px_24px_rgb(88_28_135/0.35)] sm:w-60',
              phase === 'sealed' && 'motion-safe:animate-float',
              phase === 'requesting' && 'motion-safe:animate-pack-shake',
              phase === 'tearing' && 'motion-safe:animate-pack-burst',
            )}
          />
        </div>
      )}

      {phase === 'sealed' && (
        <div className="flex flex-col items-center gap-3 text-center">
          {state.error && (
            <p role="alert" className="max-w-md rounded-control bg-rose-50 px-4 py-2 font-bold text-rose-700">
              {state.error}
            </p>
          )}
          <button type="button" onClick={open} disabled={noneLeft} className={tcgButton('lg')}>
            <PackageOpen aria-hidden className="size-5" />
            Open pack
          </button>
          {noneLeft && <p className="text-ink-soft">You have opened all of today's packs. More tomorrow!</p>}
        </div>
      )}

      {phase === 'requesting' && (
        <p role="status" className="font-display text-lg font-semibold text-purple-800">
          Opening…
        </p>
      )}

      {phase === 'tearing' && (
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'torn' })}>
          <FastForward aria-hidden className="size-4" />
          Skip
        </Button>
      )}

      {(phase === 'revealing' || phase === 'results') && opening && (
        <>
          <ul aria-label="Your cards" className="flex w-full max-w-3xl flex-wrap justify-center gap-3 sm:gap-4">
            {opening.cards.map((pulled, index) => (
              <li key={pulled.position} className="w-[29%] sm:w-[18%]">
                <RevealCard
                  pulled={pulled}
                  index={index}
                  faceUp={revealed.includes(pulled.position)}
                  cardBackUrl={cardBackUrl}
                  onReveal={() => dispatch({ type: 'reveal', position: pulled.position })}
                />
              </li>
            ))}
          </ul>

          {/* Says aloud what a sighted player sees when a card turns over. */}
          <p role="status" className="sr-only">
            {lastRevealed &&
              `${lastRevealed.card.name}, ${lastRevealed.card.rarity.name}${lastRevealed.isNew ? ', new' : ''}`}
          </p>
        </>
      )}

      {phase === 'revealing' && opening && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-ink-soft">
            Tap a card to turn it over. {opening.cards.length - revealed.length} to go.
          </p>
          <Button variant="secondary" onClick={() => dispatch({ type: 'revealAll' })}>
            <Eye aria-hidden className="size-4" />
            Reveal all
          </Button>
        </div>
      )}

      {summary && opening && (
        <section
          aria-label="Results"
          className="flex w-full max-w-xl flex-col items-center gap-4 rounded-card bg-surface p-5 text-center shadow-soft ring-1 ring-ink/5 motion-safe:animate-pop-in"
        >
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles aria-hidden className="size-6 text-amber-500" />
            {summary.bestTier >= TOP_TIER ? 'Legendary pull!' : summary.bestTier > SPECIAL_TIER ? 'Great pull!' : 'Pack opened'}
          </h2>
          <p className="flex flex-wrap justify-center gap-2">
            <Badge tone="success" className="px-3 py-1 text-sm">
              {summary.newCards} new {summary.newCards === 1 ? 'card' : 'cards'}
            </Badge>
            {summary.duplicates > 0 && (
              <Badge tone="neutral" className="px-3 py-1 text-sm">
                {summary.duplicates} {summary.duplicates === 1 ? 'duplicate' : 'duplicates'}
              </Badge>
            )}
          </p>
          <p className="text-ink-soft">All {opening.cards.length} cards are in your collection.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={open} disabled={noneLeft} className={tcgButton()}>
              <RotateCcw aria-hidden className="size-4" />
              Open another
            </button>
            <Link to="/tcg/collection" className={buttonStyles('secondary')}>
              View collection
            </Link>
          </div>
          {noneLeft && <p className="text-sm text-ink-soft">That was today's last pack. More tomorrow!</p>}
        </section>
      )}
    </div>
  )
}

interface RevealCardProps {
  pulled: PulledCard
  /** Where the card sits in the row; staggers the deal. */
  index: number
  faceUp: boolean
  cardBackUrl?: string | null
  onReveal: () => void
}

/**
 * One pulled card: dealt face down, turned over by the player. Turning is a 3D flip of a wrapper
 * that holds both faces; rarer cards add a burst of their tier's color as they land.
 */
function RevealCard({ pulled, index, faceUp, cardBackUrl, onReveal }: RevealCardProps) {
  const { card, isNew } = pulled
  const style = tierStyle(card.rarity.tier)
  const special = card.rarity.tier >= SPECIAL_TIER

  return (
    <div
      style={{ animationDelay: `${index * 90}ms` }}
      className="relative flex flex-col items-center gap-2 motion-safe:animate-card-deal"
    >
      <button
        type="button"
        onClick={onReveal}
        disabled={faceUp}
        aria-label={faceUp ? `${card.name}, ${card.rarity.name}` : `Reveal card ${pulled.position}`}
        className={cn(
          'group relative block w-full rounded-[6%/4.3%] perspective-[900px] disabled:cursor-default',
          !faceUp && 'transition-transform hover:-translate-y-1.5 active:translate-y-0',
        )}
      >
        {faceUp && special && (
          <span
            aria-hidden
            // Timed to go off as the card lands face up, halfway through the flip.
            className={cn(
              'absolute inset-0 rounded-full border-4 opacity-0 [animation-delay:350ms] motion-safe:animate-burst',
              style.burst,
            )}
          />
        )}
        <span
          className={cn(
            'relative block transition-transform duration-700 transform-3d',
            faceUp ? 'rotate-y-0' : 'rotate-y-180',
          )}
        >
          <CardFace card={card} className="backface-hidden" />
          {/* The back sits on the reverse of the same plane, so turning the wrapper swaps the two. */}
          <span className="absolute inset-0 rotate-y-180 backface-hidden">
            <CardBack imageUrl={cardBackUrl} />
          </span>
        </span>
      </button>

      {/* Reserves its height from the start, so the row does not jump when the cards turn over. */}
      <span className={cn('flex min-h-6 flex-wrap items-center justify-center gap-1', !faceUp && 'invisible')}>
        <RarityBadge rarity={card.rarity} />
        {isNew && <Badge tone="success">New</Badge>}
      </span>
    </div>
  )
}
