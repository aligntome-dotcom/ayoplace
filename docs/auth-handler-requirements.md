# Requirements for authentication Route Handlers (Phase 2B-2)

These rules apply to every Route Handler or Server Action that signs a user
in, signs them out, registers an account, or otherwise changes state. They
were fixed during the Phase 2B-1 hardening so that the handlers built next can
follow them exactly. No handler exists yet.

## 1. Origin validation on every state-changing request

- Call `checkRequestOrigin(request.headers, APP_ORIGIN)` from
  `src/lib/auth/origin.ts` before reading the body, before calling Xano and
  before touching any cookie. Anything other than `{ ok: true }` is answered
  with HTTP 403 and a generic body, and nothing else happens.
- `APP_ORIGIN` is configuration, not something read from the request. Phase
  2B-2 introduces it as a server-only environment variable (for example
  `APP_ORIGIN=https://www.theayoplace.com`, with the preview deployment's own
  origin set per Vercel environment). It is never derived from `Host` or
  `X-Forwarded-Host`.
- The helper requires an exact `Origin` match, falls back to the `Referer`
  origin only when `Origin` is absent, and vetoes any request whose
  `Sec-Fetch-Site` is `cross-site`. `Sec-Fetch-Site` is never the sole check:
  not every client sends it.
- Server Actions get an equivalent Origin-versus-Host check from Next itself;
  Route Handlers do not, which is why the helper is mandatory there.

## 2. Methods and cookies

- GET and HEAD handlers never create, update or clear the session cookie and
  never change state. SameSite=Lax sends the cookie on top-level GET
  navigations, so a GET that mutated would be reachable cross-site.
- Login and signup handlers set the cookie only after Xano has answered the
  sign-in with HTTP 200 and the current-user check has passed. The cookie value
  must pass `isWellFormedToken`; `setSessionCookie` enforces this.
- The login handler also runs the Origin check (login CSRF: an attacker must
  not be able to sign the victim into the attacker's account).
- The logout handler clears the cookie (`clearSessionCookie`) and runs the
  Origin check. Clearing the cookie ends the browser session only; it is not a
  server-side revocation. Xano has no revocation endpoint, and the token stays
  valid there until it expires or the account becomes ineligible.
- When `verifySession` returns `rejected`, the next Route Handler or Server
  Action in the flow clears the cookie. Server Components cannot write cookies
  and must not try.

## 3. What never changes

- `HttpOnly`, `Secure` in production, `SameSite=Lax` and `Path=/` on the
  session cookie stay as they are.
- The raw Xano token never appears in a response body, in page props, in
  client state, in a `NEXT_PUBLIC_` variable or in a client bundle.
  `tests/bundle.spec.ts` checks the bundle; re-run it after the first importer
  of `src/lib` lands.
- Failures returned to the browser use `XanoError.toSafe()` or the generic
  messages above. Results from `xanoFetch` are never returned as-is to the
  client; the error inside them serialises safely, but the handler should still
  build its own response.

## 4. How a login handler uses this (shape only)

```
POST /api/auth/login
  1. checkRequestOrigin(request.headers, APP_ORIGIN)  → 403 on failure
  2. parse and validate the JSON body (email, password)
  3. xanoFetch(login operation)                       → generic failure on !ok
  4. xanoFetch(current-user operation, token)         → generic failure on !ok
  5. validate the current-user response against the verified contract;
     check role for the door being used; check is_active
  6. setSessionCookie(token)
  7. respond with a minimal JSON body that contains no token
```

Step 5's contract and the exact endpoint paths come from the verified Xano
audit, not from this document.
