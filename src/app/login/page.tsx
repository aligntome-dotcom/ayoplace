import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/components/auth/LoginForm'
import { getPageSession, sessionWasRejected } from '@/lib/auth/page-session'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const session = await getPageSession()
  if (session.status === 'authenticated' && session.user.role === 'customer') redirect('/account')
  // Only a rejection observed by this server render may clear the stale
  // cookie. Nothing from the URL or the client is consulted.
  const sessionRejected = sessionWasRejected(session)

  return (
    <AuthShell
      title="Sign in"
      intro="Customer accounts only. Event planner access is coming soon."
      footer={
        <p>
          New here?{' '}
          <Link href="/signup" className="font-medium text-neutral-900 underline underline-offset-4">
            Create a customer account
          </Link>
          .
        </p>
      }
    >
      <LoginForm sessionRejected={sessionRejected} />
    </AuthShell>
  )
}
