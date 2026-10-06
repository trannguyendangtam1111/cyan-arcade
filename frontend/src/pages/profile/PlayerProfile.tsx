import { Award, Clock, Eye, Gamepad2, Layers, LogOut, Package, Pencil, PiggyBank, Star, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLogout } from '@/api/auth'
import { useProfile, useStats, type ProfileResponse, type StatsResponse } from '@/api/profile'
import { ItemIcon } from '@/components/ItemIcon'
import { FramedAvatar } from '@/components/FramedAvatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { CoinAmount, CoinIcon } from '@/components/ui/CoinAmount'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { cn } from '@/lib/cn'
import { formatDate, formatDuration, formatScore } from '@/lib/format'
import { AchievementGrid } from './AchievementGrid'
import { AvatarPicker } from './AvatarPicker'
import { EditProfileDialog } from './EditProfileDialog'
import { CoinHistory } from './CoinHistory'
import { GameStatsTable } from './GameStatsTable'
import { Rankings } from './Rankings'
import { RecentGames } from './RecentGames'

/** The profile of the signed-in player. */
export function PlayerProfile() {
  const { data: profile, isPending, isError, refetch } = useProfile(true)
  // Counted on the server from several modules; asked for here only, not on every page.
  const { data: stats } = useStats(true)

  if (isPending) return <LoadingState label="Loading your profile…" />
  if (isError) return <ErrorState title="Couldn't load your profile" onRetry={() => void refetch()} />

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <ProfileHeader profile={profile} />
        <div className="flex flex-col gap-5">
          <LevelProgress profile={profile} />
          <Statistics profile={profile} stats={stats} />
        </div>
      </div>
      <Rankings />
      {stats && stats.games.length > 0 && <GameStatsTable games={stats.games} />}
      <RecentGames />
      <AchievementGrid />
      <CoinHistory />
    </div>
  )
}

function ProfileHeader({ profile }: { profile: ProfileResponse }) {
  const [choosingAvatar, setChoosingAvatar] = useState(false)
  const [editing, setEditing] = useState(false)
  const logout = useLogout()

  return (
    <Card padding="lg" className="flex flex-col items-center text-center">
      <div className="relative mb-4">
        <FramedAvatar avatar={profile.avatar} frame={profile.cosmetic} size="lg" />
        {profile.cosmetic && <span className="sr-only">Frame: {profile.cosmetic.name}</span>}
        <button
          type="button"
          onClick={() => setChoosingAvatar(true)}
          aria-label="Change avatar"
          className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full bg-surface text-ink shadow-soft ring-2 ring-line transition-colors hover:bg-brand-50"
        >
          <Pencil aria-hidden className="size-4" />
        </button>
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
      <h2 className="text-2xl font-semibold break-words">{profile.displayName}</h2>
      <p className="font-display font-medium text-ink-soft">@{profile.username}</p>
      {profile.title && <p className="font-display font-medium text-purple-700">{profile.title.name}</p>}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Badge tone="brand" className="px-3 py-1 text-sm">
          Level {profile.level}
        </Badge>
        <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
          <CoinAmount amount={profile.coins} />
        </span>
      </div>
      {profile.bio && <p className="mt-3 max-w-prose whitespace-pre-line break-words">{profile.bio}</p>}
      <p className="mt-3 text-sm text-ink-soft">Playing since {formatDate(profile.memberSince)}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="size-4" />
          Edit profile
        </Button>
        <Link to={`/players/${encodeURIComponent(profile.username)}`} className={buttonStyles('secondary', 'sm')}>
          <Eye aria-hidden className="size-4" />
          Public profile
        </Link>
      </div>
      <EditProfileDialog
        open={editing}
        onClose={() => setEditing(false)}
        current={{ displayName: profile.displayName, bio: profile.bio, avatar: profile.avatar }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden className="size-4" />
        Log out
      </Button>

      <AvatarPicker current={profile.avatar} open={choosingAvatar} onClose={() => setChoosingAvatar(false)} />
    </Card>
  )
}

function LevelProgress({ profile }: { profile: ProfileResponse }) {
  const percent = Math.round((profile.xpIntoLevel / profile.xpForNextLevel) * 100)
  const remaining = profile.xpForNextLevel - profile.xpIntoLevel

  return (
    <Card padding="lg">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">Level {profile.level}</h2>
        <p className="font-display font-medium text-ink-soft tabular-nums">{formatScore(profile.xp)} XP in total</p>
      </div>
      <div
        role="progressbar"
        aria-label={`Progress to level ${profile.level + 1}`}
        aria-valuemin={0}
        aria-valuemax={profile.xpForNextLevel}
        aria-valuenow={profile.xpIntoLevel}
        className="h-5 overflow-hidden rounded-full bg-surface-muted shadow-[inset_0_2px_3px_rgb(0_0_0/0.08)]"
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        <strong className="text-ink tabular-nums">
          {profile.xpIntoLevel} / {profile.xpForNextLevel} XP
        </strong>{' '}
        · {remaining} XP to level {profile.level + 1} · {percent}%
      </p>
    </Card>
  )
}

interface Stat {
  icon: LucideIcon | null
  label: string
  value: ReactNode
  tone: string
}

/** A number the card game (or any other module) counts, when the server sent it. */
function activity(stats: StatsResponse | undefined, key: string): string {
  const value = stats?.activities.find((entry) => entry.key === key)?.value
  return value === undefined ? '–' : formatScore(value)
}

function Statistics({ profile, stats }: { profile: ProfileResponse; stats: StatsResponse | undefined }) {
  const items: Stat[] = [
    { icon: null, label: 'Coins', value: formatScore(profile.coins), tone: 'bg-amber-100 text-amber-800' },
    { icon: Gamepad2, label: 'Games played', value: formatScore(profile.gamesPlayed), tone: 'bg-brand-100 text-brand-800' },
    {
      icon: Award,
      label: 'Achievements',
      value: `${profile.achievementsUnlocked} / ${profile.achievementsTotal}`,
      tone: 'bg-orange-100 text-orange-800',
    },
    { icon: Layers, label: 'Cards collected', value: activity(stats, 'tcg.cardsCollected'), tone: 'bg-purple-100 text-purple-800' },
    { icon: Package, label: 'Packs opened', value: activity(stats, 'tcg.packsOpened'), tone: 'bg-pink-100 text-pink-800' },
    {
      icon: Clock,
      label: 'Play time',
      value: stats ? formatDuration(stats.playTimeMs) : '–',
      tone: 'bg-sky-100 text-sky-800',
    },
    { icon: Star, label: 'Total score', value: formatScore(profile.totalScore), tone: 'bg-emerald-100 text-emerald-800' },
    {
      icon: PiggyBank,
      label: 'Coins earned',
      value: stats ? formatScore(stats.coinsEarned) : '–',
      tone: 'bg-amber-100 text-amber-800',
    },
  ]

  return (
    <Card padding="lg">
      <h2 className="mb-4 text-xl font-semibold">Statistics</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="rounded-control bg-surface-muted p-3">
            <dt className="flex items-center gap-2 text-sm font-bold text-ink-soft">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', tone)}>
                {Icon ? <Icon aria-hidden className="size-4" /> : <CoinIcon className="size-4 text-[0.55rem]" />}
              </span>
              {label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
