// Browser-side helper for the auth Route Handlers. Same-origin only; the
// session cookie is HTTP-only and is never read or written here.

export interface ApiError {
  code: string
  message: string
}

export interface PostResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: ApiError | null
}

const FALLBACK: ApiError = { code: 'request_failed', message: 'Something went wrong. Please try again.' }

export async function postJson<T = unknown>(path: string, body: unknown): Promise<PostResult<T>> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const error =
      record.error && typeof record.error === 'object'
        ? (record.error as ApiError)
        : response.ok
          ? null
          : FALLBACK
    return { ok: response.ok, status: response.status, data: response.ok ? (payload as T) : null, error }
  } catch {
    return { ok: false, status: 0, data: null, error: { code: 'network', message: 'Could not reach the server. Check your connection and try again.' } }
  }
}
