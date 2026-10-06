import { Medal, Trophy } from "lucide-react";
import { Link } from "react-router";
import {
  leaderboardUrl,
  LEADERBOARD_PERIODS,
  periodNames,
  type LeaderboardPeriod,
  type PlayerRanks,
  type Standing,
} from "@/api/leaderboards";
import { usePlayerRanks } from "@/api/profile";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatScore } from "@/lib/format";

type RankKey = "daily" | "weekly" | "allTime";

const keys: Record<LeaderboardPeriod, RankKey> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  ALL_TIME: "allTime",
};

/**
 * Where the player stands on the leaderboards: their best rank anywhere, and per game today, this
 * week and of all time. Read from the boards themselves; a game they have not played has no rank.
 */
export function Rankings() {
  const { data, isPending, isError, refetch } = usePlayerRanks(true);

  return (
    <section aria-labelledby="rankings-heading">
      <h2 id="rankings-heading" className="mb-3 text-2xl font-bold">
        Rankings
      </h2>
      {isPending && (
        <LoadingState label="Loading your ranks…" className="min-h-40" />
      )}
      {isError && (
        <ErrorState
          title="Couldn't load your ranks"
          onRetry={() => void refetch()}
        />
      )}
      {data && <RankingsView ranks={data} />}
    </section>
  );
}

/** A player's ranks, from wherever they came (their own profile, or a public one). */
export function RankingsView({
  ranks: data,
  whose = "Your",
}: {
  ranks: PlayerRanks;
  whose?: string;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <Card
        padding="lg"
        className="flex items-center gap-4 bg-linear-to-br from-amber-50 to-surface"
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-400 text-amber-950 shadow-soft">
          <Trophy aria-hidden className="size-7" />
        </span>
        {data.bestRank !== null && data.bestRankGame ? (
          <p>
            <span className="block text-sm font-bold tracking-wide text-ink-soft uppercase">
              Best rank
            </span>
            <span className="font-display text-3xl font-bold tabular-nums">
              #{formatScore(data.bestRank)}
            </span>{" "}
            <span className="text-ink-soft">
              in {data.bestRankGame.name}, of all time
            </span>
          </p>
        ) : (
          <p className="text-ink-soft">
            <strong className="block text-ink">Not ranked yet.</strong> Finish a
            game to get on the boards.
          </p>
        )}
      </Card>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left">
          <caption className="sr-only">
            {whose} rank in every game, today, this week and of all time
          </caption>
          <thead className="text-xs font-bold tracking-wide text-ink-soft uppercase">
            <tr>
              <th scope="col" className="py-3 pl-5">
                Game
              </th>
              {LEADERBOARD_PERIODS.map((period) => (
                <th key={period} scope="col" className="py-3 pr-5 text-right">
                  {periodNames[period].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.games.map(({ game, ...ranks }) => (
              <tr key={game.slug} className="border-t border-line">
                <th
                  scope="row"
                  className="py-3 pl-5 font-display font-semibold"
                >
                  {game.name}
                </th>
                {LEADERBOARD_PERIODS.map((period) => (
                  <td key={period} className="py-3 pr-5 text-right">
                    <RankCell
                      standing={ranks[keys[period]]}
                      to={leaderboardUrl(game.slug, period)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function RankCell({ standing, to }: { standing: Standing | null; to: string }) {
  if (!standing) return <span className="text-ink-soft">–</span>;
  return (
    <Link
      to={to}
      title={`Best ${formatScore(standing.score)}`}
      className="inline-flex items-center gap-1 rounded font-display font-semibold tabular-nums hover:text-brand-700"
    >
      {standing.rank <= 3 && (
        <Medal aria-hidden className="size-4 text-amber-500" />
      )}
      #{formatScore(standing.rank)}
    </Link>
  );
}
