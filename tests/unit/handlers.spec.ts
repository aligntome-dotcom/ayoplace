import { test, expect } from '@playwright/test'
import {
  FORBIDDEN_SIGNUP_KEYS,
  handleLogin,
  handleLogout,
  handleSession,
  handleSignup,
  type HandlerDeps,
} from '../../src/lib/auth/handlers'
import { SESSION_COOKIE_NAME, type SessionCookieStore } from '../../src/lib/auth/cookies'

// Deterministic unit tests for the complete login/signup/logout/session flows
// against a MOCKED Xano transport. They prove the handler logic, request
// shapes and cookie behaviour; they do not prove live Xano behaviour.

const APP = 'https://www.theayoplace.com'
const XANO = 'https://abc-123.eu-west-1.xano.io'
const ENV = { APP_ORIGIN: APP, XANO_BASE_URL: XANO, NODE_ENV: 'production' }
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl'
const CUSTOMER = { id: 14, name: 'Jane Doe', email: 'jane@example.com', role: 'customer', experience: 'customer', is_active: true }

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }
type Route = (call: Call) => Response

function mockXano(routes: Record<string, Route>) {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    const key = `${call.method} ${new URL(url).pathname}`
    const route = routes[key]
    if (!route) return new Response(JSON.stringify({ message: 'no route' }), { status: 404 })
    return route(call)
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fakeStore(initial?: string) {
  const sets: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []
  let value = initial
  const store: SessionCookieStore = {
    get: (name) => (value !== undefined && name === SESSION_COOKIE_NAME ? { value } : undefined),
    set: (name, v, options) => {
      sets.push({ name, value: v, options: options as Record<string, unknown> })
      value = options?.maxAge === 0 ? undefined : v
    },
  }
  return { store, sets, current: () => value }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** A request that records whether its body was ever read. */
function spyRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  const request = post(path, body, headers)
  let read = false
  const original = request.text.bind(request)
  Object.defineProperty(request, 'text', {
    value: async () => {
      read = true
      return original()
    },
  })
  return { request, wasRead: () => read }
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

const okXano = () =>
  mockXano({
    'POST /api:QKPf7var/auth/login': () => json(200, { authToken: TOKEN, user_id: 14 }),
    'POST /api:QKPf7var/auth/signup': () => json(200, { authToken: TOKEN, user_id: 14 }),
    'GET /api:QKPf7var/auth/me': (c) => (c.headers.Authorization === `Bearer ${TOKEN}` ? json(200, CUSTOMER) : json(401, {})),
  })

test.describe('Origin gate (all state-changing handlers)', () => {
  const handlers: Array<[string, (r: Request, d: HandlerDeps) => Promise<Response>]> = [
    ['login', handleLogin],
    ['signup', handleSignup],
    ['logout', handleLogout],
  ]
  for (const [name, handler] of handlers) {
    test(`${name}: missing or foreign Origin is refused before the body is read, Xano is called or cookies change`, async () => {
      const variants: Record<string, string>[] = [{ Origin: '' }, { Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]
      for (const headers of variants) {
        const xano = okXano()
        const { store, sets } = fakeStore(TOKEN)
        const { request, wasRead } = spyRequest(`/api/auth/${name}`, { email: 'jane@example.com', password: 'password123', name: 'Jane' }, headers)
        if (headers.Origin === '') request.headers.delete('Origin')
        const res = await handler(request, { env: ENV, fetch: xano.fetch, store })
        expect(res.status, JSON.stringify(headers)).toBe(403)
        expect((await body(res)).error).toMatchObject({ code: 'invalid_origin' })
        expect(wasRead(), 'body read').toBe(false)
        expect(xano.calls, 'xano called').toHaveLength(0)
        expect(sets, 'cookie written').toHaveLength(0)
      }
    })

    test(`${name}: unset or malformed APP_ORIGIN fails closed`, async () => {
      for (const env of [{ XANO_BASE_URL: XANO }, { XANO_BASE_URL: XANO, APP_ORIGIN: 'not a url' }]) {
        const xano = okXano()
        const { store, sets } = fakeStore()
        const res = await handler(post(`/api/auth/${name}`, { email: 'a@b.c', password: 'password123', name: 'A' }), { env, fetch: xano.fetch, store })
        expect(res.status).toBe(403)
        expect(xano.calls).toHaveLength(0)
        expect(sets).toHaveLength(0)
      }
    })
  }

  test('Referer is accepted only as a fallback when Origin is absent', async () => {
    const xano = okXano()
    const { store } = fakeStore()
    const request = post('/api/auth/login', { email: 'jane@example.com', password: 'password123' }, { Referer: `${APP}/login` })
    request.headers.delete('Origin')
    const res = await handleLogin(request, { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(200)
  })
})

test.describe('login', () => {
  test('success: exact Xano contract, /auth/me verification, cookie set, no token in the response', async () => {
    const xano = okXano()
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', { email: '  Jane@Example.com ', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ok: true, user: { id: 14, name: 'Jane Doe', email: 'jane@example.com', role: 'customer' } })
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain('authToken')
    // Request shapes sent to Xano.
    expect(xano.calls).toHaveLength(2)
    expect(xano.calls[0].url).toBe(`${XANO}/api:QKPf7var/auth/login`)
    expect(xano.calls[0].method).toBe('POST')
    expect(xano.calls[0].body).toEqual({ email: 'Jane@Example.com', password: 'password123' })
    expect(xano.calls[0].headers.Authorization).toBeUndefined()
    expect(xano.calls[1].url).toBe(`${XANO}/api:QKPf7var/auth/me`)
    expect(xano.calls[1].method).toBe('GET')
    expect(xano.calls[1].headers.Authorization).toBe(`Bearer ${TOKEN}`)
    // Cookie.
    expect(sets).toHaveLength(1)
    expect(sets[0]).toMatchObject({ name: SESSION_COOKIE_NAME, value: TOKEN })
    // `secure` follows the real NODE_ENV of the running process (true in production builds).
    expect(sets[0].options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 86400 })
    expect(typeof sets[0].options?.secure).toBe('boolean')
  })

  test('failed login: Xano 403 Invalid Credentials → 401 generic, no /auth/me call, no cookie', async () => {
    const xano = mockXano({ 'POST /api:QKPf7var/auth/login': () => json(403, { message: 'Invalid Credentials.' }) })
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', { email: 'jane@example.com', password: 'wrongpass1' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(401)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('invalid_credentials')
    expect(text).not.toContain('Invalid Credentials.')
    expect(xano.calls).toHaveLength(1)
    expect(sets).toHaveLength(0)
  })

  test('deactivated account at login → 403 account_inactive without echoing the backend text', async () => {
    const xano = mockXano({
      'POST /api:QKPf7var/auth/login': () => json(403, { message: 'This account has been deactivated. Please contact support.' }),
    })
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', { email: 'jane@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(403)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('account_inactive')
    expect(text).not.toContain('contact support')
    expect(sets).toHaveLength(0)
  })

  test('login response alone never authenticates: /auth/me must accept the token', async () => {
    const xano = mockXano({
      'POST /api:QKPf7var/auth/login': () => json(200, { authToken: TOKEN, user_id: 14 }),
      'GET /api:QKPf7var/auth/me': () => json(401, { message: 'Unauthorized' }),
    })
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', { email: 'jane@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(401)
    expect(sets).toHaveLength(0)
  })

  test('/auth/me 403 (account inactive) → 403, no cookie', async () => {
    const xano = mockXano({
      'POST /api:QKPf7var/auth/login': () => json(200, { authToken: TOKEN, user_id: 14 }),
      'GET /api:QKPf7var/auth/me': () => json(403, { message: 'This account is inactive.' }),
    })
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', { email: 'jane@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(403)
    expect((await body(res)).error).toMatchObject({ code: 'account_inactive' })
    expect(sets).toHaveLength(0)
  })

  test('non-customer roles are refused at the public door with the generic message and no cookie', async () => {
    for (const role of ['event_planner', 'staff', 'manager', 'admin']) {
      const xano = mockXano({
        'POST /api:QKPf7var/auth/login': () => json(200, { authToken: TOKEN, user_id: 14 }),
        'GET /api:QKPf7var/auth/me': () => json(200, { ...CUSTOMER, role }),
      })
      const { store, sets } = fakeStore()
      const res = await handleLogin(post('/api/auth/login', { email: 'x@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
      expect(res.status, role).toBe(401)
      expect((await body(res)).error, role).toMatchObject({ code: 'invalid_credentials' })
      expect(sets, role).toHaveLength(0)
    }
  })

  test('is_active false in a 200 /auth/me never authenticates', async () => {
    const xano = mockXano({
      'POST /api:QKPf7var/auth/login': () => json(200, { authToken: TOKEN, user_id: 14 }),
      'GET /api:QKPf7var/auth/me': () => json(200, { ...CUSTOMER, is_active: false }),
    })
    const { store, sets } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', { email: 'x@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(403)
    expect(sets).toHaveLength(0)
  })

  test('invalid Xano response shapes never set a cookie', async () => {
    const loginBodies: unknown[] = [{}, { authToken: 'bad token', user_id: 14 }, { authToken: TOKEN }, { authToken: TOKEN, user_id: '14' }, [], null, 'ok']
    for (const data of loginBodies) {
      const xano = mockXano({ 'POST /api:QKPf7var/auth/login': () => json(200, data), 'GET /api:QKPf7var/auth/me': () => json(200, CUSTOMER) })
      const { store, sets } = fakeStore()
      const res = await handleLogin(post('/api/auth/login', { email: 'x@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
      expect(res.status, JSON.stringify(data)).toBe(502)
      expect(sets, JSON.stringify(data)).toHaveLength(0)
    }
    const meBodies: unknown[] = [{}, { role: 'customer' }, { role: 'customer', is_active: 'true' }, { role: 'owner', is_active: true }, [CUSTOMER], null, 'customer']
    for (const data of meBodies) {
      const xano = mockXano({
        'POST /api:QKPf7var/auth/login': () => json(200, { authToken: TOKEN, user_id: 14 }),
        'GET /api:QKPf7var/auth/me': () => json(200, data),
      })
      const { store, sets } = fakeStore()
      const res = await handleLogin(post('/api/auth/login', { email: 'x@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
      expect(res.status, JSON.stringify(data)).toBe(502)
      expect(sets, JSON.stringify(data)).toHaveLength(0)
    }
  })

  test('backend unreachable → 503 safe error; non-JSON 2xx → 502; no retries', async () => {
    const down = mockXano({
      'POST /api:QKPf7var/auth/login': () => {
        throw new TypeError('fetch failed')
      },
    })
    const { store, sets } = fakeStore()
    let res = await handleLogin(post('/api/auth/login', { email: 'x@example.com', password: 'password123' }), { env: ENV, fetch: down.fetch, store })
    expect(res.status).toBe(503)
    expect((await body(res)).error).toMatchObject({ code: 'backend_unavailable' })
    expect(down.calls).toHaveLength(1)

    const html = mockXano({ 'POST /api:QKPf7var/auth/login': () => new Response('<html>', { status: 200 }) })
    res = await handleLogin(post('/api/auth/login', { email: 'x@example.com', password: 'password123' }), { env: ENV, fetch: html.fetch, store })
    expect(res.status).toBe(502)
    expect(sets).toHaveLength(0)
  })

  test('missing XANO_BASE_URL → 503 with no configuration detail', async () => {
    const xano = okXano()
    const { store } = fakeStore()
    const res = await handleLogin(post('/api/auth/login', { email: 'x@example.com', password: 'password123' }), { env: { APP_ORIGIN: APP }, fetch: xano.fetch, store })
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(text).not.toMatch(/XANO|xano\.io|ConfigError/)
    expect(xano.calls).toHaveLength(0)
  })

  test('invalid bodies → 400 before Xano is called', async () => {
    const cases: Array<[unknown, Record<string, string>]> = [
      ['not json', {}],
      ['[]', {}],
      [{ email: 'x@example.com' }, {}],
      [{ email: 'x@example.com', password: 'short' }, {}],
      [{ email: 'not-an-email', password: 'password123' }, {}],
      [{ email: 'x@example.com', password: 'password123' }, { 'Content-Type': 'text/plain' }],
      [{ email: 'x@example.com', password: 'p'.repeat(300) }, {}],
    ]
    for (const [b, headers] of cases) {
      const xano = okXano()
      const { store, sets } = fakeStore()
      const res = await handleLogin(post('/api/auth/login', b, headers), { env: ENV, fetch: xano.fetch, store })
      expect(res.status, JSON.stringify(b)).toBe(400)
      expect(xano.calls, JSON.stringify(b)).toHaveLength(0)
      expect(sets).toHaveLength(0)
    }
  })
})

test.describe('customer signup', () => {
  test('success: exact contract (name, email, password; no role), verified via /auth/me, cookie set, 201', async () => {
    const xano = okXano()
    const { store, sets } = fakeStore()
    const res = await handleSignup(post('/api/auth/signup', { name: '  Jane   Doe ', email: 'jane@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(201)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ok: true, user: { id: 14, name: 'Jane Doe', email: 'jane@example.com', role: 'customer' } })
    expect(text).not.toContain(TOKEN)
    expect(xano.calls[0].url).toBe(`${XANO}/api:QKPf7var/auth/signup`)
    expect(xano.calls[0].body).toEqual({ name: 'Jane Doe', email: 'jane@example.com', password: 'password123' })
    expect(Object.keys(xano.calls[0].body as object).sort()).toEqual(['email', 'name', 'password'])
    expect(xano.calls[1].url).toBe(`${XANO}/api:QKPf7var/auth/me`)
    expect(sets).toHaveLength(1)
    expect(sets[0].value).toBe(TOKEN)
  })

  test('any attempt to submit a role or account attribute is refused before Xano is called', async () => {
    expect(FORBIDDEN_SIGNUP_KEYS).toContain('role')
    const base = { name: 'Jane', email: 'jane@example.com', password: 'password123' }
    const attempts: Array<Record<string, unknown>> = [
      { ...base, role: 'admin' },
      { ...base, role: 'staff' },
      { ...base, role: 'manager' },
      { ...base, role: 'event_planner' },
      { ...base, role: 'customer' }, // even the correct role is not the client's to choose
      { ...base, is_active: true },
      { ...base, status: 'active' },
      { ...base, user_id: 1 },
    ]
    for (const attempt of attempts) {
      const xano = okXano()
      const { store, sets } = fakeStore()
      const res = await handleSignup(post('/api/auth/signup', attempt), { env: ENV, fetch: xano.fetch, store })
      expect(res.status, JSON.stringify(attempt)).toBe(400)
      expect(xano.calls, JSON.stringify(attempt)).toHaveLength(0)
      expect(sets).toHaveLength(0)
    }
  })

  test('duplicate email → 409 with our own wording', async () => {
    const xano = mockXano({ 'POST /api:QKPf7var/auth/signup': () => json(403, { message: 'An account with this email already exists.' }) })
    const { store, sets } = fakeStore()
    const res = await handleSignup(post('/api/auth/signup', { name: 'Jane', email: 'jane@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(409)
    expect((await body(res)).error).toMatchObject({ code: 'email_taken' })
    expect(sets).toHaveLength(0)
  })

  test('a signup whose token is then refused by /auth/me does not create a session', async () => {
    const xano = mockXano({
      'POST /api:QKPf7var/auth/signup': () => json(200, { authToken: TOKEN, user_id: 14 }),
      'GET /api:QKPf7var/auth/me': () => json(403, { message: 'This account is inactive.' }),
    })
    const { store, sets } = fakeStore()
    const res = await handleSignup(post('/api/auth/signup', { name: 'Jane', email: 'jane@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(403)
    expect(sets).toHaveLength(0)
  })

  test('a signup that somehow yields a non-customer is refused without a cookie', async () => {
    const xano = mockXano({
      'POST /api:QKPf7var/auth/signup': () => json(200, { authToken: TOKEN, user_id: 14 }),
      'GET /api:QKPf7var/auth/me': () => json(200, { ...CUSTOMER, role: 'admin' }),
    })
    const { store, sets } = fakeStore()
    const res = await handleSignup(post('/api/auth/signup', { name: 'Jane', email: 'jane@example.com', password: 'password123' }), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(401)
    expect(sets).toHaveLength(0)
  })

  test('validation: password confirmation is a client concern; server requires name, email, 8+ char password', async () => {
    for (const b of [{ email: 'a@b.c', password: 'password123' }, { name: ' ', email: 'a@b.c', password: 'password123' }, { name: 'A', email: 'a@b.c', password: '1234567' }]) {
      const xano = okXano()
      const { store } = fakeStore()
      const res = await handleSignup(post('/api/auth/signup', b), { env: ENV, fetch: xano.fetch, store })
      expect(res.status, JSON.stringify(b)).toBe(400)
      expect(xano.calls).toHaveLength(0)
    }
  })
})

test.describe('logout', () => {
  test('clears the cookie with matching attributes and claims nothing about Xano', async () => {
    const xano = okXano()
    const { store, sets, current } = fakeStore(TOKEN)
    const res = await handleLogout(post('/api/auth/logout', {}), { env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ok: true })
    expect(text).not.toMatch(/revok|invalidat/i)
    expect(sets).toHaveLength(1)
    expect(sets[0]).toMatchObject({ name: SESSION_COOKIE_NAME, value: '' })
    expect(sets[0].options).toMatchObject({ httpOnly: true, path: '/', sameSite: 'lax', maxAge: 0 })
    expect(current()).toBeUndefined()
    expect(xano.calls, 'no backend logout endpoint is invented').toHaveLength(0)
  })

  test('works without a body and without an existing cookie', async () => {
    const { store, sets } = fakeStore()
    const request = new Request(`${APP}/api/auth/logout`, { method: 'POST', headers: { Origin: APP } })
    const res = await handleLogout(request, { env: ENV, store })
    expect(res.status).toBe(200)
    expect(sets).toHaveLength(1)
  })
})

test.describe('session (GET)', () => {
  test('never writes cookies in any state', async () => {
    const states: Array<[string, Record<string, Route>, string | undefined, number, boolean]> = [
      ['anonymous', {}, undefined, 200, false],
      ['authenticated', { 'GET /api:QKPf7var/auth/me': () => json(200, CUSTOMER) }, TOKEN, 200, true],
      ['rejected', { 'GET /api:QKPf7var/auth/me': () => json(401, {}) }, TOKEN, 401, false],
      ['inactive-200', { 'GET /api:QKPf7var/auth/me': () => json(200, { ...CUSTOMER, is_active: false }) }, TOKEN, 401, false],
      ['unavailable', { 'GET /api:QKPf7var/auth/me': () => json(500, {}) }, TOKEN, 503, false],
      ['bad-shape', { 'GET /api:QKPf7var/auth/me': () => json(200, { hello: 'world' }) }, TOKEN, 503, false],
    ]
    for (const [label, routes, cookie, status, authenticated] of states) {
      const xano = mockXano(routes)
      const { store, sets } = fakeStore(cookie)
      const res = await handleSession({ env: ENV, fetch: xano.fetch, store })
      expect(res.status, label).toBe(status)
      const text = await res.text()
      expect(JSON.parse(text).authenticated, label).toBe(authenticated)
      expect(text, label).not.toContain(TOKEN)
      expect(sets, `${label}: cookie write on GET`).toHaveLength(0)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })

  test('missing backend configuration is reported as unavailable in the session shape, with no detail', async () => {
    const { store, sets } = fakeStore(TOKEN)
    const res = await handleSession({ env: { APP_ORIGIN: APP }, store })
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ authenticated: false, reason: 'unavailable' })
    expect(text).not.toMatch(/XANO|ConfigError/)
    expect(sets).toHaveLength(0)
  })

  test('authenticated state exposes only the public user fields', async () => {
    const xano = mockXano({ 'GET /api:QKPf7var/auth/me': () => json(200, { ...CUSTOMER, password: 'hash', secret: 'x' }) })
    const { store } = fakeStore(TOKEN)
    const res = await handleSession({ env: ENV, fetch: xano.fetch, store })
    expect(await res.json()).toEqual({ authenticated: true, user: { id: 14, name: 'Jane Doe', email: 'jane@example.com', role: 'customer' } })
  })

  test('rejected session is reported, and the cookie is cleared by the next POST (logout), not by GET', async () => {
    const xano = mockXano({ 'GET /api:QKPf7var/auth/me': () => json(401, {}) })
    const { store, sets, current } = fakeStore(TOKEN)
    const res = await handleSession({ env: ENV, fetch: xano.fetch, store })
    expect(res.status).toBe(401)
    expect(sets).toHaveLength(0)
    expect(current()).toBe(TOKEN)
    const cleared = await handleLogout(post('/api/auth/logout', {}), { env: ENV, fetch: xano.fetch, store })
    expect(cleared.status).toBe(200)
    expect(current()).toBeUndefined()
  })
})
