import { test, expect } from '@playwright/test'
import { buildXanoUrl, XanoError, xanoFetch, type XanoResult } from '../../src/lib/xano/client'
import { XANO_API_GROUPS } from '../../src/lib/xano/groups'
import { isWellFormedToken, TOKEN_MAX_LENGTH } from '../../src/lib/auth/token'
import { isValidSessionToken, SESSION_COOKIE_NAME, type SessionCookieStore } from '../../src/lib/auth/cookies'
import { verifySession, type CurrentUserFetcher } from '../../src/lib/auth/session'
import { parseXanoBaseUrl, ConfigError } from '../../src/lib/server/env'

// Regression tests for the Phase 2B-1 audit findings (hardening commit).

const ORIGIN = 'https://abc-123.eu-west-1.xano.io'
const BASE = new URL(ORIGIN)
const ENV = { XANO_BASE_URL: ORIGIN }
const GROUP = XANO_API_GROUPS.authentication
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl'

// ---------------------------------------------------------------------------
// 1. Encoded path traversal
// ---------------------------------------------------------------------------
test.describe('API group containment', () => {
  const escapes = [
    '/../x',
    '/a/../../x',
    '/%2e%2e/x',
    '/%2E%2E/x',
    '/%2e%2E/x',
    '/.%2e/x',
    '/%2e./x',
    '/a/%2e%2e/%2e%2e/%2e%2e/x',
    '/%2e%2e%2fx',
    '/a%2fb',
    '/a%2Fb',
    '/a%5cb',
    '/a\\b',
    '/\\..\\x',
    '/a\u0000b',
    '/a\u007fb',
    '/a\u001fb',
    '/%2e/x',
    '/x?y=1',
    '/x#y',
    '//evil.example/x',
    'https://evil.example/x',
    'auth/login',
    '/café',
    // Percent-encoded controls, double encodings and overlong sequences that
    // a downstream decoder could turn back into separators or controls.
    '/a%00b',
    '/a%0ab',
    '/a%0d%0ab',
    '/a%1fb',
    '/a%7fb',
    '/%252e%252e/x',
    '/%252E%252E/x',
    '/%25252e/x',
    '/%C0%AE%C0%AE/x',
    '/%c0%afx',
    '/%E2%80%AE',
    '/a%20b',
    '/a%25b',
    '/x%',
    '/x%zz',
    '/a;b',
    '/a@b',
    '/a:b',
    '/api:other/x',
    '/a//b',
    '/x/',
    '/',
  ]
  for (const path of escapes) {
    test(`rejects ${JSON.stringify(path)}`, () => {
      expect(() => buildXanoUrl(BASE, 'authentication', path)).toThrow()
    })
  }

  test('post-condition: every accepted path stays on the origin and inside the group', () => {
    const valid = [
      '/auth/login',
      '/auth/me',
      '/auth/signup',
      '/reset/request-reset-link',
      '/customers/me',
      '/a/b/c-d_e.json',
      '/a~b',
      '/items/42',
      '/x.y.z',
      '/v2/events/2026-11-07/guests',
    ]
    for (const path of valid) {
      const url = buildXanoUrl(BASE, 'authentication', path, { q: 'x/../../y' })
      expect(url.origin, path).toBe(ORIGIN)
      expect(url.pathname.startsWith(`${GROUP}/`), path).toBe(true)
      expect(url.pathname, path).toBe(`${GROUP}${path}`)
      expect(url.searchParams.get('q')).toBe('x/../../y')
      expect(url.pathname.includes('..')).toBe(false)
    }
  })

  test('the parser alone would have escaped the group (documents why the post-condition exists)', () => {
    // Without the checks, WHATWG normalisation strips the group prefix.
    expect(new URL(`${GROUP}/%2e%2e/x`, ORIGIN).pathname).toBe('/x')
    expect(() => buildXanoUrl(BASE, 'authentication', '/%2e%2e/x')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 2. Error serialisation
// ---------------------------------------------------------------------------
test.describe('XanoError serialisation', () => {
  const err = new XanoError('http', 'Xano responded with HTTP 401', {
    status: 401,
    backendMessage: 'BACKEND-SECRET-TEXT',
    cause: new Error('undici detail https://internal.example'),
  })

  test('JSON.stringify yields only the safe shape', () => {
    expect(JSON.parse(JSON.stringify(err))).toEqual(err.toSafe())
    expect(JSON.stringify(err)).not.toContain('BACKEND-SECRET-TEXT')
    expect(JSON.stringify(err)).not.toContain('401')
    expect(JSON.stringify(err)).not.toContain('internal.example')
    expect(JSON.stringify(err)).not.toContain('http')
  })

  test('a result carrying the error serialises safely too', () => {
    const result: XanoResult<never> = { ok: false, error: err }
    const text = JSON.stringify(result)
    expect(JSON.parse(text)).toEqual({ ok: false, error: { code: 'unauthorized', message: err.toSafe().message } })
    expect(text).not.toContain('BACKEND-SECRET-TEXT')
    expect(text).not.toContain('backendMessage')
    expect(text).not.toContain('status')
  })

  test('internal fields are not enumerable and do not spread', () => {
    expect(Object.keys(err)).toEqual([])
    expect({ ...err }).toEqual({})
    expect(JSON.stringify(Object.entries(err))).toBe('[]')
  })

  test('toJSON and toSafe agree and stay generic', () => {
    expect(err.toJSON()).toEqual(err.toSafe())
    expect(err.toSafe()).toEqual({ code: 'unauthorized', message: 'Your session is not valid. Please sign in again.' })
    for (const text of [err.message, String(err), err.toString()]) {
      expect(text).not.toContain('BACKEND-SECRET-TEXT')
    }
  })

  test('trusted server code can still read the internals', () => {
    expect(err.kind).toBe('http')
    expect(err.status).toBe(401)
    expect(err.backendMessage).toBe('BACKEND-SECRET-TEXT')
    expect(err.name).toBe('XanoError')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(XanoError)
    expect((err.cause as Error).message).toContain('undici detail')
    expect(err.message).toBe('Xano responded with HTTP 401')
  })

  test('network and timeout errors serialise safely as well', () => {
    const net = new XanoError('network', 'Xano could not be reached', { cause: new Error('ECONNREFUSED 10.0.0.1') })
    expect(JSON.parse(JSON.stringify(net))).toEqual({
      code: 'backend_unavailable',
      message: 'The service is temporarily unavailable. Please try again shortly.',
    })
    expect(JSON.stringify(net)).not.toContain('10.0.0.1')
  })
})

// ---------------------------------------------------------------------------
// 3. Timeout covers the body
// ---------------------------------------------------------------------------
test.describe('timeout through body consumption', () => {
  // A fetch that answers headers at once but whose body never ends until the
  // abort signal fires, as undici behaves when the connection stalls.
  function stalledBodyFetch() {
    let calls = 0
    const f = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"partial":'))
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          })
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    return { fetch: f, calls: () => calls }
  }

  test('a stalled body is a timeout, reported once, and the timer is cleaned up', async () => {
    const original = globalThis.clearTimeout
    let cleared = 0
    globalThis.clearTimeout = ((t: Parameters<typeof clearTimeout>[0]) => {
      cleared += 1
      return original(t)
    }) as typeof clearTimeout
    try {
      const stalled = stalledBodyFetch()
      const started = Date.now()
      const result = await xanoFetch(
        { group: 'authentication', path: '/auth/me', token: TOKEN, timeoutMs: 80 },
        { fetch: stalled.fetch, env: ENV },
      )
      const elapsed = Date.now() - started
      expect(elapsed).toBeGreaterThanOrEqual(60)
      expect(elapsed).toBeLessThan(5_000)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe('timeout')
        expect(result.error.toSafe().code).toBe('backend_unavailable')
        expect(result.error.toSafe().code).not.toBe('backend_error')
        expect(result.error.message).not.toContain(TOKEN)
        expect(JSON.stringify(result)).not.toContain('abort')
      }
      expect(stalled.calls()).toBe(1)
      expect(cleared).toBeGreaterThanOrEqual(1)
    } finally {
      globalThis.clearTimeout = original
    }
  })

  test('a body that fails for a non-abort reason is a network error, not a timeout', async () => {
    const f = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error('socket hang up'))
          },
        }),
        { status: 200 },
      )) as typeof fetch
    const result = await xanoFetch({ group: 'authentication', path: '/auth/me', timeoutMs: 1_000 }, { fetch: f, env: ENV })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('network')
      expect(JSON.stringify(result)).not.toContain('socket')
    }
  })
})

