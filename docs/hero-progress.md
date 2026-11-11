# Hero progress contract (Phase P1)

The scroll-sequence hero (`src/components/hero/ScrollSequenceHero.jsx`) is the
single source of truth for how far a visitor is through the walkthrough. It
computes progress once per animation frame from its section's bounding rect
(`getProgress()`), smooths it into the frame actually drawn, and publishes
both through `src/components/hero/heroProgress.ts`. Nothing else measures
scroll, and nothing else runs an animation loop for the hero.

## Values

| Field | Type | Meaning |
|---|---|---|
| `p` | number 0..1 | Normalised scroll position through the hero track, clamped, **unsmoothed**: 0 at the top of the page, 1 when the sticky viewport releases. Equals `(scrollY − trackStart) / trackLength`. |
| `shownP` | number 0..1 | The smoothed position the picture is actually at: `(frame − 1) / 238`. Lags `p` by the glide (time constant 0.12 s, max 3 frames per animation frame, waits for decoded frames). |
| `frame` | integer 1..239 | The 1-based frame currently shown. Same value as the canvas `data-frame` attribute. |
| `active` | boolean | True while the hero section intersects the viewport. False before mount, after unmount, and when the hero is scrolled fully out of view; the other fields then hold their last values. |
| `trackStart` | px | Document Y at which `p = 0` (the section's top). |
| `trackLength` | px | Section height minus viewport height; the scroll distance that maps to 0..1. |

Helpers: `frameToProgress(frame)` → `(frame − 1) / 238`; `progressToFrame(p)` →
`round(p × 238) + 1`; `HERO_FRAME_COUNT = 239`.

Which value to use:

- **Annotations** follow `shownP` / `frame`, so they move with the picture
  and never lead it during the glide.
- **Autoplay** (later phase) drives `window.scrollTo(0, trackStart + p × trackLength)`
  and reads `p` back; because it changes the real scroll position, the hero,
  the annotations and any other subscriber stay consistent by construction,
  and interrupting it needs no clean-up.

## Subscribing

```ts
import { subscribeHeroProgress, getHeroProgress } from '@/components/hero/heroProgress'

useEffect(() => {
  const unsubscribe = subscribeHeroProgress((s) => {
    // DOM writes only. Never setState here.
    el.style.opacity = String(visibility(s.shownP))
  })
  return unsubscribe
}, [])
```

- `subscribeHeroProgress(listener, { immediate = true })` calls the listener
  once with the current state (so a component mounted mid-scroll paints the
  right frame), then on every change. It returns the unsubscribe function.
- `getHeroProgress()` returns the latest state for one-off reads.
- Listeners run synchronously inside the hero's `requestAnimationFrame`
  callback, after the frame for that tick has been chosen. A listener that
  throws is isolated (`try/catch`) and cannot stop the hero.

## When updates fire

The hero calls `publishHeroProgress` only when something changed since the
last publication: the shown frame, `active`, the track geometry, or `p` by
more than 0.0005. At rest nothing is published, so a page that is not being
scrolled costs subscribers nothing. During scrolling a subscriber is called at
most once per animation frame.

## Lifecycle and cleanup

- Mount: the hero's effect starts its loop; the first tick publishes.
- Unmount: the effect cleanup calls `resetHeroProgress()`, which republishes
  the last state with `active: false`. Subscribers decide what to do with an
  inactive hero (annotations hide; autoplay stops).
- Subscribers remove themselves with the returned function in their own
  effect cleanup. The store holds no DOM references and no timers.
- Tests: `__resetHeroProgressForTests()` clears state and listeners.

## Why no React state

Progress changes up to 60–120 times a second. Re-rendering components at that
rate would compete with the hero's decode budget on the main thread. The
store is a plain module with a `Set` of callbacks; consumers write styles
straight to the DOM, which is how the hero itself fades its own copy.

## What P1 did not change

The hero's frame order, loading and decoding, smoothing, mobile/touch
behaviour, markup, copy and styles are unchanged except that its three
`font-family` declarations now read the same families through `next/font`
CSS variables (`--font-great-vibes`, `--font-cormorant`) with the original
literal names as fallbacks.
