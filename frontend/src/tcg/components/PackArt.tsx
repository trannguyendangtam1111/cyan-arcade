import { cn } from '@/lib/cn'
import type { PackRef } from '../api'
import { gameAccent } from '../accent'

type PackLook = Pick<PackRef, 'name' | 'imageUrl' | 'setLogoUrl' | 'coverImageUrl' | 'accentColor' | 'set'>

interface PackArtProps {
  pack: PackLook
  className?: string
  /** Read out for the pack where it stands on its own; decorative (the default) next to its name. */
  label?: string
}

/**
 * A booster pack. A pack with artwork of its own shows it. Real card games' sources have none, and
 * the arcade does not make up pack art: it draws a foil wrapper in the game's color around the set's
 * real logo and one of the set's real cards.
 */
export function PackArt({ pack, className, label }: PackArtProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }

  if (pack.imageUrl) {
    return <img src={pack.imageUrl} alt={label ?? ''} draggable={false} className={cn('block', className)} />
  }

  return (
    <span
      {...a11y}
      style={gameAccent(pack.accentColor)}
      className={cn(
        'relative block aspect-5/8 overflow-hidden rounded-[9%/6%] bg-(--accent) shadow-lift ring-1 ring-black/10 select-none [container-type:inline-size]',
        className,
      )}
    >
      {/* Foil: a soft light from the top left. */}
      <span className="absolute inset-0 bg-linear-to-br from-white/45 via-white/5 to-black/25" />
      {/* The crimped seals at both ends. */}
      <span className="absolute inset-x-0 top-0 h-[5%] bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.5)_0_3px,transparent_3px_7px)]" />
      <span className="absolute inset-x-0 bottom-0 h-[5%] bg-[repeating-linear-gradient(90deg,rgb(0_0_0/0.18)_0_3px,transparent_3px_7px)]" />

      {pack.coverImageUrl && (
        <img
          src={pack.coverImageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute top-[31%] left-1/2 w-[64%] -translate-x-1/2 -rotate-6 rounded-[5%/3.6%] shadow-lg ring-2 ring-white/80"
        />
      )}

      <span className="absolute inset-x-[9%] top-[9%] grid h-[19%] place-items-center rounded-[1.2rem] bg-white/92 px-[6%] py-[3%] shadow-md">
        {pack.setLogoUrl ? (
          <img src={pack.setLogoUrl} alt="" loading="lazy" draggable={false} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="line-clamp-2 text-center font-display text-[9cqw] leading-tight font-bold text-ink">
            {pack.set.name}
          </span>
        )}
      </span>

      <span className="absolute inset-x-0 bottom-[8%] text-center font-display text-[7.5cqw] font-bold tracking-wider text-(--accent-ink) uppercase">
        Booster pack
      </span>
    </span>
  )
}
