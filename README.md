# The Ayo Place

Marketing site for The Ayo Place event venue. Next.js (App Router) + React + Tailwind CSS v4.

## Run

    npm install
    npm run dev       # local dev server on http://localhost:3000
    npm run build     # production build to .next/
    npm run start     # serve the production build
    npm run typecheck # tsc --noEmit
    npm run test:unit # node-only tests for the server-side modules (no browser, no server)
    npm run test:e2e  # Playwright hero + bundle checks (needs `npm run build` first; uses the installed Chrome)
    npm test          # both

## Backend configuration (server only)

The app talks to Xano from the server only. Copy `.env.example` to `.env.local`
(git-ignored) and set:

    XANO_BASE_URL=https://<instance-subdomain>.<cluster>.xano.io

Set the same variable in the Vercel project's environment settings. It must be
the instance origin only (https, no path, port or query); API group paths live
in `src/lib/xano/groups.ts`. Never use a `NEXT_PUBLIC_` prefix for it. The
value is read lazily, so a missing or malformed value surfaces as a
`ConfigError` when the first Xano call is made, not at build time.

Server modules (all begin with `import 'server-only'`, so Next refuses to bundle
them for the browser):

- `src/lib/server/env.ts` — validated `XANO_BASE_URL`.
- `src/lib/xano/groups.ts` — verified API group paths (authentication: `/api:QKPf7var`).
- `src/lib/xano/client.ts` — `xanoFetch`: JSON requests with optional Bearer token, 10 s timeout, no retries, no redirects, no logging; backend failures come back as a result whose `error.toSafe()` is the only shape meant for the browser.
- `src/lib/auth/cookies.ts` — the `ayo_session` HTTP-only cookie (Secure in production, SameSite=Lax, path `/`, 24 h to match the Xano token). Clearing it ends the browser session only; Xano has no revocation endpoint.
- `src/lib/auth/session.ts` — `verifySession`: a session counts as authenticated only when Xano accepts the cookie's token; the current-user call is injected and bound in a later step.

## What is here so far

- `src/app/layout.tsx` — root layout: metadata, viewport, Google Fonts links,
  first-frame preload and `globals.css` (formerly `index.html` + `index.css`).
- `src/app/page.tsx` — the public `/` page: the hero followed by a placeholder
  section (`id="book"`, the target of the hero's call-to-action).
- `src/components/hero/ScrollSequenceHero.jsx` — full-screen, scroll-scrubbed hero.
  239 frames in `public/frames/`, every native frame of the 10 s, 24 fps, 1080p walkthrough video, stored as 1920x1080 JPEG (~19 MB, streamed coarse-to-fine). Frames are decoded off the main thread with `createImageBitmap`: a sliding window of full-size frames follows the scroll position within a memory budget, and every 8th frame is kept at half size so fast scrubbing always has a nearby picture. They are drawn to a canvas; the frame shown is
  driven by scroll position, so scrolling down plays the walkthrough forward and
  scrolling up plays it in reverse. The canvas stays sticky until the last frame,
  then the page scrolls on normally. The hero copy and call-to-action fade out
  and recede along the Z axis as soon as scrolling starts.
- `next.config.ts` — immutable cache headers for `/frames/*`.
- `tests/hero.spec.ts` — Playwright checks for the hero (frames reachable, scroll-to-frame mapping, reverse playback, copy fade, no console errors).
- Everything below the hero is a placeholder until the rest of the site is designed.

## History

The pre-migration Vite implementation is preserved at the git tag `vite-baseline`
(commit `a982c2c`). `git checkout vite-baseline` restores it in full.

## Tuning the hero

Constants at the top of `ScrollSequenceHero.jsx`:

- `SCROLL_VH_DESKTOP` / `SCROLL_VH_MOBILE` — how many viewport heights of scroll
  the sequence spans (higher = slower, more controlled playback).
- `TEXT_FADE_END` — fraction of the sequence over which the copy fades away.
- `FRAME_COUNT` — number of frames in `public/frames/` (named `frame-001.jpg` …).
