'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postJson } from './api'

// Ends the browser session by asking the logout handler to clear the cookie.
// The Xano token is not revoked by this (no such endpoint exists).
export function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function onClick() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    const result = await postJson('/api/auth/logout', {})
    if (result.ok) {
      router.replace('/login')
      router.refresh()
      return
    }
    inFlight.current = false
    setBusy(false)
    setError(result.error?.message ?? 'Could not sign out. Please try again.')
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8945f] disabled:opacity-60"
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      <p role="alert" aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm text-red-700">
        {error}
      </p>
    </div>
  )
}
