import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Aboreto, Cormorant_Garamond, Great_Vibes, Jost } from 'next/font/google'
import './globals.css'

// Approved public-experience typography, self-hosted at build time by
// next/font (no request to Google at runtime, no Referer leak, metric-matched
// fallbacks against layout shift). Each family is exposed only as a CSS
// variable; nothing is applied globally, so existing screens keep their
// system stack until a component opts in.
//
// - Great Vibes 400: hero title only (ScrollSequenceHero.css), unchanged.
// - Cormorant Garamond 500/600: hero lede and CTA today; editorial headlines
//   in later phases. Italic 500 (one file) is added when Stage B needs it.
// - Aboreto 400: eyebrows and small display labels (later phases).
// - Jost 400/500: body copy and interface elements of the public sections.
const greatVibes = Great_Vibes({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-great-vibes' })
const cormorant = Cormorant_Garamond({
  weight: ['500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-cormorant',
})
// Italic 500 only (one file): the emphasised word in "Ayo AI" (Stage B).
const cormorantItalic = Cormorant_Garamond({
  weight: '500',
  style: 'italic',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-cormorant-italic',
})
const aboreto = Aboreto({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-aboreto' })
const jost = Jost({ weight: ['400', '500'], subsets: ['latin'], display: 'swap', variable: '--font-jost' })

export const metadata: Metadata = {
  title: 'The Ayo Place',
  description: 'The Ayo Place — a modern event venue for weddings, celebrations and gatherings.',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${greatVibes.variable} ${cormorant.variable} ${cormorantItalic.variable} ${aboreto.variable} ${jost.variable}`}
    >
      <head>
        {/* First hero frame: fetched as a blob by the hero, so preload as fetch, not image. */}
        <link rel="preload" as="fetch" crossOrigin="anonymous" href="/frames/frame-001.jpg" />
      </head>
      <body>{children}</body>
    </html>
  )
}
