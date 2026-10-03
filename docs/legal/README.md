# Legal pages

The Terms, Refund and Privacy pages live in the app: `src/features/legal.tsx`
(served at /terms, /refund, /privacy; pricing at /pricing).

Seller details (name, country, address, support email, date, consent age, payment processor)
are set in one place: `src/lib/legal.ts`. Values in [brackets] are placeholders and are
highlighted on the pages until they are filled in.

These texts are not legal advice; have them checked before relying on them.
