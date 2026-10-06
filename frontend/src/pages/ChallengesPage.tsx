import { Gift, LogIn, Target } from 'lucide-react'
import { Link } from 'react-router'
import { useSession } from '@/api/auth'
import { DailyChallenges } from '@/components/DailyChallenges'
import { DailyLogin } from '@/components/DailyLogin'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles } from '@/components/ui/cardStyles'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { accentStyle } from '@/lib/accent'

/**
 * Everything that comes back every day: the daily login reward and today's challenges. Both are
 * the server's: it decides the day, checks what was done, and pays the rewards.
 */
export function ChallengesPage() {
  useDocumentTitle('Challenges')
  const { user, isPending } = useSession()

  return (
    <div style={accentStyle('#f97316')}>
      <PageHeader
        icon={Target}
        title="Challenges"
        description="A fresh set every day. Finish them for XP and coins, and come back daily for a growing reward."
      />
      <div className="flex flex-col gap-section">
        {user && <DailyLogin />}
        {!user && !isPending && (
          <section
            aria-label="Daily reward"
            className={cardStyles('md', 'flex flex-wrap items-center justify-between gap-4 bg-linear-to-br from-amber-50 to-surface')}
          >
            <p className="flex items-center gap-3 text-ink-soft">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-400 text-amber-950">
                <Gift aria-hidden className="size-5.5" />
              </span>
              <span>
                <strong className="text-ink">A reward every day.</strong> Log in daily for coins, more for every day in a row.
              </span>
            </p>
            <Link to="/login?redirect=%2Fchallenges" className={buttonStyles('primary')}>
              <LogIn aria-hidden className="size-4" />
              Log in
            </Link>
          </section>
        )}
        <DailyChallenges />
      </div>
    </div>
  )
}
