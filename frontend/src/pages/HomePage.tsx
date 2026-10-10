import {
  ArrowRight,
  Award,
  Dices,
  Gamepad2,
  History,
  Joystick,
  LayoutGrid,
  Puzzle,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useSession } from '@/api/auth'
import type { GameCategory } from '@/api/games'
import { useAchievements } from '@/api/profile'
import { categoryIcons } from '@/components/categoryIcons'
import { DailyChallenges } from '@/components/DailyChallenges'
import { GameGrid } from '@/components/GameGrid'
import { JumpBackIn } from '@/components/JumpBackIn'
import { LeaderboardPreview } from '@/components/LeaderboardPreview'
import { PlayerStrip } from '@/components/PlayerStrip'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles, interactiveCard } from '@/components/ui/cardStyles'
import { categoryLabels } from '@/games/registry'
import type { GameDefinition } from '@/games/types'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { useRecentGames } from '@/hooks/useRecentGames'
import { TcgHubBanner } from '@/tcg/components/TcgHubBanner'
import { cn } from '@/lib/cn'

/** Purely decorative hero art. Deliberately generic: real games only ever come from the catalog. */
const heroTiles: { icon: LucideIcon; className: string }[] = [
  { icon: Gamepad2, className: 'bg-brand-500' },
  { icon: Trophy, className: 'bg-amber-400' },
  { icon: Puzzle, className: 'bg-violet-500' },
  { icon: Dices, className: 'bg-pink-500' },
  { icon: Joystick, className: 'bg-emerald-500' },
  { icon: Sparkles, className: 'bg-sky-500' },
]

const FEATURED_FALLBACK_COUNT = 3
const PREVIEW_BOARDS = 3

/** The games in the spotlight. A catalog that marks none still gets a front row. */
function featuredGames(games: GameDefinition[]): GameDefinition[] {
  const featured = games.filter((game) => game.featured)
  return featured.length > 0 ? featured : games.slice(0, FEATURED_FALLBACK_COUNT)
}

/**
 * The hub's front page: the player's coins and daily reward, what is new today, where they left
 * off, what to play, who is winning, what they unlocked lately, and ways to browse.
 */
export function HomePage() {
  useDocumentTitle()
  const { user } = useSession()
  const { games } = useGameCatalog()
  const recentGames = useRecentGames()
  // Boards only make sense for games that can be played and are scored.
  const boards = games ? featuredGames(games).filter((game) => game.module && game.scored).slice(0, PREVIEW_BOARDS) : []

  return (
    <div className="flex flex-col gap-section">
      <Hero />

      {user && <PlayerStrip />}

      <DailyChallenges />

      {recentGames.length > 0 && (
        <Section id="recent" icon={History} title="Jump back in">
          <JumpBackIn games={recentGames} />
        </Section>
      )}

      <Section id="featured" icon={Star} title="Featured games" link={{ to: '/games', label: 'All games' }}>
        <GameGrid select={featuredGames} />
      </Section>

      <section aria-label="Card packs">
        <TcgHubBanner />
      </section>

      {boards.length > 0 && (
        <Section id="top-scores" icon={Trophy} title="Top scores" link={{ to: '/leaderboard', label: 'Leaderboard' }}>
          <LeaderboardPreview games={boards} />
        </Section>
      )}

      {user && <RecentAchievements />}

      {games && games.length > 0 && (
        <Section id="categories" icon={LayoutGrid} title="Browse by category">
          <CategoryTiles games={games} />
        </Section>
      )}
    </div>
  )
}

