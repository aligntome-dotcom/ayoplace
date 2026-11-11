# Stage B — the editorial introduction (Phase P3)

Files: `src/components/public/Introduction.tsx`, `Introduction.css`; mounted
in `src/app/page.tsx` between the hero annotations and the `#book` section.

## Content (design pages 1, 2 and 9)

Eyebrow AFTER THE WALKTHROUGH · heading "Two names, one celebration." ·
left column THE VENUE / The Ayo Place / "A family-owned venue in Grandville,
Michigan, named for the Yoruba word for joy." / "Where people gather." ·
gold divider · right column THE PLANNING COMPANION / Ayo *AI* / "A planning
companion for the people who celebrate here." / boxed PROVISIONAL · OWNER
CONFIRMATION REQUIRED "Enquire about dates, request quotes and keep every
detail of your event in one place." / "How the day gets planned." · closing
"One is a place. The other helps you plan what happens there." · CONTINUE ↓.

The provisional label is part of the markup (`role="note"`) and must stay
until the owner confirms the capability statement.

## Layout

Deep-ink field `--ayo-deep-ink` (#10161A) with a 160 px gradient from the
hero's ink at the top ("house lights dim"). `min-height: 100svh`, content
vertically centred, max width 1200 px. Padding 96/120 px desktop, 80/64 px
tablet, 72/28 px mobile. Rhythm: eyebrow → heading 24, heading → columns 72,
column eyebrow → name 24, name → text 24, text → caption 44, footer 72
(mobile 20 / 44 / 20 / 24 / 44). Desktop: two columns around a 1 px vertical
gold divider, 72 px gaps. Mobile: columns stack with 44 px between, the
divider becomes a horizontal 1 px line, the footer stacks.

Type: Cormorant Garamond 500 for the heading and the two names (`--font-
cormorant`), italic 500 for "AI" (`--font-cormorant-italic`, loaded in
`layout.tsx`, one file), Aboreto for eyebrows and CONTINUE, Jost for text.
Colours: ivory text on deep ink, gold eyebrow/divider/arrow/focus ring,
muted ivory (55 %) for labels and captions.

## Reveal

Server-rendered with `data-reveal="pending"`; a one-shot
`IntersectionObserver` (threshold 0, root margin −12 % at the bottom, so it
fires once the section's top edge is 12 % of the viewport in, on phones too)
sets `data-reveal="done"` when the section enters the viewport. CSS transitions then fade each `[data-reveal-item]`
0 → 1 and lift 16 px → 0 over 700 ms with a 110 ms stagger (`--i`), and the
divider draws (`scaleY` desktop, `scaleX` mobile) over 900 ms. Opacity and
transform only: no layout shift. Reduced motion: visible immediately, no
transition (CSS media query, and the component sets `done` at mount). No
JavaScript: a `<noscript>` style forces everything visible. There is no
animation loop and no scroll listener; the hero's progress mechanism is not
involved.

## CONTINUE

`<a href="#book">`. With JavaScript it calls `scrollIntoView` on `#book`
(smooth unless reduced motion) and pushes `#book` into the URL; without it
the browser follows the anchor. Today `#book` is the existing account-entry
section; P4 replaces that section with Stage C and keeps the id.
