import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/components/auth/LoginForm'
import { getPageSession } from '@/lib/auth/page-session'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getPageSession()
  if (session.status === 'authenticated' && session.user.role === 'customer') redirect('/account')
  const { reason } = await searchParams

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
      <LoginForm expired={reason === 'expired'} />
    </AuthShell>
  )
}
