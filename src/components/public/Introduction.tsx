'use client'

import { useEffect, useRef, type MouseEvent } from 'react'
import './Introduction.css'

/**
 * Stage B — the editorial introduction (Phase P3). Design: "The Ayo Place ·
 * Public Experience", pages 1, 2 and 9. Two names on a deep-ink field: the
 * venue and the planning companion, separated by a gold divider, with the
 * Ayo AI capability statement boxed and labelled provisional.
 *
 * Reveal: the section is server-rendered with data-reveal="pending"; once it
 * enters the viewport (IntersectionObserver, one shot) it becomes "done" and
 * CSS transitions fade and lift each item in a short stagger. Reduced motion
 * renders everything visible with no transition; without JavaScript a
 * <noscript> style does the same. No animation loop, no scroll listener.
 *
 * CONTINUE scrolls to the beginning of Stage C (#book) and nothing else.
 */

export const STAGE_B_COPY = {
  eyebrow: 'After the walkthrough',
  heading: 'Two names, one celebration.',
  venue: {
    eyebrow: 'The venue',
    name: 'The Ayo Place',
    text: 'A family-owned venue in Grandville, Michigan, named for the Yoruba word for joy.',
    caption: 'Where people gather.',
  },
  companion: {
    eyebrow: 'The planning companion',
    nameLead: 'Ayo',
    nameEmphasis: 'AI',
    text: 'A planning companion for the people who celebrate here.',
    provisionalLabel: 'Provisional · Owner confirmation required',
    provisionalText: 'Enquire about dates, request quotes and keep every detail of your event in one place.',
    caption: 'How the day gets planned.',
  },
  closing: 'One is a place. The other helps you plan what happens there.',
  continueLabel: 'Continue',
  continueTarget: '#book',
} as const

export function Introduction() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const reveal = () => section.setAttribute('data-reveal', 'done')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduce.matches || typeof IntersectionObserver === 'undefined') {
      reveal()
      return
    }
    // Fire as soon as the section's top edge is 12 % of the viewport in. A
    // fraction-of-section threshold would wait far longer on phones, where the
    // stacked section is taller than the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          reveal()
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin: '0px 0px -12% 0px' },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const onContinue = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.querySelector<HTMLElement>(STAGE_B_COPY.continueTarget)
    if (!target) return // plain anchor behaviour
    event.preventDefault()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    history.pushState(null, '', STAGE_B_COPY.continueTarget)
  }

  const c = STAGE_B_COPY
  return (
    <section
      ref={sectionRef}
      id="introduction"
      className="ayo-intro"
      data-reveal="pending"
      aria-labelledby="ayo-intro-title"
    >
      <noscript>
        <style>{`.ayo-intro [data-reveal-item], .ayo-intro__divider { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>
      <div className="ayo-intro__inner">
        <p className="ayo-intro__eyebrow ayo-eyebrow" data-reveal-item style={{ '--i': 0 } as React.CSSProperties}>
          {c.eyebrow}
        </p>
        <h2 id="ayo-intro-title" className="ayo-intro__title" data-reveal-item style={{ '--i': 1 } as React.CSSProperties}>
          {c.heading}
        </h2>

        <div className="ayo-intro__columns">
          <div className="ayo-intro__column" data-reveal-item style={{ '--i': 2 } as React.CSSProperties}>
            <p className="ayo-intro__label ayo-eyebrow">{c.venue.eyebrow}</p>
            <p className="ayo-intro__name">{c.venue.name}</p>
            <p className="ayo-intro__text ayo-body">{c.venue.text}</p>
            <p className="ayo-intro__caption">{c.venue.caption}</p>
          </div>

          <span className="ayo-intro__divider" aria-hidden="true" />

          <div className="ayo-intro__column" data-reveal-item style={{ '--i': 3 } as React.CSSProperties}>
            <p className="ayo-intro__label ayo-eyebrow">{c.companion.eyebrow}</p>
            <p className="ayo-intro__name">
              {c.companion.nameLead} <em className="ayo-intro__em">{c.companion.nameEmphasis}</em>
            </p>
            <p className="ayo-intro__text ayo-body">{c.companion.text}</p>
            <div className="ayo-intro__provisional" role="note" aria-label="Provisional capability statement">
              <p className="ayo-intro__provisional-label ayo-eyebrow">{c.companion.provisionalLabel}</p>
              <p className="ayo-intro__provisional-text">{c.companion.provisionalText}</p>
            </div>
            <p className="ayo-intro__caption">{c.companion.caption}</p>
          </div>
        </div>

        <div className="ayo-intro__footer" data-reveal-item style={{ '--i': 4 } as React.CSSProperties}>
          <p className="ayo-intro__closing">{c.closing}</p>
          <a href={c.continueTarget} className="ayo-intro__continue" onClick={onContinue}>
            <span className="ayo-eyebrow">{c.continueLabel}</span>
            <span className="ayo-intro__arrow" aria-hidden="true">
              ↓
            </span>
          </a>
        </div>
      </div>
    </section>
  )
}
