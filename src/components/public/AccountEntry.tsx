import Link from 'next/link'

const linkClass =
  'inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8945f]'

// The account-entry section that follows the full hero scroll. It carries
// id="book" because the hero's call to action links here. Customers can
// register or sign in; event planner registration is not available yet and
// says so, without any form behind it.
export function AccountEntry() {
  return (
    <section id="book" aria-labelledby="account-entry-title" className="min-h-screen bg-[var(--ayo-paper)] px-6 py-24 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">Get started</p>
        <h2 id="account-entry-title" className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Plan your celebration with us.
        </h2>
        <p className="mt-4 max-w-xl text-neutral-600">
          Create a customer account to enquire about dates, request quotes and keep every detail of your event in one place.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <article className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-neutral-900">Customers</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Booking a wedding, a birthday or a gathering at The Ayo Place.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={`${linkClass} bg-neutral-900 text-white hover:bg-neutral-800`}>
                Create an account
              </Link>
              <Link href="/login" className={`${linkClass} border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`}>
                Sign in
              </Link>
            </div>
          </article>

          <article className="rounded-xl border border-dashed border-neutral-300 bg-white/60 p-6">
            <h3 className="text-lg font-semibold text-neutral-900">Event planners</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Working with clients who celebrate here and want a planner on their side.
            </p>
            <p className="mt-6 inline-flex items-center rounded-md bg-[#f4ecdd] px-3 py-2 text-sm font-medium text-neutral-800" aria-live="off">
              Registration opens soon
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}
