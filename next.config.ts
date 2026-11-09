import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the build rooted here; a stray lockfile higher up the tree otherwise
  // makes Turbopack guess a different workspace root.
  turbopack: { root: import.meta.dirname },
  // Do not generate AGENTS.md on `next dev`.
  agentRules: false,
  async headers() {
    return [
      {
        // The 239 hero frames never change in place: a re-encode is a new
        // commit and a new deploy. Let browsers keep them for a year.
        source: '/frames/:name*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Small (960x540) copies of the same frames, downloaded first so the
        // walkthrough moves before the full-size set has arrived.
        source: '/frames-sm/:name*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

export default nextConfig
