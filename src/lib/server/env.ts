import 'server-only'

/**
 * Server-side environment configuration.
 *
 * Values are read lazily (never at import time) so that the production build
 * and static prerendering do not depend on secrets being present, and so a
 * misconfiguration surfaces as one clear ConfigError at the point of use.
 */

export const XANO_BASE_URL_VAR = 'XANO_BASE_URL'

/** A read-only view of environment variables; `process.env` satisfies it. */
export type EnvSource = Readonly<Record<string, string | undefined>>

const EXPECTED_FORMAT = 'https://<instance-subdomain>.<cluster>.xano.io'

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

/**
 * Parses and validates the Xano instance origin.
 *
 * Accepts only an HTTPS origin with a dotted DNS hostname and nothing else: no
 * credentials, port, path, query or fragment, no IP literal, no trailing dot,
 * and no control characters anywhere in the raw value (the URL parser would
 * silently strip those). API group paths are configured in code (see
 * src/lib/xano/groups.ts), never in this variable.
 *
 * The hostname is not pinned to a `.xano.io` suffix on purpose: Xano serves
 * instances under customer-owned custom domains as well, and nothing in this
 * project rules that out. The value is operator-controlled configuration;
 * the checks here catch mistakes, not attackers.
 *
 * The raw value is deliberately not echoed in error messages.
 */
export function parseXanoBaseUrl(raw: string | undefined): URL {
  if (raw === undefined || raw.trim() === '') {
    throw new ConfigError(
      `${XANO_BASE_URL_VAR} is not set. Add it to .env.local for local development and to the ` +
        `Vercel project's server-side environment variables. Expected format: ${EXPECTED_FORMAT}`,
    )
  }

  const value = raw.trim()
  // Printable ASCII only. Rejects whitespace, C0/DEL controls and every
  // non-ASCII character, including invisible ones (zero-width space, soft
  // hyphen, bidi marks) that the URL parser would otherwise strip silently.
  // Internationalised hostnames must be supplied as punycode (xn--).
  if (/[^!-~]/.test(value)) {
    throw new ConfigError(
      `${XANO_BASE_URL_VAR} contains whitespace, non-ASCII or control characters. Expected format: ${EXPECTED_FORMAT}`,
    )
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError(`${XANO_BASE_URL_VAR} is not a valid URL. Expected format: ${EXPECTED_FORMAT}`)
  }

  const reject = (why: string): never => {
    throw new ConfigError(`${XANO_BASE_URL_VAR} ${why}. Expected format: ${EXPECTED_FORMAT}`)
  }

  if (url.protocol !== 'https:') reject('must use https')
  if (!url.hostname || !url.hostname.includes('.')) reject('must be a fully qualified hostname')
  if (url.hostname.endsWith('.')) reject('must not end with a dot')
  if (url.hostname.startsWith('[') || /^\d+(\.\d+)*$/.test(url.hostname)) reject('must be a DNS hostname, not an IP address')
  if (!isDnsHostname(url.hostname)) reject('must be a plain DNS hostname')
  if (url.username || url.password) reject('must not contain credentials')
  if (url.port) reject('must not specify a port')
  if (url.pathname !== '/') reject('must be the instance origin only, with no path')
  if (url.search) reject('must not contain a query string')
  if (url.hash) reject('must not contain a fragment')

  return url
}

/**
 * DNS hostname rules (RFC 1123 LDH): two or more labels, each 1–63 characters
 * of [a-z0-9-] that neither start nor end with '-', 253 characters in total.
 * Custom domains are fine; nothing pins the suffix.
 */
export function isDnsHostname(hostname: string): boolean {
  if (hostname.length > 253) return false
  const labels = hostname.split('.')
  if (labels.length < 2) return false
  return labels.every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

/** Returns the validated Xano origin from the environment (server only). */
export function getXanoBaseUrl(env: EnvSource = process.env): URL {
  return parseXanoBaseUrl(env[XANO_BASE_URL_VAR])
}

export const APP_ORIGIN_VAR = 'APP_ORIGIN'

/**
 * This application's own origin, used to validate the Origin of state-changing
 * requests. Trusted configuration only: never derived from Host or
 * X-Forwarded-Host. https is required except for localhost during local
 * development. Returns the normalised origin string, e.g.
 * https://www.theayoplace.com or http://localhost:3000.
 */
export function parseAppOrigin(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    throw new ConfigError(
      `${APP_ORIGIN_VAR} is not set. Set it to this site's own origin (for example https://www.example.com, ` +
        `or http://localhost:3000 for local development) in .env.local and in the Vercel environment.`,
    )
  }
  const value = raw.trim()
  if (/[^!-~]/.test(value)) {
    throw new ConfigError(`${APP_ORIGIN_VAR} contains whitespace, non-ASCII or control characters.`)
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError(`${APP_ORIGIN_VAR} is not a valid URL.`)
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new ConfigError(`${APP_ORIGIN_VAR} must use https (http is allowed for localhost only).`)
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ConfigError(`${APP_ORIGIN_VAR} must be an origin only: scheme, host and optional port.`)
  }
  if (!local && (url.hostname.startsWith('[') || /^\d+(\.\d+)*$/.test(url.hostname) || !isDnsHostname(url.hostname))) {
    throw new ConfigError(`${APP_ORIGIN_VAR} must use a plain DNS hostname.`)
  }
  return url.origin
}

export function getAppOrigin(env: EnvSource = process.env): string {
  return parseAppOrigin(env[APP_ORIGIN_VAR])
}
