'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { postJson } from './api'
import { buttonClass, Field, FormError } from './fields'

type Errors = { name?: string; email?: string; password?: string; confirm?: string }

// Customer registration only. The backend assigns the role; this form never
// sends one.
export function SignupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const inFlight = useRef(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const errors: Errors = {}
    if (!name.trim()) errors.name = 'Enter your name.'
    if (!email.trim() || !email.includes('@')) errors.email = 'Enter a valid email address.'
    if (password.length < 8) errors.password = 'Use at least 8 characters.'
    if (confirm !== password) errors.confirm = 'Passwords do not match.'
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length) return

    inFlight.current = true
    setSubmitting(true)
    const result = await postJson('/api/auth/signup', { name: name.trim(), email: email.trim(), password })
    if (result.ok) {
      setDone(true)
      router.replace('/account')
      router.refresh()
      return
    }
    inFlight.current = false
    setSubmitting(false)
    setFormError(result.error?.message ?? 'Registration failed. Please try again.')
  }

  const busy = submitting || done
  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting} aria-describedby="signup-error" className="space-y-5">
      <Field id="name" label="Full name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} disabled={busy} />
      <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} disabled={busy} />
      <Field id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} disabled={busy} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fieldErrors.confirm} disabled={busy} />
      <FormError id="signup-error" message={formError} />
      <button type="submit" className={buttonClass} disabled={busy}>
        {done ? 'Account created. Taking you to your account…' : submitting ? 'Creating your account…' : 'Create customer account'}
      </button>
    </form>
  )
}
