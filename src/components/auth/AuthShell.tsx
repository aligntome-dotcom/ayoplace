import Link from 'next/link'
import type { ReactNode } from 'react'

// Shared frame for the public account pages: same paper background and type
// scale as the section below the hero, nothing more.
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string
  intro?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="min-h-screen bg-[var(--ayo-paper)] px-6 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">
          <Link href="/" className="hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8945f]">
            The Ayo Place
          </Link>
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">{title}</h1>
        {intro ? <p className="mt-3 text-neutral-600">{intro}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-8 text-sm text-neutral-600">{footer}</div> : null}
      </div>
    </main>
  )
}
