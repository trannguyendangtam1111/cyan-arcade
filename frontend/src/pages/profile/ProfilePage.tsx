import { UserRound } from 'lucide-react'
import { useSession } from '@/api/auth'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { GuestProfile } from './GuestProfile'
import { PlayerProfile } from './PlayerProfile'

/** The signed-in player's profile, or an invitation to sign in. */
export function ProfilePage() {
  useDocumentTitle('Profile')
  const { user, isPending, isError, refetch } = useSession()

  return (
    <>
      <PageHeader icon={UserRound} title="Profile" description="Your level, scores and trophies in one place." />
      {isPending && <LoadingState label="Loading your profile…" />}
      {isError && <ErrorState title="Couldn't load your profile" onRetry={() => void refetch()} />}
      {user === null && <GuestProfile />}
      {user && <PlayerProfile />}
    </>
  )
}
