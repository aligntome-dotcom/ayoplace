import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { getPageSession } from '@/lib/auth/page-session'

export const dynamic = 'force-dynamic'

// Customer account page. Everything shown comes from Xano's current-user
// response for this request; nothing is cached or invented.
export default async function AccountPage() {
  const session = await getPageSession()

  if (session.status === 'anonymous') redirect('/login')
  // The login page re-verifies the cookie itself and, if Xano rejects it
  // again, clears it through the POST logout handler. No flag is passed.
  if (session.status === 'rejected') redirect('/login')
  if (session.status === 'unavailable') {
    return (
      <AuthShell title="Your account" intro="We could not confirm your session right now.">
        <p role="status" className="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          The service is temporarily unavailable. Please try again in a moment.
        </p>
      </AuthShell>
    )
  }
  if (session.user.role !== 'customer') redirect('/login')

  const { user } = session
  return (
    <AuthShell title={user.name ? `Welcome, ${user.name}` : 'Your account'} intro="You are signed in as a customer.">
      <dl className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white text-sm">
        {user.name ? (
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-neutral-500">Name</dt>
            <dd className="text-right text-neutral-900">{user.name}</dd>
          </div>
        ) : null}
        {user.email ? (
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-neutral-500">Email</dt>
            <dd className="text-right text-neutral-900">{user.email}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-neutral-500">Account type</dt>
          <dd className="text-right text-neutral-900">Customer</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-neutral-600">
        Enquiries, quotes and bookings will appear here as those features open.
      </p>
      <div className="mt-8">
        <LogoutButton />
      </div>
    </AuthShell>
  )
}
