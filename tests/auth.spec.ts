import { test, expect } from '@playwright/test'

// End-to-end checks against the production build WITHOUT a Xano instance
// (XANO_BASE_URL is unset on purpose; APP_ORIGIN is http://localhost:3000).
// They prove the pages render, the Origin gate and GET/cookie rules hold over
// real HTTP, and that a missing backend fails safely. Successful login and
// signup flows are covered by the mocked unit tests in tests/unit/handlers.spec.ts.

const ORIGIN = 'http://localhost:3000'
const JSON_HEADERS = { 'Content-Type': 'application/json' }
const CREDS = { email: 'jane@example.com', password: 'password123' }

test.describe('auth pages', () => {
  test('home page keeps the hero and offers customer entry; planner registration is not a form', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toContain('ayo-hero')
    expect(html).toContain('id="book"')
    expect(html).toContain('href="/signup"')
    expect(html).toContain('href="/login"')
    expect(html).toContain('Registration opens soon')
    expect(html).not.toMatch(/<form/i)
  })

  test('/login and /signup render accessible forms; /signup has exactly one form and no planner form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()

    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    expect(await page.locator('form').count()).toBe(1)
    await expect(page.getByText('Registration opens soon')).toBeVisible()
    await expect(page.locator('form')).not.toContainText(/planner/i)
    // No role control of any kind.
    expect(await page.locator('[name="role"], select, input[type=radio]').count()).toBe(0)
  })

  test('client-side validation blocks empty submissions and announces errors', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Enter the email address you registered with.')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  test('a submission with no backend configured shows a safe message, no crash, no cookie', async ({ page, context }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(CREDS.email)
    await page.getByLabel('Password').fill(CREDS.password)
    const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: 'Sign in' }).click()
    const response = await responsePromise
    expect(response.status()).toBe(503)
    await expect(page.locator('#login-error')).toHaveAttribute('role', 'alert')
    await expect(page.locator('#login-error')).toContainText('temporarily unavailable')
    const cookies = await context.cookies()
    expect(cookies.find((c) => c.name === 'ayo_session')).toBeUndefined()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  test('/account without a session redirects to /login', async ({ request }) => {
    const res = await request.get('/account', { maxRedirects: 0 })
    expect([302, 303, 307, 308]).toContain(res.status())
    expect(res.headers().location).toMatch(/\/login$/)
  })
})

