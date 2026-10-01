import { LogIn } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cardStyles } from '@/components/ui/cardStyles'
import { tcgButton } from './tcgButton'

/**
 * Shown to a guest wherever cards belong to someone: opening packs, the collection, the history.
 * Signing in from here comes straight back to the same page.
 */
export function SignInPrompt({ title, children }: { title: string; children: string }) {
  const { pathname, search } = useLocation()
  const back = `?redirect=${encodeURIComponent(pathname + search)}`

  return (
    <div className={cardStyles('lg', 'mx-auto flex max-w-xl flex-col items-center gap-4 text-center')}>
      <span className="grid size-14 place-items-center rounded-2xl bg-purple-100 text-purple-700">
        <LogIn aria-hidden className="size-7" />
      </span>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-ink-soft">{children}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to={`/login${back}`} className={tcgButton()}>
          Log in
        </Link>
        <Link to={`/register${back}`} className={buttonStyles('secondary')}>
          Create account
        </Link>
      </div>
    </div>
  )
}
