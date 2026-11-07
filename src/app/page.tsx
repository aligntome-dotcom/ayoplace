import ScrollSequenceHero from '@/components/hero/ScrollSequenceHero.jsx'
import { AccountEntry } from '@/components/public/AccountEntry'

export default function HomePage() {
  return (
    <main>
      <ScrollSequenceHero />
      {/* Account entry follows the complete hero scroll; it carries id="book"
          so the hero's "Book today" link lands here. */}
      <AccountEntry />
    </main>
  )
}
