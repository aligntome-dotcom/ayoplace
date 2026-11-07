import ScrollSequenceHero from '@/components/hero/ScrollSequenceHero.jsx'

export default function HomePage() {
  return (
    <main>
      <ScrollSequenceHero />

      {/* Placeholder so the page keeps scrolling normally after the sequence.
          It carries id="book" so the hero's "Book today" link lands here until
          the account-entry section replaces it in a later phase. */}
      <section id="book" className="min-h-screen bg-[var(--ayo-paper)] px-6 py-24 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">
            Next section
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            The rest of the page continues here.
          </h2>
          <p className="mt-4 max-w-xl text-neutral-600">
            This block only exists so the hero has somewhere to hand off to.
            Content for the venue, gallery, pricing and contact will replace it.
          </p>
        </div>
      </section>
    </main>
  )
}
