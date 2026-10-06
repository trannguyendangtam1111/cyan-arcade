import { Award, CalendarDays, Clock, Gamepad2, Pencil, ShieldCheck, Star, Trophy, UserRound, UserX, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { usePublicProfile, type PublicProfile } from '@/api/profile'
import { ItemIcon } from '@/components/ItemIcon'
import { FramedAvatar } from '@/components/FramedAvatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate, formatDuration, formatScore } from '@/lib/format'
import { EditProfileDialog } from './profile/EditProfileDialog'
import { GameStatsTable } from './profile/GameStatsTable'
import { RankingsView } from './profile/Rankings'

/**
 * A player's public profile, by username (`/players/pixel`): who they are, what they wear, their
 * numbers, ranks and achievements. Nothing private (coins, inventory, history of coins) is ever
 * sent to it. The player themselves also gets an Edit profile button.
 */
export function PublicProfilePage() {
  const { username = '' } = useParams()
  const { data: profile, isPending, isError, error, refetch } = usePublicProfile(username)
  useDocumentTitle(profile ? profile.displayName : 'Player')

  if (isPending) return <LoadingState label="Loading this player…" />
  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <EmptyState
          icon={UserX}
          title="Player not found"
          description={`Nobody here goes by @${username}.`}
          action={
            <Link to="/leaderboard" className={buttonStyles('primary')}>
              See the leaderboards
            </Link>
          }
        />
      )
    }
    return <ErrorState title="Couldn't load this player" onRetry={() => void refetch()} />
  }

  return (
    <div className="flex flex-col gap-section">
      <ProfileCard profile={profile} />
      <Statistics profile={profile} />
      <section aria-labelledby="public-rankings-heading">
        <h2 id="public-rankings-heading" className="mb-3 text-2xl font-bold">
          Rankings
        </h2>
        <RankingsView ranks={profile.ranks} whose={`${profile.displayName}'s`} />
      </section>
      {profile.stats.games.length > 0 && <GameStatsTable games={profile.stats.games} />}
      <Achievements profile={profile} />
    </div>
  )
}

function ProfileCard({ profile }: { profile: PublicProfile }) {
  const [editing, setEditing] = useState(false)

  return (
    <Card
      padding="lg"
      className="relative flex flex-col items-center gap-5 overflow-hidden text-center sm:flex-row sm:items-start sm:text-left"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-2 bg-linear-to-r from-brand-400 via-purple-400 to-amber-400" />
      <div className="relative shrink-0 motion-safe:animate-pop-in">
        <FramedAvatar avatar={profile.avatar} frame={profile.cosmetic} size="lg" />
        {profile.cosmetic && <span className="sr-only">Frame: {profile.cosmetic.name}</span>}
        {profile.badge && (
          <span
            title={`Badge: ${profile.badge.name}`}
            className="absolute -top-1 -left-1 grid size-9 place-items-center rounded-full bg-amber-400 text-amber-950 shadow-soft ring-2 ring-surface"
          >
            <ItemIcon icon={profile.badge.icon} className="size-5" />
            <span className="sr-only">Badge: {profile.badge.name}</span>
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="text-title font-bold break-words">{profile.displayName}</h1>
        <p className="font-display font-medium text-ink-soft">@{profile.username}</p>
        {profile.title && <p className="mt-1 font-display font-semibold text-purple-700">{profile.title.name}</p>}
        <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          <Badge tone="brand" className="px-3 py-1 text-sm">
            Level {profile.level}
          </Badge>
          {profile.role === 'ADMIN' && (
            <Badge tone="warning" className="px-3 py-1 text-sm">
              <ShieldCheck aria-hidden className="size-4" />
              Admin
            </Badge>
          )}
          <Badge tone="neutral" className="px-3 py-1 text-sm">
            <CalendarDays aria-hidden className="size-4" />
            Playing since {formatDate(profile.memberSince)}
          </Badge>
        </div>
        {profile.bio && <p className="mt-4 max-w-prose whitespace-pre-line break-words text-ink">{profile.bio}</p>}
      </div>

      {profile.you && (
        <div className="flex shrink-0 flex-col gap-2">
          <Button onClick={() => setEditing(true)}>
            <Pencil aria-hidden className="size-4" />
            Edit profile
          </Button>
          <Link to="/profile" className={buttonStyles('ghost', 'sm')}>
            <UserRound aria-hidden className="size-4" />
            Your full profile
          </Link>
          <EditProfileDialog
            open={editing}
            onClose={() => setEditing(false)}
            current={{ displayName: profile.displayName, bio: profile.bio, avatar: profile.avatar }}
          />
        </div>
      )}
    </Card>
  )
}

function Statistics({ profile }: { profile: PublicProfile }) {
  const { stats } = profile
  const items: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Gamepad2, label: 'Games played', value: formatScore(stats.gamesPlayed) },
    { icon: Star, label: 'Total score', value: formatScore(stats.totalScore) },
    { icon: Clock, label: 'Play time', value: formatDuration(stats.playTimeMs) },
    { icon: Award, label: 'Achievements', value: `${profile.achievements.length} / ${profile.achievementsTotal}` },
    ...stats.activities
      .filter((entry) => entry.key !== 'tcg.uniqueCards')
      .map((entry) => ({ icon: Trophy, label: entry.label, value: formatScore(entry.value) })),
  ]

  return (
    <section aria-labelledby="public-stats-heading">
      <h2 id="public-stats-heading" className="mb-3 text-2xl font-bold">
        Statistics
      </h2>
      <Card padding="lg">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-control bg-surface-muted p-3">
              <dt className="flex items-center gap-2 text-sm font-bold text-ink-soft">
                <Icon aria-hidden className="size-4" />
                {label}
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  )
}

function Achievements({ profile }: { profile: PublicProfile }) {
  return (
    <section aria-labelledby="public-achievements-heading">
      <h2 id="public-achievements-heading" className="mb-3 text-2xl font-bold">
        Achievements
        <span className="ml-2 font-sans text-base font-bold text-ink-soft">
          {profile.achievements.length} of {profile.achievementsTotal}
        </span>
      </h2>
      {profile.achievements.length === 0 ? (
        <Card className="text-ink-soft">No achievements unlocked yet.</Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.achievements.map((achievement) => (
            <li key={achievement.code}>
              <Card className="flex h-full gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-amber-950 shadow-soft">
                  <Trophy aria-hidden className="size-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-semibold">{achievement.name}</span>
                  <span className="block text-sm text-ink-soft">{achievement.description}</span>
                  {achievement.unlockedAt && (
                    <span className="mt-1 block text-sm font-bold text-amber-700">
                      Unlocked {formatDate(achievement.unlockedAt)}
                    </span>
                  )}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
