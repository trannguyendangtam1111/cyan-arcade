import { Modal } from '@/components/ui/Modal'
import type { TcgCard } from '../api'
import { CardFace } from './CardFace'
import { RarityBadge } from './RarityBadge'

/** Turns a metadata key such as `hp` or `attackPower` into a label: "Hp", "Attack power". */
function label(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/** Only plain values are shown; anything nested is a game's own business. */
function printable(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

interface CardDetailProps {
  /** The card to show, or `null` to keep the dialog closed. */
  card: TcgCard | null
  /** How many copies the player owns, when that is known. */
  quantity?: number
  onClose: () => void
}

/**
 * A closer look at one card. Its metadata is listed as it comes: the dialog knows nothing about
 * which fields a particular card game uses.
 */
export function CardDetail({ card, quantity, onClose }: CardDetailProps) {
  const details = card ? Object.entries(card.metadata).filter(([, value]) => printable(value)) : []

  return (
    <Modal open={card !== null} onClose={onClose} title={card?.name ?? ''}>
      {card && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <CardFace card={card} className="mx-auto w-44 shrink-0 shadow-soft" />
          <dl className="grid flex-1 grid-cols-[auto_1fr] content-start gap-x-4 gap-y-2 text-sm">
            <dt className="font-bold text-ink">Rarity</dt>
            <dd>
              <RarityBadge rarity={card.rarity} />
            </dd>
            <dt className="font-bold text-ink">Set</dt>
            <dd>
              {card.set.name} · {card.number}
            </dd>
            <dt className="font-bold text-ink">Game</dt>
            <dd>{card.game.name}</dd>
            {quantity !== undefined && (
              <>
                <dt className="font-bold text-ink">Owned</dt>
                <dd>{quantity === 0 ? 'Not yet' : `${quantity} ${quantity === 1 ? 'copy' : 'copies'}`}</dd>
              </>
            )}
            {details.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-bold text-ink">{label(key)}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Modal>
  )
}
