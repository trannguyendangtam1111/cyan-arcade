import { Layers } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { TcgCard } from '../api'
import { TOP_TIER, tierStyle } from '../rarity'
import { CardImage } from './CardImage'

interface CardFaceProps {
  card: TcgCard
  /** Drawn in grey, for a card the player does not own yet. */
  missing?: boolean
  /** `thumb` for grids, where the source's small image is enough; `full` for a closer look. */
  size?: 'thumb' | 'full'
  className?: string
}

/**
 * The front of a card: its real image, as the card game's source serves it, in a frame that gets
 * fancier with the rarity tier. The rarest cards shimmer, with a single bar of light moved by
 * `transform` so it stays cheap to animate.
 */
export function CardFace({ card, missing = false, size = 'full', className }: CardFaceProps) {
  const tier = card.rarity.tier
  const src = size === 'thumb' ? (card.thumbnailUrl ?? card.imageUrl) : card.imageUrl
  return (
    <span
      className={cn(
        'relative block aspect-5/7 overflow-hidden rounded-[6%/4.3%] bg-surface',
        missing ? 'ring-1 ring-ink/10' : tierStyle(tier).frame,
        className,
      )}
    >
      <CardImage
        key={src}
        src={src}
        fallbackLabel={`${card.name} ${card.number}`}
        className={cn('size-full object-cover', missing && 'opacity-35 grayscale')}
      />
      {tier >= TOP_TIER && !missing && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-white/70 to-transparent motion-safe:animate-holo"
        />
      )}
    </span>
  )
}

/**
 * The back of a card. A game can bring its own; otherwise it is the arcade's own back (never a
 * publisher's), in the color around it (`--accent`): Pokémon yellow, One Piece red, card game purple.
 */
export function CardBack({ imageUrl, className }: { imageUrl?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'relative grid aspect-5/7 place-items-center overflow-hidden rounded-[6%/4.3%] bg-(--accent) ring-2 ring-white/70',
        className,
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" draggable={false} className="size-full object-cover" />
      ) : (
        <>
          <span aria-hidden className="absolute inset-0 bg-linear-to-br from-white/35 via-transparent to-black/25" />
          <span aria-hidden className="absolute inset-[7%] rounded-[5%/3.6%] border-2 border-white/50" />
          <span aria-hidden className="relative grid size-2/5 place-items-center rounded-full bg-white/25 ring-2 ring-white/60">
            <Layers className="size-3/5 text-(--accent-ink)" strokeWidth={2.25} />
          </span>
        </>
      )}
    </span>
  )
}