function Hero() {
  const { user } = useSession()

  return (
    <section className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
      <div className="motion-safe:animate-pop-in">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-800">
          <Sparkles aria-hidden className="size-4" />
          {user ? `Welcome back, ${user.username}!` : 'Tiny games, big fun'}
        </p>
        <h1 className="text-hero font-bold">
          Pick a cabinet.
          <br />
          <span className="text-brand-600">Press start.</span>
        </h1>
        <p className="mt-4 max-w-lg text-lg text-ink-soft">
          Cyan Arcade is a cozy corner of the web full of quick, colorful mini-games. Chase high scores, level up,
          and take on a fresh set of challenges every day.
        </p>
        <div className="mt-7 flex flex-wrap gap-4">
          <Link to="/games" className={buttonStyles('primary', 'lg')}>
            Browse games
            <ArrowRight aria-hidden className="size-5" />
          </Link>
          <Link to="/leaderboard" className={buttonStyles('secondary', 'lg')}>
            <Trophy aria-hidden className="size-5" />
            Leaderboard
          </Link>
        </div>
      </div>

      <div aria-hidden className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3 sm:gap-4">
        {heroTiles.map(({ icon: Icon, className }, index) => (
          <div
            key={index}
            style={{ animationDelay: `${index * 0.4}s` }}
            className={cn(
              'aspect-square place-items-center rounded-3xl text-white shadow-soft motion-safe:animate-float',
              // One row on phones, so the first thing to scroll to is something to play.
              index < 3 ? 'grid' : 'hidden md:grid',
              className,
            )}
          >
            <Icon className="size-1/2" strokeWidth={2} />
          </div>
        ))}
      </div>
    </section>
  )
}

interface SectionProps {
  /** Prefix for the heading's id, which labels the section. */
  id: string
  icon: LucideIcon
  title: string
  /** A "see everything" link shown beside the heading. */
  link?: { to: string; label: string }
  children: ReactNode
}

/** A titled block of the home page. */
function Section({ id, icon: Icon, title, link, children }: SectionProps) {
  const headingId = `${id}-heading`
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 id={headingId} className="flex items-center gap-2.5 text-2xl font-bold sm:text-3xl">
          <span className="grid size-10 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <Icon aria-hidden className="size-5.5" strokeWidth={2.25} />
          </span>
          {title}
        </h2>
        {link && (
          <Link
            to={link.to}
            className="group inline-flex shrink-0 items-center gap-1 rounded-lg font-display font-medium text-brand-700 hover:text-brand-900"
          >
            {link.label}
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

const RECENT_ACHIEVEMENTS = 3

/** The signed-in player's latest unlocks. Nothing at all until they have one. */
function RecentAchievements() {
  const { data } = useAchievements(true)
  const recent = (data ?? [])
    .filter((achievement) => achievement.unlocked && achievement.unlockedAt)
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
    .slice(0, RECENT_ACHIEVEMENTS)
  if (recent.length === 0) return null

  return (
    <Section id="recent-achievements" icon={Award} title="Recent achievements" link={{ to: '/profile', label: 'All achievements' }}>
      <ul className="grid gap-4 md:grid-cols-3">
        {recent.map((achievement) => (
          <li key={achievement.code} className={cardStyles('md', 'flex items-center gap-4')}>
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-amber-950 shadow-soft">
              <Trophy aria-hidden className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg font-semibold">{achievement.name}</span>
              <span className="text-sm text-ink-soft">{achievement.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** One tile per category that has games, leading to the catalog filtered by it. */
function CategoryTiles({ games }: { games: GameDefinition[] }) {
  const categories = (Object.keys(categoryLabels) as GameCategory[])
    .map((category) => ({ category, count: games.filter((game) => game.category === category).length }))
    .filter(({ count }) => count > 0)

  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {categories.map(({ category, count }) => {
        const Icon = categoryIcons[category]
        return (
          <li key={category} className="flex *:w-full">
            <Link
              to={`/games?category=${category.toLowerCase()}`}
              className={cardStyles('md', cn('group flex items-center gap-3', interactiveCard))}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-700 transition-transform group-hover:-rotate-6 group-hover:scale-105">
                <Icon aria-hidden className="size-6" strokeWidth={2.25} />
              </span>
              <span>
                <span className="block font-display text-lg font-semibold">{categoryLabels[category]}</span>
                <span className="text-sm text-ink-soft">
                  {count} {count === 1 ? 'game' : 'games'}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
