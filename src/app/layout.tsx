import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

// Reproduces the <head> of the former Vite index.html.
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Great+Vibes&family=Cormorant+Garamond:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* First hero frame: fetched as a blob by the hero, so preload as fetch, not image. */}
        <link rel="preload" as="fetch" crossOrigin="anonymous" href="/frames/frame-001.jpg" />
      </head>
      <body>{children}</body>
    </html>
  )
}
