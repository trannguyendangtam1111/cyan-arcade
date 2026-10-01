import { Award, History, TrendingUp, UserRound, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'

const perks: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: TrendingUp, title: 'Level up', text: 'Every game you finish earns XP towards your next level.' },
  { icon: Award, title: 'Unlock achievements', text: 'Hit milestones in each game and collect the trophies.' },
  { icon: History, title: 'Keep your history', text: 'See every game you have played and your best scores.' },
]

/** What someone who is not signed in sees on the profile page. */
export function GuestProfile() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <Card padding="lg" className="flex flex-col items-center text-center">
        <span className="mb-4 grid size-24 place-items-center rounded-full bg-brand-100 text-brand-600 shadow-soft ring-4 ring-surface">
          <UserRound aria-hidden className="size-12" strokeWidth={1.75} />
        </span>
        <h2 className="text-2xl font-semibold">Guest player</h2>
        <Badge tone="neutral" className="mt-2">
          Not signed in
        </Badge>
        <p className="mt-4 text-ink-soft">You can play everything as a guest. An account makes it count.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/register" className={buttonStyles('primary')}>
            Create account
          </Link>
          <Link to="/login" className={buttonStyles('secondary')}>
            Log in
          </Link>
        </div>
      </Card>

      <Card padding="lg">
        <h2 className="mb-4 text-xl font-semibold">With an account you can</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {perks.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-control bg-surface-muted p-4">
              <Icon aria-hidden className="mb-2 size-6 text-brand-600" />
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{text}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
