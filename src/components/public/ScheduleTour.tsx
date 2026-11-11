'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import './ScheduleTour.css'

/**
 * Stage C — Schedule a Tour (Phase P4). Design: "The Ayo Place · Public
 * Experience", pages 1, 2 and 10. Off-white field ("the lights come back
 * up"), one primary action into the existing customer sign-up, a sign-in
 * link, three numbered steps, the venue's address and phone.
 *
 * The journey is conversion into a customer account, nothing more: creating
 * an account does not book or request a tour; the customer contacts the
 * venue from their account to arrange an in-person visit or a FaceTime
 * consultation. There is no form, calendar or request endpoint here.
 *
 * Carries id="book": the hero's "Book today" link and Stage B's CONTINUE
 * both land here.
 *
 * Reveal: same mechanism as Stage B (one-shot IntersectionObserver, CSS
 * transitions on opacity/transform only, reduced motion renders visible).
 */

export const STAGE_C_COPY = {
  eyebrow: 'Next step',
  heading: 'See the rooms for yourself.',
  lede: 'Create a customer account to get started with The Ayo Place. Once signed in, you can see your account details and contact our team to arrange an in-person visit or FaceTime consultation. Creating an account does not book or request a tour.',
  primary: { label: 'Schedule a tour', href: '/signup' },
  secondary: { prompt: 'Already have an account?', label: 'Sign in', href: '/login' },
  caption: 'Leads to customer sign-up. Nothing is booked or requested at this step.',
  steps: [
    { number: '01', title: 'Create your account', text: 'Register as a customer or sign in if you already have an account.' },
    { number: '02', title: 'Enter your customer account', text: 'See your account details once you are signed in.' },
    {
      number: '03',
      title: 'Arrange your visit',
      text: 'Contact The Ayo Place to discuss arranging an in-person visit or FaceTime consultation.',
    },
  ],
  address: '3055 Red Mill Avenue, Grandville, Michigan',
  phone: { display: '(616) 271-0155', href: 'tel:+16162710155' },
} as const

export function ScheduleTour() {
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

  const c = STAGE_C_COPY
  return (
    <section ref={sectionRef} id="book" className="ayo-tour" data-reveal="pending" aria-labelledby="ayo-tour-title">
      <noscript>
        <style>{`.ayo-tour [data-reveal-item] { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>
      <div className="ayo-tour__inner">
        <p className="ayo-tour__eyebrow ayo-eyebrow" data-reveal-item style={{ '--i': 0 } as React.CSSProperties}>
          {c.eyebrow}
        </p>
        <span className="ayo-tour__rule" aria-hidden="true" data-reveal-item style={{ '--i': 0 } as React.CSSProperties} />
        <h2 id="ayo-tour-title" className="ayo-tour__title" data-reveal-item style={{ '--i': 1 } as React.CSSProperties}>
          {c.heading}
        </h2>
        <p className="ayo-tour__lede ayo-body" data-reveal-item style={{ '--i': 2 } as React.CSSProperties}>
          {c.lede}
        </p>

        <div className="ayo-tour__actions" data-reveal-item style={{ '--i': 3 } as React.CSSProperties}>
          <Link href={c.primary.href} className="ayo-tour__primary ayo-button-label">
            {c.primary.label}
          </Link>
          <p className="ayo-tour__secondary">
            {c.secondary.prompt}{' '}
            <Link href={c.secondary.href} className="ayo-tour__link">
              {c.secondary.label}
            </Link>
          </p>
        </div>
        <p className="ayo-tour__caption" data-reveal-item style={{ '--i': 3 } as React.CSSProperties}>
          {c.caption}
        </p>

        <ol className="ayo-tour__steps" data-reveal-item style={{ '--i': 4 } as React.CSSProperties}>
          {c.steps.map((s) => (
            <li key={s.number} className="ayo-tour__step">
              <span className="ayo-tour__step-number ayo-eyebrow" aria-hidden="true">
                {s.number}
              </span>
              <h3 className="ayo-tour__step-title">{s.title}</h3>
              <p className="ayo-tour__step-text">{s.text}</p>
            </li>
          ))}
        </ol>

        <p className="ayo-tour__contact" data-reveal-item style={{ '--i': 5 } as React.CSSProperties}>
          <span>{c.address}</span>
          <span className="ayo-tour__dot" aria-hidden="true">
            ·
          </span>
          <a href={c.phone.href} className="ayo-tour__phone">
            {c.phone.display}
          </a>
        </p>
      </div>
    </section>
  )
}
