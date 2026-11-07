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
 * Accepts only an HTTPS origin with a dotted hostname and nothing else: no
 * credentials, port, path, query or fragment. API group paths are configured
 * in code (see src/lib/xano/groups.ts), never in this variable.
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
  if (url.username || url.password) reject('must not contain credentials')
  if (url.port) reject('must not specify a port')
  if (url.pathname !== '/') reject('must be the instance origin only, with no path')
  if (url.search) reject('must not contain a query string')
  if (url.hash) reject('must not contain a fragment')

  return url
}

/** Returns the validated Xano origin from the environment (server only). */
export function getXanoBaseUrl(env: EnvSource = process.env): URL {
  return parseXanoBaseUrl(env[XANO_BASE_URL_VAR])
}
