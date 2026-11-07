import { test, expect } from '@playwright/test'
import {
  buildXanoHeaders,
  buildXanoUrl,
  DEFAULT_TIMEOUT_MS,
  isWellFormedToken,
  XanoError,
  xanoFetch,
} from '../../src/lib/xano/client'
import { XANO_API_GROUPS } from '../../src/lib/xano/groups'
import { ConfigError } from '../../src/lib/server/env'

const ORIGIN = 'https://abc-123.eu-west-1.xano.io'
const ENV = { XANO_BASE_URL: ORIGIN }
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl'

type Captured = { url: string; method?: string; headers: Record<string, string>; body?: string; redirect?: string }

function fakeFetch(
  respond: (captured: Captured) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const captured: Captured = {
      url: input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url,
      method: init?.method,
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      body: typeof init?.body === 'string' ? init.body : undefined,
      redirect: init?.redirect,
    }
    calls.push(captured)
    return respond(captured)
  }) as typeof fetch
  return { fetch: f, calls }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test.describe('URL construction', () => {
  test('joins origin, verified group path and endpoint path', () => {
    const url = buildXanoUrl(new URL(ORIGIN), 'authentication', '/auth/login')
    expect(url.toString()).toBe(`${ORIGIN}/api:QKPf7var/auth/login`)
    expect(XANO_API_GROUPS.authentication).toBe('/api:QKPf7var')
  })

  test('appends defined query parameters only', () => {
    const url = buildXanoUrl(new URL(ORIGIN), 'authentication', '/reset/request-reset-link', {
      email: 'a+b@example.com',
      skip: undefined,
      page: 2,
    })
    expect(url.pathname).toBe('/api:QKPf7var/reset/request-reset-link')
    expect(url.searchParams.get('email')).toBe('a+b@example.com')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.has('skip')).toBe(false)
  })

  test('rejects paths that could escape the group', () => {
    for (const bad of ['auth/login', '/auth/../other', '//evil.example/x', '/x?y=1', '/x#y', '/a b', 'https://evil.example/']) {
      expect(() => buildXanoUrl(new URL(ORIGIN), 'authentication', bad), bad).toThrow()
    }
  })
})

