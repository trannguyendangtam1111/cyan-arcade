import { Gamepad2 } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

interface LogoProps {
  /**
   * Show only the emblem between the tablet and desktop breakpoints, where the header also has to
   * fit the full navigation and the signed-in player.
   */
  compactOnTablet?: boolean
}

export function Logo({ compactOnTablet = false }: LogoProps) {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5 rounded-2xl" aria-label="Cyan Arcade home">
      <span className="grid size-10 place-items-center rounded-xl bg-brand-500 text-brand-950 shadow-[0_3px_0_0_var(--color-brand-700)] transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105">
        <Gamepad2 aria-hidden className="size-6" strokeWidth={2.25} />
      </span>
      <span
        className={cn(
          'font-display text-xl font-bold tracking-tight whitespace-nowrap',
          compactOnTablet && 'md:max-lg:hidden',
        )}
      >
        <span className="text-brand-600">Cyan</span> Arcade
      </span>
    </Link>
  )
}
