import 'server-only'

/**
 * Shared shape rules for the Xano auth token, used wherever the token is
 * accepted: before it is written to the session cookie, when it is read back,
 * and before it is put into an Authorization header. One definition, one
 * limit.
 *
 * TOKEN_MAX_LENGTH is 3900 characters. Browsers cap a single Set-Cookie line
 * at 4096 bytes. Next's cookie serializer emits the name plus all attributes
 * (`ayo_session=; Path=/; Expires=<29 chars>; Max-Age=86400; Secure; HttpOnly;
 * SameSite=lax`), which is 106 bytes, leaving 3990 for the value; 3900 keeps a
 * margin under that. The pattern is ASCII-only, so characters equal bytes. A
 * real Xano token is a few hundred characters. `tests/unit/token.spec.ts`
 * serialises a cookie at the limit with Next's own serializer and checks it
 * fits.
 */
export const TOKEN_MAX_LENGTH = 3900

// Characters that can appear in a JWT/JWE or similar opaque bearer token.
// Excludes everything that would break a cookie or header: whitespace,
// control characters, ';', ',', '"', '\' and non-ASCII.
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/

export function isWellFormedToken(token: unknown): token is string {
  return (
    typeof token === 'string' && token.length > 0 && token.length <= TOKEN_MAX_LENGTH && TOKEN_PATTERN.test(token)
  )
}
