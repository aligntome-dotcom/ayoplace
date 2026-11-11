/**
 * Hero progress store (Phase P1).
 *
 * The scroll-sequence hero already computes one progress value per animation
 * frame inside its own requestAnimationFrame loop. This module makes that
 * value available to other client components (annotations, the cinematic
 * Book Now) without a second loop, a second scroll listener, React state or
 * any store library: the hero publishes, subscribers receive a plain object.
 *
 * Contract
 * - `p`           normalised scroll position through the hero track, 0..1,
 *                 clamped, unsmoothed: 0 at the top of the page, 1 when the
 *                 sticky viewport releases. Identical to the hero's internal
 *                 getProgress(). Use it for anything that must line up with
 *                 the scroll position itself (autoplay targets).
 * - `shownP`      the smoothed position the picture is actually at, 0..1,
 *                 i.e. (frame − 1) / 238 once the glide settles. Use it for
 *                 anything that must line up with the picture (annotations).
 * - `frame`       1-based frame currently shown by the glide, 1..239.
 * - `active`      true while the hero section intersects the viewport.
 *                 When false the other fields hold their last values.
 * - `trackStart`  document Y (px) where p = 0; `trackLength` the track's
 *                 scrollable length in px, so scrollY = trackStart + p × trackLength.
 *
 * Updates are published synchronously from inside the hero's animation frame,
 * only when something changed (frame, p beyond 0.0005, active, or the track
 * geometry), so a subscriber runs at most once per animation frame and never
 * when the page is still. Subscribers should write to the DOM directly and
 * must not set React state per update.
 *
 * Lifecycle: the hero publishes on every change while mounted and calls
 * resetHeroProgress() when it unmounts, which marks the state inactive and
 * notifies subscribers. subscribeHeroProgress() returns an unsubscribe
 * function; callers release it in their effect cleanup.
 */

export const HERO_FRAME_COUNT = 239

export interface HeroProgress {
  p: number
  shownP: number
  frame: number
  active: boolean
  trackStart: number
  trackLength: number
}

export type HeroProgressListener = (state: HeroProgress) => void

const INITIAL: HeroProgress = { p: 0, shownP: 0, frame: 1, active: false, trackStart: 0, trackLength: 0 }

let state: HeroProgress = INITIAL
const listeners = new Set<HeroProgressListener>()

/** Progress (0..1) at which a 1-based frame is shown. */
export const frameToProgress = (frame: number): number => (frame - 1) / (HERO_FRAME_COUNT - 1)

/** 1-based frame shown at progress p (0..1). */
export const progressToFrame = (p: number): number =>
  Math.round(Math.min(1, Math.max(0, p)) * (HERO_FRAME_COUNT - 1)) + 1

/** Latest published state (for late subscribers or one-off reads). */
export function getHeroProgress(): HeroProgress {
  return state
}

/**
 * Subscribe to progress updates. With `immediate` (default) the listener is
 * called once with the current state so it can paint its initial frame.
 */
export function subscribeHeroProgress(
  listener: HeroProgressListener,
  options: { immediate?: boolean } = {},
): () => void {
  listeners.add(listener)
  if (options.immediate !== false) safeCall(listener, state)
  return () => {
    listeners.delete(listener)
  }
}

/** Called by the hero only. */
export function publishHeroProgress(next: HeroProgress): void {
  state = next
  for (const listener of listeners) safeCall(listener, state)
}

/** Called by the hero on unmount: keep the last values, mark inactive. */
export function resetHeroProgress(): void {
  publishHeroProgress({ ...state, active: false })
}

/** Test helper: back to the initial state with no subscribers. */
export function __resetHeroProgressForTests(): void {
  state = INITIAL
  listeners.clear()
}

export function heroProgressListenerCount(): number {
  return listeners.size
}

function safeCall(listener: HeroProgressListener, value: HeroProgress): void {
  try {
    listener(value)
  } catch {
    // A failing subscriber must never break the hero's animation loop.
  }
}
