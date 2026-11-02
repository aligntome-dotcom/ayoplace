# The Ayo Place

Marketing site for The Ayo Place event venue. React + Vite + Tailwind.

## Run

    npm install
    npm run dev       # local dev server
    npm run build     # production build to dist/
    npm run preview   # serve the production build

## What is here so far

- `src/components/ScrollSequenceHero.jsx` — full-screen, scroll-scrubbed hero.
  300 JPEG frames in `public/frames/` are drawn to a canvas; the frame shown is
  driven by scroll position, so scrolling down plays the walkthrough forward and
  scrolling up plays it in reverse. The canvas stays sticky until the last frame,
  then the page scrolls on normally. The hero copy and call-to-action fade out
  and recede along the Z axis as soon as scrolling starts.
- Everything below the hero is a placeholder until the rest of the site is designed.

## Tuning the hero

Constants at the top of `ScrollSequenceHero.jsx`:

- `SCROLL_VH_DESKTOP` / `SCROLL_VH_MOBILE` — how many viewport heights of scroll
  the sequence spans (higher = slower, more controlled playback).
- `TEXT_FADE_END` — fraction of the sequence over which the copy fades away.
- `FRAME_COUNT` — number of frames in `public/frames/` (named `frame-001.jpg` …).
