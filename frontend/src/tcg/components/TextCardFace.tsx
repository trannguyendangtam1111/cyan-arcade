import { Layers, ShieldAlert, Sparkles, Star, Swords, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { TcgCard } from '../api'
import { textCardDetails, textCardFrame, type TextCardKind } from '../textCard'

const EMBLEMS: Record<TextCardKind, LucideIcon> = {
  monster: Swords,
  spell: Sparkles,
  trap: ShieldAlert,
  other: Layers,
}

interface TextCardFaceProps {
  card: TcgCard
  /** `thumb` leaves out the effect text, which a grid has no room for. */
  size: 'thumb' | 'full'
  missing?: boolean
}

/**
 * The front of a card that has no picture the arcade may show (Yu-Gi-Oh!: the artwork is Konami's):
 * its own card text in a framed layout instead. Everything is sized in container units, so the same
 * card reads at grid size and in a closer look; very small cards (a history row) keep only the
 * name and emblem. Decorative to assistive technology, like a card's picture: the places that show
 * a card name it themselves.
 */
export function TextCardFace({ card, size, missing = false }: TextCardFaceProps) {
  const details = textCardDetails(card)
  const Emblem = EMBLEMS[details.kind]
  const full = size === 'full'

  return (
    // The outer element is the size container; container units only work inside it.
    <span aria-hidden data-testid="text-card" className={cn('@container block size-full', missing && 'opacity-35 grayscale')}>
      <span
        className={cn('flex size-full flex-col bg-linear-to-br p-[3.5cqw] text-stone-900', textCardFrame(card.game.slug))}
      >
        <span className="flex min-h-0 flex-1 flex-col gap-[2.5cqw] rounded-[4%/2.9%] bg-amber-50 p-[3cqw] shadow-[inset_0_0_0_1px_rgb(120_53_15/0.25)]">
          {/* Name, with the attribute beside it. */}
          <span className="flex items-start gap-[2cqw] rounded-[3cqw] bg-white/90 px-[2.5cqw] py-[1.5cqw] shadow-[inset_0_0_0_1px_rgb(120_53_15/0.2)]">
            <span className="line-clamp-3 min-w-0 flex-1 font-display text-[10cqw] leading-[1.05] font-bold [overflow-wrap:anywhere] @min-[7rem]:text-[7.5cqw]">
              {card.name}
            </span>
            {details.attribute && (
              <span className="hidden shrink-0 rounded-full bg-stone-800 px-[2cqw] py-[0.5cqw] text-[3.6cqw] font-bold tracking-wide text-amber-100 @min-[7rem]:inline">
                {details.attribute}
              </span>
            )}
          </span>

          {(details.levelLabel || full) && (
            <span className="hidden items-center justify-between gap-[2cqw] text-[4.2cqw] font-bold @min-[7rem]:flex">
              <span className="truncate text-amber-900/80">{full ? card.rarity.name : ''}</span>
              {details.levelLabel && (
                <span className="flex shrink-0 items-center gap-[1cqw] text-amber-800">
                  <Star aria-hidden className="size-[4.5cqw] fill-amber-400 text-amber-600" />
                  {details.levelLabel}
                </span>
              )}
            </span>
          )}

          {details.pendulumScale !== null && (
            <span className="hidden rounded-[2cqw] bg-cyan-100 px-[2cqw] text-[4.5cqw] font-bold text-cyan-950 @min-[7rem]:block">
              Pendulum scale {details.pendulumScale}
            </span>
          )}

          {/* Where the artwork would be: the arcade's cyan, with the kind of card. */}
          <span
            className={cn(
              'relative grid place-items-center overflow-hidden rounded-[3cqw] bg-linear-to-br from-cyan-300 via-cyan-500 to-cyan-800 shadow-[inset_0_0_0_1px_rgb(8_51_68/0.35)]',
              full && (details.effect || details.typeLine) ? 'min-h-[18cqw] flex-[0_1_34%]' : 'min-h-[18cqw] flex-1',
            )}
          >
            <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.45),transparent_55%)]" />
            <Emblem className="relative size-[22cqw] text-white/85 drop-shadow" strokeWidth={1.75} />
          </span>

          {details.typeLine && (
            <span className="hidden truncate text-[4.4cqw] font-bold text-stone-700 @min-[7rem]:block">
              [{details.typeLine}]
            </span>
          )}

          {full && details.effect && (
            <span className="hidden min-h-0 flex-1 overflow-hidden rounded-[2cqw] bg-white/70 px-[2.5cqw] py-[1.5cqw] text-[4.8cqw] leading-snug text-stone-800 [mask-image:linear-gradient(to_bottom,black_80%,transparent)] @min-[7rem]:block">
              {details.effect}
            </span>
          )}

          <span className="mt-auto hidden items-end justify-between gap-[2cqw] text-[3.8cqw] font-bold text-stone-600 @min-[7rem]:flex">
            <span className="truncate">{card.number}</span>
            {details.stats && <span className="shrink-0 text-stone-900">{details.stats}</span>}
          </span>
        </span>
      </span>
    </span>
  )
}
