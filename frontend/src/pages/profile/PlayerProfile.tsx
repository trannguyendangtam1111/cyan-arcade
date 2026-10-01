import { Award, Gamepad2, LogOut, Pencil, Star, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useLogout } from '@/api/auth'
import { useProfile, type ProfileResponse } from '@/api/profile'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { formatDate, formatScore } from '@/lib/format'
import { AchievementGrid } from './AchievementGrid'
import { AvatarPicker } from './AvatarPicker'
import { RecentGames } from './RecentGames'

/** The profile of the signed-in player. */
export function PlayerProfile() {
  const { data: profile, isPending, isError, refetch } = useProfile(true)

  if (isPending) return <LoadingState label="Loading your profile…" />
  if (isError) return <ErrorState title="Couldn't load your profile" onRetry={() => void refetch()} />

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <ProfileHeader profile={profile} />
        <div className="flex flex-col gap-5">
          <LevelProgress profile={profile} />
          <Statistics profile={profile} />
        </div>
      </div>
      <RecentGames />
      <AchievementGrid />
    </div>
  )
}

function ProfileHeader({ profile }: { profile: ProfileResponse }) {
  const [choosingAvatar, setChoosingAvatar] = useState(false)
  const logout = useLogout()

  return (
    <Card padding="lg" className="flex flex-col items-center text-center">
      <div className="relative mb-4">
        <Avatar avatar={profile.avatar} size="lg" />
        <button
          type="button"
          onClick={() => setChoosingAvatar(true)}
          aria-label="Change avatar"
          className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full bg-surface text-ink shadow-soft ring-2 ring-line transition-colors hover:bg-brand-50"
        >
          <Pencil aria-hidden className="size-4" />
        </button>
      </div>
      <h2 className="text-2xl font-semibold break-all">{profile.username}</h2>
      <Badge tone="brand" className="mt-2 px-3 py-1 text-sm">
        Level {profile.level}
      </Badge>
      <p className="mt-3 text-sm text-ink-soft">Playing since {formatDate(profile.memberSince)}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-5"
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
        · {remaining} XP to level {profile.level + 1}
      </p>
    </Card>
  )
}

function Statistics({ profile }: { profile: ProfileResponse }) {
  const stats: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Gamepad2, label: 'Games played', value: formatScore(profile.gamesPlayed) },
    { icon: Star, label: 'Total score', value: formatScore(profile.totalScore) },
    {
      icon: Award,
      label: 'Achievements',
      value: `${profile.achievementsUnlocked} / ${profile.achievementsTotal}`,
    },
  ]

  return (
    <Card padding="lg">
      <h2 className="mb-4 text-xl font-semibold">Statistics</h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-control bg-surface-muted p-4">
            <dt className="flex items-center gap-2 text-sm font-bold text-ink-soft">
              <Icon aria-hidden className="size-4" />
              {label}
            </dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
