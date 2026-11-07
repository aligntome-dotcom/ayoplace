import { test, expect } from '@playwright/test'
import {
  BODY_MAX_BYTES,
  handleLogin,
  handleSignup,
  readBoundedJsonObject,
} from '../../src/lib/auth/handlers'
import { sessionWasRejected } from '../../src/lib/auth/page-session'
import { SESSION_COOKIE_NAME, type SessionCookieStore } from '../../src/lib/auth/cookies'

// Regression tests for the three Low findings of the Phase 2B-2 audit:
// link-triggered logout, over-broad 4xx mapping, and body buffering before
// the size check. Xano is mocked; the handler logic runs for real.

const APP = 'https://www.theayoplace.com'
const XANO = 'https://abc-123.eu-west-1.xano.io'
const ENV = { APP_ORIGIN: APP, XANO_BASE_URL: XANO }
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl'
const CUSTOMER = { id: 14, name: 'Jane Doe', email: 'jane@example.com', role: 'customer', is_active: true }

function mockXano(respond: (path: string) => Response) {
  const calls: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url
    const path = new URL(url).pathname
    calls.push(path)
    return respond(path)
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fakeStore(initial?: string) {
  const sets: unknown[] = []
  const store: SessionCookieStore = {
    get: (name) => (initial !== undefined && name === SESSION_COOKIE_NAME ? { value: initial } : undefined),
    set: (...args) => {
      sets.push(args)
    },
  }
  return { store, sets }
}

function post(path: string, body: BodyInit, headers: Record<string, string> = {}) {
  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP, ...headers },
    body,
    duplex: 'half',
  }
  return new Request(`${APP}${path}`, init)
}

/** A JSON login body padded to exactly `bytes` UTF-8 bytes. */
function paddedLogin(bytes: number, padChar = 'a'): string {
  const base = { email: 'jane@example.com', password: 'password123', pad: '' }
  const skeleton = Buffer.byteLength(JSON.stringify(base), 'utf8')
  const padBytes = Buffer.byteLength(padChar, 'utf8')
  const count = Math.floor((bytes - skeleton) / padBytes)
  const text = JSON.stringify({ ...base, pad: padChar.repeat(count) })
  const short = bytes - Buffer.byteLength(text, 'utf8')
  // Top up with single-byte characters so the total is exact.
  return JSON.stringify({ ...base, pad: padChar.repeat(count) + 'b'.repeat(short) })
}

function streamOf(chunks: Uint8Array[], options: { failAfter?: number } = {}) {
  let cancelled = false
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (options.failAfter !== undefined && i >= options.failAfter) {
        controller.error(new Error('client aborted'))
        return
      }
      if (i < chunks.length) controller.enqueue(chunks[i++])
      else controller.close()
    },
    cancel() {
      cancelled = true
    },
  })
  return { stream, wasCancelled: () => cancelled, chunksDelivered: () => i }
}

