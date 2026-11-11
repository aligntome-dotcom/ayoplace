import ScrollSequenceHero from '@/components/hero/ScrollSequenceHero.jsx'
import { HeroAnnotations } from '@/components/hero/HeroAnnotations'
import { Introduction } from '@/components/public/Introduction'
import { ScheduleTour } from '@/components/public/ScheduleTour'

export default function HomePage() {
  return (
    <main className="ayo-public">
      <ScrollSequenceHero />
      {/* Editorial annotations over the walkthrough; they read the hero's
          published progress and never touch its loop or assets. */}
      <HeroAnnotations />
      {/* Stage B: the editorial introduction, revealed as the hero releases.
          Its CONTINUE action scrolls to #book below. */}
      <Introduction />
      {/* Stage C: Schedule a Tour. Carries id="book" so the hero's "Book
          today" link and Stage B's CONTINUE land here. Leads only to the
          existing customer sign-up and sign-in. */}
      <ScheduleTour />
    </main>
  )
}
