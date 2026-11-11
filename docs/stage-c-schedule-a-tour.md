# Stage C — Schedule a Tour (Phase P4)

Files: `src/components/public/ScheduleTour.tsx`, `ScheduleTour.css`; mounted
last in `src/app/page.tsx`, replacing the former `AccountEntry` section
(Customers / Event planners cards), and carrying its `id="book"` so the
hero's "Book today" link and Stage B's CONTINUE still land here.

## Journey (confirmed, and what the page says)

1. Visitor reaches Stage C.
2. SCHEDULE A TOUR → the existing `/signup` (customer sign-up). "Already
   have an account? Sign in" → the existing `/login`.
3. The existing forms and handlers create the account or sign the customer
   in; success continues to the existing `/account`.
4. The customer contacts The Ayo Place, phone (616) 271-0155, to arrange an
   in-person visit or a FaceTime consultation.

Creating an account does not book or request a tour. There is no form,
calendar, request endpoint, confirmation or availability here: the section
contains exactly three links (sign-up, sign-in, telephone).

## Copy (design page 10, with two accuracy corrections)

The design's lede says the account "gives you access to your customer
planning space" and step 02 reads "Enter your customer space · Access your
customer planning experience." The account page today shows name, email,
account type and logout only, so, per the P4 brief, the lede uses the
confirmed wording ("Once signed in, you can see your account details and
contact our team to arrange an in-person visit or FaceTime consultation")
and step 02 reads "Enter your customer account · See your account details
once you are signed in." Everything else is verbatim: eyebrow NEXT STEP,
"See the rooms for yourself.", "Creating an account does not book or request
a tour.", the caption, steps 01 and 03, the address and phone line.

## Layout and tokens

Off-white field `--ayo-offwhite` with a soft grey wash at the top ("the
lights come back up"); centred composition, max width 1000 px; padding
96/120 desktop, 80/64 tablet, 72/28 mobile; rhythm 24 / 44 / 72. Eyebrow in
Aboreto (slate) with a 32 × 1 gold rule; headline Cormorant Garamond 500 in
ink; lede Jost in slate; primary action an ink block button, Jost 500
uppercase 0.14 em, 56 px tall (full width on mobile), slate on hover; text
link with a gold underline that turns ink on hover; gold 2 px focus ring at
3 px offset on every interactive element; steps in a 3-column grid above a
hairline (stacked on mobile) with gold numbers and Cormorant titles;
address and telephone link last. Touch targets ≥ 44 px.

## Reveal

Same mechanism as Stage B: `data-reveal="pending"` → `done` on a one-shot
IntersectionObserver (top edge 12 % in); opacity/transform transitions only,
staggered by `--i`; reduced motion visible with no transition; `<noscript>`
fallback. No loop, no scroll listener.
