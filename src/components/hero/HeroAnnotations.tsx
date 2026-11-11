'use client'

import { useEffect, useRef } from 'react'
import { ANNOTATIONS, annotationPhase, type Annotation } from './annotations'
import { getHeroProgress, subscribeHeroProgress, type HeroProgress } from './heroProgress'
import './HeroAnnotations.css'

/**
 * The eight editorial annotations over the hero (Phase P2).
 *
 * Rendering: a fixed, pointer-transparent layer the size of the viewport
 * (the hero's sticky viewport is also the browser viewport), shown only
 * while the hero is on screen. It subscribes to the hero's own progress
 * store (no scroll listener, no animation loop of its own) and writes
 * opacity/transform straight to the DOM once per hero tick. Visibility is a
 * pure function of the displayed frame (`shownP`), so labels move with the
 * picture and reverse scrolling restores earlier states exactly.
 *
 * Accessibility: the visual layer is aria-hidden; the same eight messages
 * are rendered once, statically, in a visually hidden list for assistive
 * technology. No live region, nothing announced per frame.
 */
export function HeroAnnotations() {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const blocks = new Map<string, HTMLElement>()
    for (const el of Array.from(layer.querySelectorAll<HTMLElement>('[data-annotation]'))) {
      blocks.set(el.dataset.annotation!, el)
    }

    // Per-block last-applied state so untouched blocks cost nothing.
    const last = new Map<string, string>()

    const apply = (a: Annotation, frame: number, reduced: boolean) => {
      const el = blocks.get(a.id)
      if (!el) return
      const ph = annotationPhase(a, frame)
      const hidden = ph.visibility <= 0.001
      const key = hidden ? 'h' : `${ph.visibility.toFixed(3)}|${ph.heading.toFixed(3)}|${ph.text.toFixed(3)}|${ph.out.toFixed(3)}|${reduced ? 1 : 0}`
      if (last.get(a.id) === key) return
      last.set(a.id, key)

      if (hidden) {
        el.style.visibility = 'hidden'
        el.style.opacity = '0'
        return
      }
      el.style.visibility = 'visible'
      const leave = 1 - ph.out
      // Entrance: fade + 12 px rise (headline/support staggered); the gold
      // rule draws from the left. Exit: everything fades together with a
      // 6 px lift. Reduced motion: opacity only, rule already drawn.
      const rise = reduced ? 0 : 12
      const lift = reduced ? 0 : 6 * ph.out
      el.style.opacity = String(leave)
      const rule = el.querySelector<HTMLElement>('.ayo-note__rule')
      const heading = el.querySelector<HTMLElement>('.ayo-note__heading')
      const text = el.querySelector<HTMLElement>('.ayo-note__text')
      const eyebrow = el.querySelector<HTMLElement>('.ayo-note__eyebrow')
      if (rule) rule.style.transform = reduced ? 'none' : `scaleX(${ph.rule.toFixed(3)})`
      if (eyebrow) {
        eyebrow.style.opacity = String(ph.rule)
        eyebrow.style.transform = `translate3d(0, ${((1 - ph.rule) * rise - lift).toFixed(2)}px, 0)`
      }
      if (heading) {
        heading.style.opacity = String(ph.heading)
        heading.style.transform = `translate3d(0, ${((1 - ph.heading) * rise - lift).toFixed(2)}px, 0)`
      }
      if (text) {
        text.style.opacity = String(ph.text)
        text.style.transform = `translate3d(0, ${((1 - ph.text) * rise - lift).toFixed(2)}px, 0)`
      }
    }

    let lastLayerKey = ''
    const render = (s: HeroProgress) => {
      // Hide the whole layer when the hero is not on screen, and move it up
      // with the departing hero once the sticky viewport has released, so the
      // final block hands the eye down to the next section instead of
      // floating over it.
      const overshoot = s.trackLength > 0 ? Math.max(0, window.scrollY - (s.trackStart + s.trackLength)) : 0
      const offscreen = !s.active || overshoot >= window.innerHeight
      const layerKey = `${offscreen ? 'off' : 'on'}|${Math.round(overshoot)}`
      if (layerKey !== lastLayerKey) {
        lastLayerKey = layerKey
        layer.style.visibility = offscreen ? 'hidden' : 'visible'
        layer.style.transform = overshoot > 0 ? `translate3d(0, ${-Math.round(overshoot)}px, 0)` : 'none'
      }
      if (offscreen) return
      const frame = s.shownP * 238 + 1
      const reduced = reduce.matches
      for (const a of ANNOTATIONS) apply(a, frame, reduced)
    }

    const unsubscribe = subscribeHeroProgress(render) // immediate: paints the current state
    const onMotionChange = () => render(getHeroProgress())
    reduce.addEventListener('change', onMotionChange)
    return () => {
      unsubscribe()
      reduce.removeEventListener('change', onMotionChange)
    }
  }, [])

  return (
    <>
      <div ref={layerRef} className="ayo-notes" aria-hidden="true" style={{ visibility: 'hidden' }}>
        {ANNOTATIONS.map((a) => (
          <div
            key={a.id}
            className={`ayo-note ayo-note--${a.position} ayo-note--${a.tone}${a.caption ? ' ayo-note--caption' : ''}${a.desktopOnly ? ' ayo-note--desktop-only' : ''}`}
            data-annotation={a.id}
            style={{ visibility: 'hidden', opacity: 0 }}
          >
            <p className="ayo-note__eyebrow ayo-eyebrow">{a.eyebrow}</p>
            <span className="ayo-note__rule ayo-rule" />
            <p className="ayo-note__heading ayo-headline">{a.heading}</p>
            <p className="ayo-note__text ayo-body">{a.text}</p>
          </div>
        ))}
      </div>
      <section className="ayo-sr-only" aria-labelledby="ayo-notes-title">
        <h2 id="ayo-notes-title">About The Ayo Place</h2>
        <ul>
          {ANNOTATIONS.map((a) => (
            <li key={a.id}>
              <strong>{a.heading}</strong> {a.text}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
