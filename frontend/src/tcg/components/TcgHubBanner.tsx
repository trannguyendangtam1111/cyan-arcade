import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { gameAccent } from '../accent'
import { CardBack } from './CardFace'

/**
 * The card game's doorway on the hub pages. The one piece of the module the rest of the arcade
 * shows; it needs no data, so the hub does not wait for, or break with, the card game.
 */
export function TcgHubBanner() {
  return (
    <Link
      to="/tcg"
      style={gameAccent(null)}
      className="group relative flex items-center justify-between gap-6 overflow-hidden rounded-card bg-linear-to-br from-purple-700 via-fuchsia-600 to-pink-600 p-6 text-white shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lift active:translate-y-0 sm:p-8"
    >
      <span className="relative max-w-md">
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
          <Sparkles aria-hidden className="size-4 text-amber-200" />
          Collect them all
        </span>
        <span className="block font-display text-2xl font-bold sm:text-3xl">Card packs</span>
        <span className="mt-1 block text-white/90">
          Tear open real Pokémon and One Piece boosters, flip the cards one by one and chase the rarest pulls.
        </span>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 font-display font-semibold text-purple-700">
          Open packs
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </span>

      {/* A fan of three face-down cards. Decoration only. */}
      <span aria-hidden className="relative hidden h-36 w-44 shrink-0 sm:block">
        {[-16, 0, 16].map((angle, index) => (
          <span
            key={angle}
            style={{ transform: `rotate(${angle}deg)`, left: `${index * 2.4}rem` }}
            className="absolute top-2 w-24 origin-bottom shadow-lift transition-transform duration-300 group-hover:-translate-y-2"
          >
            <CardBack />
          </span>
        ))}
      </span>
    </Link>
  )
}
