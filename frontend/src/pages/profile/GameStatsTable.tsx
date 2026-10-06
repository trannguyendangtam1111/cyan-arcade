import { Link } from 'react-router'
import type { GameStats } from '@/api/profile'
import { Card } from '@/components/ui/Card'
import { formatDate, formatDuration, formatScore } from '@/lib/format'

/** The player's numbers in each game they have played, most played first. */
export function GameStatsTable({ games }: { games: GameStats[] }) {
  return (
    <section aria-labelledby="game-stats-heading">
      <h2 id="game-stats-heading" className="mb-3 text-2xl font-bold">
        By game
      </h2>
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left">
          <caption className="sr-only">Your numbers in every game you have played</caption>
          <thead className="text-xs font-bold tracking-wide text-ink-soft uppercase">
            <tr>
              <th scope="col" className="py-3 pl-5">
                Game
              </th>
              <th scope="col" className="py-3 text-right">
                Played
              </th>
              <th scope="col" className="py-3 text-right">
                Best
              </th>
              <th scope="col" className="py-3 text-right">
                Average
              </th>
              <th scope="col" className="hidden py-3 text-right sm:table-cell">
                Time
              </th>
              <th scope="col" className="py-3 pr-5 text-right">
                Last played
              </th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.slug} className="border-t border-line">
                <th scope="row" className="py-3 pl-5 font-display font-semibold">
                  <Link to={`/games/${game.slug}`} className="rounded hover:text-brand-700">
                    {game.name}
                  </Link>
                </th>
                <td className="py-3 text-right tabular-nums">{formatScore(game.gamesPlayed)}</td>
                <td className="py-3 text-right font-bold tabular-nums">{formatScore(game.bestScore)}</td>
                <td className="py-3 text-right tabular-nums">{formatScore(game.averageScore)}</td>
                <td className="hidden py-3 text-right tabular-nums sm:table-cell">{formatDuration(game.playTimeMs)}</td>
                <td className="py-3 pr-5 text-right text-ink-soft">{formatDate(game.lastPlayedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  )
}
