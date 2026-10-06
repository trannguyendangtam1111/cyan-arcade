import { cn } from '@/lib/cn'

interface SetBannerProps {
  name: string
  /** The set's logo, when it has one. */
  logoUrl: string | null
  /** One of the set's rarest cards. */
  coverImageUrl: string | null
  className?: string
}

/**
 * The picture for a set: its real logo on a wash of the game's color, with one of its rarest cards
 * fanned out beside it. A set without a logo shows its name instead. Takes `--accent` from around it.
 */
export function SetBanner({ name, logoUrl, coverImageUrl, className }: SetBannerProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex items-center overflow-hidden bg-[color-mix(in_srgb,var(--accent)_22%,white)] [container-type:inline-size]',
        className,
      )}
    >
      <span className="absolute -top-1/3 -left-1/4 size-[80cqw] rounded-full bg-white/45 blur-2xl" />
      <span className="relative grid h-full w-[62%] place-items-center p-[6%]">
        {logoUrl ? (
          <img src={logoUrl} alt="" loading="lazy" draggable={false} className="max-h-full max-w-full object-contain drop-shadow-md" />
        ) : (
          <span className="line-clamp-3 text-center font-display text-[7cqw] leading-tight font-bold text-ink">{name}</span>
        )}
      </span>
      {coverImageUrl && (
        <img
          src={coverImageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute top-[12%] right-[7%] w-[27%] rotate-6 rounded-[5%/3.6%] shadow-lift ring-2 ring-white transition-transform duration-300 group-hover:rotate-2 group-hover:scale-105"
        />
      )}
    </span>
  )
}
