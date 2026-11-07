import 'server-only'

/**
 * Request-origin check for state-changing Route Handlers (CSRF defence).
 *
 * The session cookie is SameSite=Lax, which already keeps it off cross-site
 * sub-resource and form POSTs, but Lax still attaches it to top-level
 * navigations and same-site (not same-origin) requests. Every handler that
 * changes state, including one that sets or clears the session cookie, must
 * therefore also confirm that the request came from this application's own
 * origin before doing anything.
 *
 * Rules:
 * - The Origin header, when present, must equal the allowed origin exactly.
 *   A literal "null" Origin is a mismatch.
 * - When Origin is absent, the Referer's origin is used instead. Browsers
 *   always send Origin on cross-origin requests and on same-origin POSTs made
 *   with fetch, XHR or forms, so a missing Origin on a mutating request is
 *   itself suspicious and is rejected when no Referer can vouch for it.
 * - Sec-Fetch-Site is consulted only as an extra veto ("cross-site" fails the
 *   check). It is never sufficient on its own: not every client sends it.
 *
 * The allowed origin is configuration supplied by the caller (Phase 2B-2
 * decides how it is configured); this helper never derives it from request
 * headers such as Host, which an attacker-controlled proxy could set.
 */

export type OriginCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'mismatch' | 'invalid_config' }

function originOf(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Decides whether a request may perform a state change.
 * @param headers  the incoming request headers
 * @param allowedOrigin  this application's origin, e.g. https://www.example.com
 */
export function checkRequestOrigin(headers: Headers, allowedOrigin: string): OriginCheck {
  const allowed = originOf(allowedOrigin)
  if (allowed === null || allowed === 'null') return { ok: false, reason: 'invalid_config' }

  const site = headers.get('sec-fetch-site')
  if (site !== null && site.toLowerCase() === 'cross-site') return { ok: false, reason: 'mismatch' }

  const origin = headers.get('origin')
  if (origin !== null) {
    return originOf(origin) === allowed ? { ok: true } : { ok: false, reason: 'mismatch' }
  }

  const referer = originOf(headers.get('referer'))
  if (referer === null) return { ok: false, reason: 'missing' }
  return referer === allowed ? { ok: true } : { ok: false, reason: 'mismatch' }
}
