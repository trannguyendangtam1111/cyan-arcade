import { cn } from '@/lib/cn'
import type { TcgCard } from '../api'
import { CardFace } from './CardFace'

interface CardTileProps {
  card: TcgCard
  /** Copies the player owns. `undefined` when ownership is not known (a guest browsing a set). */
  quantity?: number
  onSelect: (card: TcgCard) => void
}

/** A card in a grid: its face, its name, and how many the player has. Opens the closer look. */
export function CardTile({ card, quantity, onSelect }: CardTileProps) {
  const missing = quantity === 0
  const owned = quantity === undefined ? '' : missing ? ', not owned' : `, ${quantity} owned`

  return (
    <button
      type="button"
      onClick={() => onSelect(card)}
      aria-label={`${card.name}, ${card.rarity.name}${owned}`}
      className="group relative flex w-full flex-col gap-1.5 rounded-xl text-left transition-transform hover:-translate-y-1 active:translate-y-0"
    >
      <CardFace card={card} missing={missing} size="thumb" className="w-full" />
      {quantity !== undefined && quantity > 1 && (
        <span className="absolute -top-2 -right-2 rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white shadow-soft ring-2 ring-surface">
          ×{quantity}
        </span>
      )}
      <span className={cn('truncate px-0.5 text-sm font-bold', missing && 'text-ink-soft')}>
        <span className="font-normal text-ink-soft">{card.number}</span> {card.name}
      </span>
    </button>
  )
}