test.describe('headers', () => {
  test('adds Authorization only when a token is supplied', () => {
    expect(buildXanoHeaders({ hasBody: false })).toEqual({ Accept: 'application/json' })
    expect(buildXanoHeaders({ hasBody: true })).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })
    expect(buildXanoHeaders({ token: TOKEN, hasBody: false }).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  test('refuses malformed tokens without echoing them', () => {
    for (const bad of ['', 'has space', 'line\nbreak', 'x'.repeat(5000), 'tok;en']) {
      let message = ''
      try {
        buildXanoHeaders({ token: bad, hasBody: false })
      } catch (e) {
        message = (e as Error).message
      }
      expect(message, JSON.stringify(bad)).toMatch(/malformed/)
      if (bad.length > 0) expect(message).not.toContain(bad)
      expect(isWellFormedToken(bad)).toBe(false)
    }
    expect(isWellFormedToken(TOKEN)).toBe(true)
  })
})

test.describe('xanoFetch', () => {
  test('sends a JSON POST with the bearer token and returns parsed data', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { id: 14, role: 'customer' }))
    const result = await xanoFetch<{ id: number }>(
      { group: 'authentication', path: '/auth/me', method: 'POST', body: { a: 1 }, token: TOKEN },
      { fetch, env: ENV },
    )
    expect(result).toEqual({ ok: true, status: 200, data: { id: 14, role: 'customer' } })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${ORIGIN}/api:QKPf7var/auth/me`)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0].headers['Content-Type']).toBe('application/json')
    expect(calls[0].body).toBe('{"a":1}')
    expect(calls[0].redirect).toBe('manual')
  })

  test('defaults to GET without Authorization or body', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, []))
    await xanoFetch({ group: 'authentication', path: '/auth/me' }, { fetch, env: ENV })
    expect(calls[0].method).toBe('GET')
    expect(calls[0].headers.Authorization).toBeUndefined()
    expect(calls[0].body).toBeUndefined()
  })

  test('refuses a body on GET and a malformed token before any request is made', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, {}))
    await expect(
      xanoFetch({ group: 'authentication', path: '/x', body: { a: 1 } }, { fetch, env: ENV }),
    ).rejects.toThrow(/GET/)
    await expect(
      xanoFetch({ group: 'authentication', path: '/x', token: 'bad token' }, { fetch, env: ENV }),
    ).rejects.toThrow(/malformed/)
    expect(calls).toHaveLength(0)
  })

  test('fails fast with ConfigError when the base URL is missing', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, {}))
    await expect(xanoFetch({ group: 'authentication', path: '/x' }, { fetch, env: {} })).rejects.toThrow(ConfigError)
    expect(calls).toHaveLength(0)
  })

  test('non-2xx becomes a result with internal detail and a generic safe error', async () => {
    const { fetch, calls } = fakeFetch(() => json(403, { message: 'Invalid Credentials.' }))
    const result = await xanoFetch(
      { group: 'authentication', path: '/auth/login', method: 'POST', body: {}, token: TOKEN },
      { fetch, env: ENV },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    const { error } = result
    expect(error).toBeInstanceOf(XanoError)
    expect(error.kind).toBe('http')
    expect(error.status).toBe(403)
    expect(error.backendMessage).toBe('Invalid Credentials.')
    expect(error.toSafe()).toEqual({ code: 'forbidden', message: 'This action is not allowed.' })
    // Nothing internal leaks through the generic surfaces.
    for (const text of [error.message, String(error), JSON.stringify(error.toSafe())]) {
      expect(text).not.toContain('Invalid Credentials')
      expect(text).not.toContain(TOKEN)
      expect(text).not.toContain(ORIGIN)
    }
    expect(calls).toHaveLength(1) // no retry
  })

  test('maps statuses to safe codes', async () => {
    const cases: Array<[number, string]> = [
      [400, 'bad_request'],
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
      [422, 'bad_request'],
      [500, 'backend_error'],
      [503, 'backend_error'],
    ]
    for (const [status, code] of cases) {
      const { fetch } = fakeFetch(() => json(status, { message: 'internal detail' }))
      const result = await xanoFetch({ group: 'authentication', path: '/x' }, { fetch, env: ENV })
      expect(result.ok, String(status)).toBe(false)
      if (!result.ok) expect(result.error.toSafe().code, String(status)).toBe(code)
    }
  })

  test('tolerates non-JSON error bodies and empty 204 responses', async () => {
    const html = fakeFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }))
    const r1 = await xanoFetch({ group: 'authentication', path: '/x' }, { fetch: html.fetch, env: ENV })
    expect(r1.ok).toBe(false)
    if (!r1.ok) {
      expect(r1.error.status).toBe(502)
      expect(r1.error.backendMessage).toBeUndefined()
    }
    const empty = fakeFetch(() => new Response(null, { status: 204 }))
    const r2 = await xanoFetch({ group: 'authentication', path: '/x' }, { fetch: empty.fetch, env: ENV })
    expect(r2).toEqual({ ok: true, status: 204, data: null })
  })

  test('a 2xx with a non-JSON body is an invalid_response, not data', async () => {
    const { fetch } = fakeFetch(() => new Response('not json', { status: 200 }))
    const result = await xanoFetch({ group: 'authentication', path: '/x' }, { fetch, env: ENV })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_response')
      expect(result.error.toSafe().code).toBe('backend_error')
    }
  })

  test('network failure is reported once, with the cause kept server-side', async () => {
    const boom = new TypeError('fetch failed')
    const { fetch, calls } = fakeFetch(() => {
      throw boom
    })
    const result = await xanoFetch(
      { group: 'authentication', path: '/x', method: 'POST', body: {}, token: TOKEN },
      { fetch, env: ENV },
    )
    expect(calls).toHaveLength(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('network')
      expect(result.error.cause).toBe(boom)
      expect(result.error.toSafe().code).toBe('backend_unavailable')
      expect(result.error.message).not.toContain(TOKEN)
    }
  })

  test('times out via AbortSignal and reports a timeout', async () => {
    const started = Date.now()
    const { fetch } = fakeFetch(
      () =>
        new Promise<Response>((_, reject) => {
          // Never resolves; only the abort signal can end it.
          void reject
        }),
    )
    // The fake ignores the signal, so wrap it to honour abort.
    const honouring = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const p = fetch(input, init)
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        p.then(resolve, reject)
      })
    }) as typeof fetch
    const result = await xanoFetch(
      { group: 'authentication', path: '/x', timeoutMs: 50 },
      { fetch: honouring, env: ENV },
    )
    expect(Date.now() - started).toBeLessThan(DEFAULT_TIMEOUT_MS)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('timeout')
      expect(result.error.toSafe().code).toBe('backend_unavailable')
    }
  })
})