// ---------------------------------------------------------------------------
// 4. verifySession response shape
// ---------------------------------------------------------------------------
test.describe('verifySession response shape', () => {
  const store = (value?: string): SessionCookieStore => ({
    get: (name) => (value !== undefined && name === SESSION_COOKIE_NAME ? { value } : undefined),
    set: () => undefined,
  })
  const fetcher = (result: XanoResult<unknown>): CurrentUserFetcher => async () => result
  const okWith = (data: unknown): XanoResult<unknown> => ({ ok: true, status: 200, data })

  test('a non-empty object is authenticated', async () => {
    const user = { id: 14, role: 'customer', is_active: true }
    expect(await verifySession(fetcher(okWith(user)), store(TOKEN))).toEqual({ status: 'authenticated', user })
  })

  const notUsers: Array<[string, unknown]> = [
    ['null (empty body or 204)', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['array', [{ id: 14 }]],
    ['empty array', []],
    ['string', 'ok'],
    ['empty string', ''],
    ['number', 14],
    ['zero', 0],
    ['boolean', true],
  ]
  for (const [label, data] of notUsers) {
    test(`2xx with ${label} is not authenticated`, async () => {
      const state = await verifySession(fetcher(okWith(data)), store(TOKEN))
      expect(state.status).toBe('unavailable')
      expect(JSON.stringify(state)).not.toContain(TOKEN)
    })
  }

  test('malformed JSON (invalid_response) is unavailable', async () => {
    const error = new XanoError('invalid_response', 'Xano returned a non-JSON body with HTTP 200')
    expect(await verifySession(fetcher({ ok: false, error }), store(TOKEN))).toEqual({ status: 'unavailable' })
  })

  test('non-2xx: 401/403 rejected, others unavailable', async () => {
    const http = (status: number) => new XanoError('http', `HTTP ${status}`, { status })
    expect(await verifySession(fetcher({ ok: false, error: http(401) }), store(TOKEN))).toEqual({ status: 'rejected' })
    expect(await verifySession(fetcher({ ok: false, error: http(403) }), store(TOKEN))).toEqual({ status: 'rejected' })
    for (const s of [302, 400, 404, 500]) {
      expect(await verifySession(fetcher({ ok: false, error: http(s) }), store(TOKEN)), String(s)).toEqual({ status: 'unavailable' })
    }
  })

  test('network failure and timeout are unavailable', async () => {
    for (const kind of ['network', 'timeout'] as const) {
      const error = new XanoError(kind, kind)
      expect(await verifySession(fetcher({ ok: false, error }), store(TOKEN)), kind).toEqual({ status: 'unavailable' })
    }
  })

  test('no cookie is still anonymous without a backend call', async () => {
    let called = 0
    const f: CurrentUserFetcher = async () => {
      called += 1
      return okWith({ id: 1 })
    }
    expect(await verifySession(f, store())).toEqual({ status: 'anonymous' })
    expect(called).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 5. Null bytes and the single token limit
// ---------------------------------------------------------------------------
test.describe('token limit is shared', () => {
  test('one documented limit, enforced identically by cookie and client', () => {
    expect(TOKEN_MAX_LENGTH).toBe(3900)
    for (const n of [1, 100, 3899, 3900, 3901, 4000, 4096, 4097]) {
      const token = 'a'.repeat(n)
      const expected = n <= 3900
      expect(isWellFormedToken(token), `client ${n}`).toBe(expected)
      expect(isValidSessionToken(token), `cookie ${n}`).toBe(expected)
    }
  })

  test('cookie-breaking characters are rejected by both', () => {
    for (const bad of ['a\u0000b', 'a\rb', 'a\nb', 'a;b', 'a,b', 'a"b', 'a\\b', 'a b', 'é', 'Ａ']) {
      expect(isWellFormedToken(bad), JSON.stringify(bad)).toBe(false)
      expect(isValidSessionToken(bad), JSON.stringify(bad)).toBe(false)
    }
    expect(isWellFormedToken(TOKEN)).toBe(true)
    expect(isValidSessionToken(TOKEN)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Hostname validation decision: https DNS hostnames, custom domains allowed
// ---------------------------------------------------------------------------
test.describe('XANO_BASE_URL hostname rules', () => {
  const accepted = [
    'https://abc-123.eu-west-1.xano.io',
    'https://ABC-123.EU-WEST-1.XANO.IO',
    'https://api.theayoplace.com', // custom domain: allowed on purpose
    'https://xn--80ahbe.xano.io',
  ]
  for (const raw of accepted) {
    test(`accepts ${raw}`, () => {
      expect(parseXanoBaseUrl(raw).protocol).toBe('https:')
    })
  }

  const rejected: Array<[string, RegExp]> = [
    ['https://1.2.3.4', /IP address/],
    ['https://2130706433', /IP address|fully qualified/],
    ['https://0x7f.1', /IP address|plain DNS/],
    ['https://[::1]', /IP address|fully qualified/],
    ['https://[::ffff:1.2.3.4]', /IP address|fully qualified/],
    ['https://abc.xano.io.', /end with a dot/],
    ['https://a_b.xano.io', /plain DNS/],
    ['https://abc.xa\tno.io', /control characters/],
    ['https://abc.xano\n.io', /control characters/],
    ['https://abc.xano.io\r\n/', /control characters/],
    ['https://abc\u0000.xano.io', /control characters/],
    ['https://abc .xano.io', /control characters/],
    // Invisible or non-ASCII characters the URL parser would otherwise strip or map.
    ['https://abc​.xano.io', /non-ASCII/],
    ['https://abc­.xano.io', /non-ASCII/],
    ['https://abc‎.xano.io', /non-ASCII/],
    ['https://abc﻿.xano.io', /non-ASCII/],
    ['https://abc.ещё.xano.io', /non-ASCII/],
    ['https://abc。xano.io', /non-ASCII/],
    ['https://ＡＢＣ.xano.io', /non-ASCII/],
    // DNS-invalid labels.
    ['https://-abc.xano.io', /plain DNS/],
    ['https://abc-.xano.io', /plain DNS/],
    [`https://${'a'.repeat(64)}.xano.io`, /plain DNS/],
    [`https://${Array.from({ length: 5 }, () => 'a'.repeat(60)).join('.')}.xano.io`, /plain DNS/],
    ['https://abc..xano.io', /not a valid URL|plain DNS/],
  ]

  test('label boundaries: 63-character labels and 253-character hostnames are still valid', () => {
    expect(parseXanoBaseUrl(`https://${'a'.repeat(63)}.xano.io`).hostname).toBe(`${'a'.repeat(63)}.xano.io`)
    const host253 = `${Array.from({ length: 4 }, () => 'a'.repeat(60)).join('.')}.${'b'.repeat(9)}` // 4*60+4+9 = 253
    expect(host253.length).toBe(253)
    expect(parseXanoBaseUrl(`https://${host253}`).hostname).toBe(host253)
    expect(() => parseXanoBaseUrl(`https://${host253}b`)).toThrow(/plain DNS/)
  })
  for (const [raw, why] of rejected) {
    test(`rejects ${JSON.stringify(raw)}`, () => {
      expect(() => parseXanoBaseUrl(raw)).toThrow(ConfigError)
      expect(() => parseXanoBaseUrl(raw)).toThrow(why)
    })
  }
})