// ---------------------------------------------------------------------------
// 1. Stale-cookie cleanup is driven by server verification only
// ---------------------------------------------------------------------------
test.describe('rejected-session cleanup trigger', () => {
  test('only a server-verified rejection qualifies', () => {
    expect(sessionWasRejected({ status: 'rejected' })).toBe(true)
    expect(sessionWasRejected({ status: 'anonymous' })).toBe(false)
    expect(sessionWasRejected({ status: 'unavailable' })).toBe(false)
    expect(sessionWasRejected({ status: 'authenticated', user: { role: 'customer', is_active: true } })).toBe(false)
  })

  test('no source file derives the cleanup from the URL, Referer or a client flag', async () => {
    const { readFileSync } = await import('node:fs')
    const login = readFileSync('src/app/login/page.tsx', 'utf8')
    const form = readFileSync('src/components/auth/LoginForm.tsx', 'utf8')
    const account = readFileSync('src/app/account/page.tsx', 'utf8')
    expect(login).not.toMatch(/searchParams|reason|expired/)
    expect(login).toContain('sessionWasRejected(session)')
    expect(form).toMatch(/if \(sessionRejected\) void postJson\('\/api\/auth\/logout'/)
    expect(form).not.toMatch(/location|searchParams|URLSearchParams|document\.referrer/)
    expect(account).not.toMatch(/reason=expired/)
  })
})

// ---------------------------------------------------------------------------
// 2. Status mapping follows the verified contract only
// ---------------------------------------------------------------------------
test.describe('login status mapping', () => {
  const body = JSON.stringify({ email: 'jane@example.com', password: 'password123' })

  const cases: Array<[string, Response, number, string]> = [
    ['403 Invalid Credentials', json(403, { message: 'Invalid Credentials.' }), 401, 'invalid_credentials'],
    ['403 deactivated', json(403, { message: 'This account has been deactivated. Please contact support.' }), 403, 'account_inactive'],
    ['403 with non-JSON body', new Response('<html>forbidden</html>', { status: 403 }), 401, 'invalid_credentials'],
    ['403 with JSON but no message', json(403, { code: 'ERROR_CODE_ACCESS_DENIED' }), 401, 'invalid_credentials'],
    ['400', json(400, { message: 'Email is required.' }), 502, 'backend_error'],
    ['404', json(404, { message: 'Not found' }), 502, 'backend_error'],
    ['429', json(429, { message: 'Too many requests' }), 502, 'backend_error'],
    ['500', json(500, { message: 'boom' }), 502, 'backend_error'],
    ['503 html', new Response('<html>', { status: 503 }), 502, 'backend_error'],
    ['200 non-JSON', new Response('not json', { status: 200 }), 502, 'backend_error'],
  ]
  for (const [label, response, status, code] of cases) {
    test(`${label} → ${status} ${code}`, async () => {
      const xano = mockXano(() => response.clone())
      const { store, sets } = fakeStore()
      const res = await handleLogin(post('/api/auth/login', body), { env: ENV, fetch: xano.fetch, store })
      expect(res.status).toBe(status)
      const text = await res.text()
      expect(JSON.parse(text).error.code).toBe(code)
      expect(text).not.toMatch(/Invalid Credentials|contact support|Email is required|Too many|boom|<html>/)
      expect(xano.calls).toEqual(['/api:QKPf7var/auth/login'])
      expect(sets).toHaveLength(0)
    })
  }

  test('network failure → 503 backend_unavailable', async () => {
    const xano = mockXano(() => {
      throw new TypeError('fetch failed')
    })
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', body), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('backend_unavailable')
    expect(sets).toHaveLength(0)
  })
})

test.describe('signup status mapping', () => {
  const body = JSON.stringify({ name: 'Jane', email: 'jane@example.com', password: 'password123' })
  const cases: Array<[string, Response, number, string]> = [
    ['403 duplicate', json(403, { message: 'An account with this email already exists.' }), 409, 'email_taken'],
    ['400 email required', json(400, { message: 'Email is required.' }), 400, 'invalid_request'],
    ['403 other', json(403, { message: 'Forbidden' }), 502, 'backend_error'],
    ['404', json(404, {}), 502, 'backend_error'],
    ['429', json(429, {}), 502, 'backend_error'],
    ['500', json(500, {}), 502, 'backend_error'],
  ]
  for (const [label, response, status, code] of cases) {
    test(`${label} → ${status} ${code}`, async () => {
      const xano = mockXano(() => response.clone())
      const { store, sets } = fakeStore()
      const res = await handleSignup(post('/api/auth/signup', body), { env: ENV, fetch: xano.fetch, store })
      expect(res.status).toBe(status)
      const text = await res.text()
      expect(JSON.parse(text).error.code).toBe(code)
      // Backend text is never echoed; the 409 carries our own documented wording.
      expect(text).not.toMatch(/Email is required|Forbidden/)
      if (code === 'email_taken') {
        expect(JSON.parse(text).error.message).toBe('An account with this email already exists. Try signing in instead.')
      }
      expect(sets).toHaveLength(0)
    })
  }
})

// ---------------------------------------------------------------------------
// 3. Bounded body reader
// ---------------------------------------------------------------------------
test.describe('bounded body reader', () => {
  test('exactly at the limit is accepted', async () => {
    const text = paddedLogin(BODY_MAX_BYTES)
    expect(Buffer.byteLength(text, 'utf8')).toBe(BODY_MAX_BYTES)
    const read = await readBoundedJsonObject(post('/x', text))
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.value.email).toBe('jane@example.com')
  })

  test('one byte over is rejected as too large', async () => {
    const text = paddedLogin(BODY_MAX_BYTES + 1)
    expect(Buffer.byteLength(text, 'utf8')).toBe(BODY_MAX_BYTES + 1)
    expect(await readBoundedJsonObject(post('/x', text))).toEqual({ ok: false, reason: 'too_large' })
  })

  test('multibyte UTF-8 is measured in bytes, not characters', async () => {
    // 4-byte characters: well under the limit in characters, over it in bytes.
    const text = paddedLogin(BODY_MAX_BYTES + 3, '\u{1f389}')
    expect(text.length).toBeLessThan(BODY_MAX_BYTES)
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(BODY_MAX_BYTES)
    expect(await readBoundedJsonObject(post('/x', text))).toEqual({ ok: false, reason: 'too_large' })
    // And a multibyte body that fits is fine.
    const fits = paddedLogin(BODY_MAX_BYTES - 8, '\u{1f389}')
    expect(Buffer.byteLength(fits, 'utf8')).toBeLessThanOrEqual(BODY_MAX_BYTES)
    expect((await readBoundedJsonObject(post('/x', fits))).ok).toBe(true)
  })

  test('streams without Content-Length are capped while reading and the reader is cancelled', async () => {
    const chunk = new TextEncoder().encode('{"pad":"' + 'a'.repeat(4096 - 10) + '",')
    const source = streamOf(Array.from({ length: 20 }, () => chunk)) // ~80 KiB if fully read
    const request = post('/x', source.stream)
    expect(request.headers.get('content-length')).toBeNull()
    expect(await readBoundedJsonObject(request)).toEqual({ ok: false, reason: 'too_large' })
    expect(source.wasCancelled()).toBe(true)
    // Stopped soon after the limit: at most ceil(16 KiB / chunk) + 1 chunks consumed.
    expect(source.chunksDelivered()).toBeLessThanOrEqual(6)
  })

  test('an understated Content-Length does not bypass the byte cap', async () => {
    const text = paddedLogin(BODY_MAX_BYTES + 100)
    const request = post('/x', text, { 'Content-Length': '10' })
    expect(await readBoundedJsonObject(request)).toEqual({ ok: false, reason: 'too_large' })
  })

  test('an overstated Content-Length is rejected early without reading', async () => {
    const source = streamOf([new TextEncoder().encode('{}')])
    const request = post('/x', source.stream, { 'Content-Length': String(BODY_MAX_BYTES + 1) })
    expect(await readBoundedJsonObject(request)).toEqual({ ok: false, reason: 'too_large' })
    // The body was never consumed (a ReadableStream may pre-pull one chunk on its own).
    expect(request.bodyUsed).toBe(false)
    expect(source.wasCancelled()).toBe(false)
    expect(source.chunksDelivered()).toBeLessThanOrEqual(1)
  })

  test('malformed JSON, non-object JSON and invalid UTF-8 are invalid, not too large', async () => {
    expect(await readBoundedJsonObject(post('/x', '{"a":'))).toEqual({ ok: false, reason: 'invalid' })
    expect(await readBoundedJsonObject(post('/x', '[1,2]'))).toEqual({ ok: false, reason: 'invalid' })
    expect(await readBoundedJsonObject(post('/x', '"str"'))).toEqual({ ok: false, reason: 'invalid' })
    expect(await readBoundedJsonObject(post('/x', ''))).toEqual({ ok: false, reason: 'invalid' })
    const badUtf8 = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0xfe, 0x22, 0x7d]) // {"a":"<invalid>"}
    expect(await readBoundedJsonObject(post('/x', badUtf8))).toEqual({ ok: false, reason: 'invalid' })
    expect(await readBoundedJsonObject(post('/x', '{}', { 'Content-Type': 'text/plain' }))).toEqual({ ok: false, reason: 'invalid' })
  })

  test('an aborted request stream is rejected safely', async () => {
    const source = streamOf([new TextEncoder().encode('{"email":"a@b.c",')], { failAfter: 1 })
    expect(await readBoundedJsonObject(post('/x', source.stream))).toEqual({ ok: false, reason: 'invalid' })
  })

  test('oversized login and signup requests get 413 and never reach Xano or the cookie', async () => {
    const xano = mockXano(() => json(200, { authToken: TOKEN, user_id: 14 }))
    const { store, sets } = fakeStore()
    const big = paddedLogin(BODY_MAX_BYTES + 1)
    const login = await handleLogin(post('/api/auth/login', big), { env: ENV, fetch: xano.fetch, store })
    expect(login.status).toBe(413)
    expect((await login.json()).error.code).toBe('request_too_large')
    const signup = await handleSignup(post('/api/auth/signup', big), { env: ENV, fetch: xano.fetch, store })
    expect(signup.status).toBe(413)
    // Streamed, no Content-Length, far over the limit.
    const source = streamOf(Array.from({ length: 10 }, () => new TextEncoder().encode('a'.repeat(4096))))
    const streamed = await handleLogin(post('/api/auth/login', source.stream), { env: ENV, fetch: xano.fetch, store })
    expect(streamed.status).toBe(413)
    expect(source.wasCancelled()).toBe(true)
    expect(xano.calls).toHaveLength(0)
    expect(sets).toHaveLength(0)
  })

  test('the Origin check still comes before any body read, even for oversized bodies', async () => {
    const xano = mockXano(() => json(200, {}))
    const { store, sets } = fakeStore()
    const source = streamOf(Array.from({ length: 10 }, () => new TextEncoder().encode('a'.repeat(4096))))
    const request = post('/api/auth/login', source.stream, { Origin: 'https://evil.example' })
    const res = await handleLogin(request, { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(403)
    expect(request.bodyUsed).toBe(false)
    expect(source.wasCancelled()).toBe(false)
    expect(source.chunksDelivered()).toBeLessThanOrEqual(1)
    expect(xano.calls).toHaveLength(0)
    expect(sets).toHaveLength(0)
  })

  test('a valid customer session still works end to end through the bounded reader', async () => {
    const xano = mockXano((path) => (path.endsWith('/auth/login') ? json(200, { authToken: TOKEN, user_id: 14 }) : json(200, CUSTOMER)))
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', JSON.stringify({ email: 'jane@example.com', password: 'password123' })), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(200)
    expect(sets).toHaveLength(1)
  })
})
