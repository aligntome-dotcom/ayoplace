'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { postJson } from './api'
import { buttonClass, Field, FormError } from './fields'

/**
 * `sessionRejected` is set by the server-rendered login page only when its
 * own verification saw Xano reject the existing cookie. It is never derived
 * from the URL, so a link cannot make this form sign anyone out.
 */
export function LoginForm({ sessionRejected = false }: { sessionRejected?: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const inFlight = useRef(false)

  // A session the server rejected leaves a stale cookie behind. Clear it
  // through the logout handler (a POST, with the Origin check), never via GET.
  useEffect(() => {
    if (sessionRejected) void postJson('/api/auth/logout', {})
  }, [sessionRejected])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const errors: typeof fieldErrors = {}
    if (!email.trim() || !email.includes('@')) errors.email = 'Enter the email address you registered with.'
    if (password.length < 8) errors.password = 'Enter your password (at least 8 characters).'
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length) return

    inFlight.current = true
    setSubmitting(true)
    const result = await postJson('/api/auth/login', { email: email.trim(), password })
    if (result.ok) {
      setDone(true)
      router.replace('/account')
      router.refresh()
      return
    }
    inFlight.current = false
    setSubmitting(false)
    setFormError(result.error?.message ?? 'Sign-in failed. Please try again.')
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting} aria-describedby="login-error" className="space-y-5">
      {sessionRejected ? (
        <p className="rounded-md border border-[#d8b98a] bg-[#f4ecdd] px-3 py-2 text-sm text-neutral-800">
          Your session has ended. Please sign in again.
        </p>
      ) : null}
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        disabled={submitting || done}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        disabled={submitting || done}
      />
      <FormError id="login-error" message={formError} />
      <button type="submit" className={buttonClass} disabled={submitting || done}>
        {done ? 'Signed in. Taking you to your account…' : submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
