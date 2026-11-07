import 'server-only'

/**
 * Shared shape rules for the Xano auth token, used wherever the token is
 * accepted: before it is written to the session cookie and before it is put
 * into an Authorization header. One definition, one limit.
 *
 * TOKEN_MAX_LENGTH is 4000 characters. Browsers cap a single cookie at
 * 4096 bytes including its name and attributes (about 90 bytes here), so 4000
 * leaves headroom while being far above the length of a Xano token (a few
 * hundred characters). A token that would not fit in the cookie must not be
 * accepted anywhere, so the header path uses the same bound.
 */
export const TOKEN_MAX_LENGTH = 4000

// Characters that can appear in a JWT/JWE or similar opaque bearer token.
// Excludes everything that would break a cookie or header: whitespace,
// control characters, ';', ',', '"', '\' and non-ASCII.
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/

export function isWellFormedToken(token: unknown): token is string {
  return (
    typeof token === 'string' && token.length > 0 && token.length <= TOKEN_MAX_LENGTH && TOKEN_PATTERN.test(token)
  )
}
