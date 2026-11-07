# The Ayo Place

Marketing site for The Ayo Place event venue. Next.js (App Router) + React + Tailwind CSS v4.

## Run

    npm install
    npm run dev       # local dev server on http://localhost:3000
    npm run build     # production build to .next/
    npm run start     # serve the production build
    npm run typecheck # tsc --noEmit
    npm test          # Playwright hero checks (needs `npm run build` first; uses the installed Chrome)

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
