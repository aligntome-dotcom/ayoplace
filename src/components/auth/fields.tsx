'use client'

import type { InputHTMLAttributes } from 'react'

export const inputClass =
  'mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-[#b8945f] focus:outline-none focus:ring-2 focus:ring-[#d8b98a] aria-[invalid=true]:border-red-600'

export const buttonClass =
  'inline-flex w-full items-center justify-center rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8945f] disabled:cursor-not-allowed disabled:opacity-60'

export function Field({
  id,
  label,
  error,
  ...input
}: { id: string; label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function FormError({ id, message }: { id: string; message: string | null }) {
  // Always rendered so screen readers pick up changes (aria-live region).
  return (
    <div id={id} role="alert" aria-live="assertive" className="min-h-[1.5rem] text-sm text-red-700">
      {message}
    </div>
  )
}
