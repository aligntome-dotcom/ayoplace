import { test, expect } from '@playwright/test'
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies/index.js'
import { isWellFormedToken, TOKEN_MAX_LENGTH } from '../../src/lib/auth/token'
import { isValidSessionToken, SESSION_COOKIE_NAME, sessionCookieAttributes } from '../../src/lib/auth/cookies'
import { buildXanoHeaders } from '../../src/lib/xano/client'

test.describe('shared token limit', () => {
  test('is 3900 and documented in one place', () => {
    expect(TOKEN_MAX_LENGTH).toBe(3900)
  })

  test('boundary: below, at and above the limit behave identically everywhere the token is accepted', () => {
    for (const [n, ok] of [
      [3899, true],
      [3900, true],
      [3901, false],
      [4000, false],
      [4096, false],
    ] as const) {
      const token = 'a'.repeat(n)
      expect(isWellFormedToken(token), `token.ts ${n}`).toBe(ok)
      expect(isValidSessionToken(token), `cookies.ts ${n}`).toBe(ok)
      if (ok) expect(buildXanoHeaders({ token, hasBody: false }).Authorization).toBe(`Bearer ${token}`)
      else expect(() => buildXanoHeaders({ token, hasBody: false }), `client.ts ${n}`).toThrow(/malformed/)
    }
  })

  test('a cookie at the limit fits a 4096-byte Set-Cookie line with Next’s own serializer', () => {
    const jar = new ResponseCookies(new Headers())
    jar.set(SESSION_COOKIE_NAME, 'a'.repeat(TOKEN_MAX_LENGTH), sessionCookieAttributes({ NODE_ENV: 'production' }))
    const line = jar.toString()
    expect(line.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true)
    expect(line).toMatch(/Max-Age=86400/)
    expect(line).toMatch(/HttpOnly/)
    expect(line).toMatch(/Secure/)
    expect(line).toMatch(/SameSite=lax/i)
    expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(4096)
    // Attributes overhead is what the limit was derived from.
    expect(Buffer.byteLength(line, 'utf8') - TOKEN_MAX_LENGTH).toBeLessThanOrEqual(196)
  })

  test('characters equal bytes: non-ASCII is never accepted', () => {
    for (const bad of ['é', 'aé', 'Ａ', '\u{1f600}', 'a b', 'a;b', '', 'a\n']) {
      expect(isWellFormedToken(bad), JSON.stringify(bad)).toBe(false)
    }
  })
})
