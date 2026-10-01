import { Gamepad2, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import type { GameCategory } from '@/api/games'
import { categoryIcons } from '@/components/categoryIcons'
import { GameGrid } from '@/components/GameGrid'
import { JumpBackIn } from '@/components/JumpBackIn'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { categoryLabels } from '@/games/registry'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { useRecentGames } from '@/hooks/useRecentGames'
import { TcgHubBanner } from '@/tcg/components/TcgHubBanner'
import { cn } from '@/lib/cn'

const ALL_CATEGORIES = Object.keys(categoryLabels) as GameCategory[]

/** What the list is called while one category is showing. */
const categoryHeadings: Record<GameCategory, string> = {
  ARCADE: 'Arcade games',
  PUZZLE: 'Puzzle games',
  STRATEGY: 'Strategy games',
  CARD: 'Card games',
}

/** Reads a category from the URL, where it is written in lower case. Anything unknown means "all". */
function parseCategory(value: string | null): GameCategory | null {
  const category = value?.toUpperCase()
  return ALL_CATEGORIES.find((candidate) => candidate === category) ?? null
}

/**
 * The whole catalog, filterable by category. The filter lives in the URL (`?category=puzzle`), so
 * it can be linked to and survives a reload.
 */
export function GamesPage() {
  useDocumentTitle('Games')
  const [params, setParams] = useSearchParams()
  const { games } = useGameCatalog()
  const recentGames = useRecentGames()
  const selected = parseCategory(params.get('category'))

  // Only categories that have games get a filter, in the catalog's fixed order.
  const categories = ALL_CATEGORIES.map((category) => ({
    category,
    count: games?.filter((game) => game.category === category).length ?? 0,
  })).filter(({ count }) => count > 0)

  const select = (category: GameCategory | null) => setParams(category ? { category: category.toLowerCase() } : {})

  return (
    <>
      <PageHeader
        icon={Gamepad2}
        title="Games"
        description="Every cabinet in the arcade. New games roll in regularly."
      />

      {recentGames.length > 0 && selected === null && (
        <section aria-labelledby="recent-heading" className="mb-10">
          <h2 id="recent-heading" className="mb-4 text-xl font-semibold">
            Jump back in
          </h2>
          <JumpBackIn games={recentGames} />
        </section>
      )}

      <section aria-labelledby="all-games-heading">
        <h2 id="all-games-heading" className="mb-4 text-xl font-semibold">
          {selected ? categoryHeadings[selected] : 'All games'}
        </h2>

        {categories.length > 1 && (
          <div role="group" aria-label="Filter by category" className="mb-6 flex flex-wrap gap-2">
            <FilterChip label="All" count={games?.length ?? 0} pressed={selected === null} onClick={() => select(null)} />
            {categories.map(({ category, count }) => {
              const Icon = categoryIcons[category]
              return (
                <FilterChip
                  key={category}
                  label={categoryLabels[category]}
                  count={count}
                  pressed={selected === category}
                  onClick={() => select(category)}
                  icon={<Icon aria-hidden className="size-4" />}
                />
              )
            })}
          </div>
        )}

        <GameGrid
          select={selected ? (all) => all.filter((game) => game.category === selected) : undefined}
          skeletonCount={6}
          emptySelection={
            <EmptyState
              icon={SearchX}
              title={selected ? `No ${categoryHeadings[selected].toLowerCase()} yet` : 'No games found'}
              description="Nothing in this category at the moment. The rest of the arcade is open."
              action={
                <Button variant="secondary" onClick={() => select(null)}>
                  Show all games
                </Button>
              }
            />
          }
        />
      </section>

      <section aria-label="Card packs" className="mt-10">
        <TcgHubBanner />
      </section>
    </>
  )
}

interface FilterChipProps {
  label: string
  count: number
  pressed: boolean
  onClick: () => void
  icon?: ReactNode
}

function FilterChip({ label, count, pressed, onClick, icon }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-display font-medium ring-2 transition-all active:scale-95',
        pressed
          ? 'bg-brand-500 text-brand-950 ring-brand-500'
          : 'bg-surface text-ink-soft ring-line hover:text-ink hover:ring-brand-300',
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs font-bold tabular-nums',
          pressed ? 'bg-white/45' : 'bg-surface-muted text-ink-soft',
        )}
      >
        {count}
      </span>
    </button>
  )
}
