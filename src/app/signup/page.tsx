import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { SignupForm } from '@/components/auth/SignupForm'
import { getPageSession } from '@/lib/auth/page-session'

export const dynamic = 'force-dynamic'

export default async function SignupPage() {
  const session = await getPageSession()
  if (session.status === 'authenticated' && session.user.role === 'customer') redirect('/account')

  return (
    <AuthShell
      title="Create your account"
      intro="For customers planning an event at The Ayo Place."
      footer={
        <p>
          Already registered?{' '}
          <Link href="/login" className="font-medium text-neutral-900 underline underline-offset-4">
            Sign in
          </Link>
          .
        </p>
      }
    >
      <SignupForm />

      <aside className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-white/60 p-5" aria-labelledby="planner-title">
        <h2 id="planner-title" className="text-base font-semibold text-neutral-900">
          Event planners
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Planner accounts are not open for registration yet.
        </p>
        <p className="mt-3 inline-flex items-center rounded-md bg-[#f4ecdd] px-3 py-2 text-sm font-medium text-neutral-800">
          Registration opens soon
        </p>
      </aside>
    </AuthShell>
  )
}
