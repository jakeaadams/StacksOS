# OPAC Competitor Research (Discovery + Kids Reading)

Date: 2026-02-04

Scope:
- Public discovery layers (OPAC) commonly paired with ILS systems
- Patron self-service expectations (“My Account”)
- Kids reading experiences (reading logs, challenges, badges)

## Competitors reviewed

Discovery / OPAC:
- Aspen Discovery (ByWater Solutions)
- BiblioCommons
- SirsiDynix Enterprise
- VuFind (open source)

Kids reading / engagement:
- Beanstack (reading challenges + logging)

## Table-stakes UX patterns (what “modern OPAC” means in 2026)

Search + discovery:
- Fast keyword search with sensible defaults + typo tolerance.
- Facets that feel instant (Format, Availability, Audience, Language, Pub Date, Location/Branch).
- Strong result cards: cover art, format badges, availability, rating/reviews, quick actions.
- Strong record detail: clear availability by location, “place hold” CTA, similar titles, subject chips.
- “Browse” experiences: staff picks, lists, new titles, popular, curated collections.

Account:
- Clear status dashboard (checkouts, due dates + renew, holds + queue position, fines).
- Notifications/messages.
- Lists (booklists) and easy saving/sharing.
- Reading history (opt-in) and privacy controls.

Quality:
- Mobile-first, accessible keyboard nav, high contrast, resilient loading states.
- Clear “what happened” errors (no silent failures).

## Differentiators worth aiming for (“world-class”)

- Explainable smart ranking (“Why this result?”).
- Personalization controls: “My branch”, preferred formats, opt-in taste profile.
- Beautiful empty states and onboarding (first run, logged-out to logged-in).
- Kids experience that’s delightful but not chaotic:
  - Reading streaks, badges, challenges
  - Parent/guardian mode (optional) and privacy-safe defaults
  - Accessibility (dyslexia-friendly typography option, large targets)

## Gaps/Opportunities for StacksOS OPAC + Kids

High-impact polish (UX):
- Normalize visual language across OPAC + Kids (spacing, typography, nav patterns, iconography).
- Ensure the same “design system” components are reused (cards, chips, buttons, skeletons).
- Reduce “emoji UI” in core navigation; keep playful touches where appropriate.

High-impact capability:
- Make facets and “availability by branch” feel first-class.
- Ensure record detail has:
  - Clear “Available now at…” summary
  - “Place hold” flow that remembers pickup location
  - Similar titles + subject browse
- Kids reading:
  - Consistent “My Stuff” with reading log, streak, badges
  - Clear progress visualization and shareable achievements (optional)

---

## Next: “World-class OPAC” execution backlog

Canonical backlog lives in:
- `StacksOS-Execution-Backlog.md`
- mirrored in `docs/StacksOS-Execution-Backlog.md`

This doc stays “discovery + notes”. The next step is turning the patterns above into feature-flagged execution items.

### Prioritized epics (feature-flagged)

P0 / high-impact (ship first):
- **P2-5**: OPAC world-class search + facets v2 (`featureFlags.opacFacetsV2`)
- **P2-6**: OPAC holds UX v2 (`featureFlags.opacHoldsUXV2`)
- **P2-7**: OPAC browse + lists (`featureFlags.opacBrowseV2`, `featureFlags.opacLists`)

Kids engagement:
- **P2-8**: Kids experience v1 (reading log + streaks + badges + challenges) (`featureFlags.opacKids`, `featureFlags.kidsEngagementV1`)

Notes:
- Every epic must preserve StacksOS rules: no dead UI, no fake saves, accessible keyboard path, auditable state changes.
- All new OPAC/Kids work should default to **off** behind `NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1` until it is end-to-end complete.