test.describe('auth handlers over HTTP', () => {
  test('state-changing handlers refuse missing or foreign Origin with 403 and no Set-Cookie', async ({ request }) => {
    for (const path of ['/api/auth/login', '/api/auth/signup', '/api/auth/logout']) {
      const variants: Record<string, string>[] = [{}, { Origin: 'https://evil.example' }, { Origin: 'null' }, { Origin: ORIGIN, 'Sec-Fetch-Site': 'cross-site' }]
      for (const headers of variants) {
        const res = await request.post(path, { headers: { ...JSON_HEADERS, ...headers }, data: { ...CREDS, name: 'Jane' } })
        expect(res.status(), `${path} ${JSON.stringify(headers)}`).toBe(403)
        expect((await res.json()).error.code).toBe('invalid_origin')
        expect(res.headers()['set-cookie'], `${path} set-cookie`).toBeUndefined()
      }
    }
  })

  test('with a valid Origin, login fails safely without a backend (503, generic body, no cookie, no stack)', async ({ request }) => {
    const res = await request.post('/api/auth/login', { headers: { ...JSON_HEADERS, Origin: ORIGIN }, data: CREDS })
    expect(res.status()).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ok: false, error: { code: 'backend_unavailable', message: 'The service is temporarily unavailable. Please try again shortly.' } })
    expect(text).not.toMatch(/XANO|xano|stack|at \w+ \(/)
    expect(res.headers()['set-cookie']).toBeUndefined()
    expect(res.headers()['cache-control']).toBe('no-store')
  })

  test('signup refuses a client-supplied role before any backend call (400 even with no backend configured)', async ({ request }) => {
    for (const role of ['admin', 'staff', 'manager', 'event_planner', 'customer']) {
      const res = await request.post('/api/auth/signup', { headers: { ...JSON_HEADERS, Origin: ORIGIN }, data: { name: 'Jane', ...CREDS, role } })
      expect(res.status(), role).toBe(400)
      expect(res.headers()['set-cookie']).toBeUndefined()
    }
  })

  test('GET /api/auth/session never writes cookies', async ({ request }) => {
    const anon = await request.get('/api/auth/session')
    expect(anon.status()).toBe(200)
    expect(await anon.json()).toEqual({ authenticated: false })
    expect(anon.headers()['set-cookie']).toBeUndefined()

    const withCookie = await request.get('/api/auth/session', { headers: { Cookie: 'ayo_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl' } })
    expect(withCookie.status()).toBe(503) // no backend to verify against
    expect((await withCookie.json()).authenticated).toBe(false)
    expect(withCookie.headers()['set-cookie']).toBeUndefined()
  })

  test('logout with a valid Origin clears the cookie and does not claim revocation', async ({ request }) => {
    const res = await request.post('/api/auth/logout', { headers: { ...JSON_HEADERS, Origin: ORIGIN }, data: {} })
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ok: true })
    expect(text).not.toMatch(/revok/i)
    const setCookie = res.headers()['set-cookie'] ?? ''
    expect(setCookie).toMatch(/^ayo_session=;/)
    expect(setCookie).toMatch(/Max-Age=0/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Path=\//)
    expect(setCookie).toMatch(/SameSite=lax/i)
  })

  test('a link to /login?reason=expired cannot sign a visitor out; cleanup needs the server to see Xano reject the cookie', async ({ page, context }) => {
    // With no backend configured the server verdict is "unavailable", never
    // "rejected", so the cleanup must not fire whatever the URL says.
    await context.addCookies([{ name: 'ayo_session', value: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl', url: ORIGIN, httpOnly: true, sameSite: 'Lax' }])
    const logoutCalls: string[] = []
    page.on('request', (r) => {
      if (r.url().endsWith('/api/auth/logout')) logoutCalls.push(r.method())
    })
    for (const url of ['/login?reason=expired', '/login?expired=1&reason=expired', '/login']) {
      await page.goto(url)
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await page.waitForTimeout(500)
      await expect(page.getByText('Your session has ended. Please sign in again.')).toHaveCount(0)
    }
    expect(logoutCalls).toEqual([])
    const cookie = (await context.cookies()).find((c) => c.name === 'ayo_session')
    expect(cookie?.value).toBe('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE0fQ.c2lnbmF0dXJl')
  })

  test('oversized request bodies are refused with 413 before any backend call, without a cookie', async ({ request }) => {
    const big = JSON.stringify({ email: 'jane@example.com', password: 'password123', pad: 'a'.repeat(17 * 1024) })
    for (const path of ['/api/auth/login', '/api/auth/signup']) {
      const res = await request.post(path, { headers: { ...JSON_HEADERS, Origin: ORIGIN }, data: big })
      expect(res.status(), path).toBe(413)
      expect((await res.json()).error.code).toBe('request_too_large')
      expect(res.headers()['set-cookie']).toBeUndefined()
    }
  })

  test('no browser-visible response ever carries a token', async ({ request }) => {
    const responses = await Promise.all([
      request.post('/api/auth/login', { headers: { ...JSON_HEADERS, Origin: ORIGIN }, data: CREDS }),
      request.post('/api/auth/signup', { headers: { ...JSON_HEADERS, Origin: ORIGIN }, data: { name: 'Jane', ...CREDS } }),
      request.post('/api/auth/logout', { headers: { ...JSON_HEADERS, Origin: ORIGIN }, data: {} }),
      request.get('/api/auth/session'),
    ])
    for (const r of responses) {
      const text = await r.text()
      expect(text).not.toMatch(/authToken|Bearer |eyJ[A-Za-z0-9_-]{10,}/)
    }
  })
})

test.describe('phase boundary', () => {
  test('no password reset, planner signup or internal portal routes exist', async ({ request }) => {
    for (const path of ['/forgot-password', '/reset-password', '/signup/planner', '/.staff', '/.manager', '/.admin', '/staff', '/manager', '/admin', '/entry/staff', '/api/auth/signup/planner', '/api/auth/refresh']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(404)
    }
  })
})
