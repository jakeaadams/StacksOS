# StacksOS Competitor Refresh (2026-03-03)

This is a fresh parity check using current public/vendor sources to keep roadmap priorities grounded in evidence.

## Scope

- Commercial benchmarks: Polaris/Innovative (Vega), Surpass, Follett, Alma, OCLC, BiblioCommons.
- Open-source benchmarks: Evergreen, Koha, FOLIO.
- Discovery benchmark context: Aspen Discovery ecosystem signal.

## Fresh Findings (from official/public sources)

1. Modern discovery and patron UX remains a primary battleground.
   - Vega Discover emphasizes responsive discovery and engagement on top of Polaris.
   - BiblioCommons continues to position discovery + personalization as core public-library value.
2. Extensibility and integration platforms remain strongest in Alma/OCLC ecosystems.
   - Alma Developer APIs + Open Workflows are explicit platform differentiators.
   - OCLC WorldShare and WMS continue emphasizing broad integration surfaces.
3. K-12 and classroom workflows remain key in school-library competition.
   - Follett continues to position Destiny + Classroom Library Manager strongly for school use-cases.
   - Surpass continues to market school + classroom-oriented circulation simplicity.
4. Open-source peers (Koha/FOLIO/Evergreen) are still credible alternatives, but generally need stronger product-layer UX and implementation polish to match top commercial discovery experiences out of the box.

## Where StacksOS Is Strong

- End-to-end quality gate is green on current deployment path.
- Strong Evergreen boundary discipline (product layer in StacksOS, not Evergreen forking).
- Multi-profile product posture (public/school/church/academic/custom) with onboarding and tenant controls.
- Broad staff surface area with modern workflows and AI-assisted operations.
- Deterministic demo reset + seeded transactional data for sales and QA parity.

## Remaining Strategic Gaps for "World-Leader" Positioning

1. Proof, not assertion:
   - "Best UI/UX" requires recurring external comparative user studies (task success/time, SUS, adoption, CSAT).
2. Platform ecosystem depth:
   - Continue first-class webhook/workflow platform maturity and partner-facing API docs/examples.
3. AI reliability optics:
   - Keep fallback-rate and latency SLO reporting visible to operators; tighten alerting and runbooks.
4. Discovery differentiation:
   - Continue OPAC explainability, recommendation quality, and profile-specific discovery polish.
5. Migration conversion tooling:
   - Keep reducing migration friction from Polaris/Surpass/Koha/Sirsi/Follett with guided import/mapping playbooks and validation.

## Recommended Next 30-Day Focus

1. External UX benchmark sprint (measured tasks vs 2-3 competitor workflows).
2. Platform reliability scorecard publication (ops-status + SLO targets + incident drill cadence).
3. Migration wizard hardening with preflight diagnostics and correction guidance.
4. Profile-specific OPAC polish pass (school/church/academic differentiation beyond branding).

## Sources

- Innovative Vega Discover: https://www.iii.com/vega-discover/
- Innovative Vega Program (self-registration): https://www.iii.com/vega-program/
- Surpass Software: https://www.surpasssoftware.com/
- Surpass products: https://www.surpasssoftware.com/products/
- Follett Library Management: https://www.follettsoftware.com/library-management
- Follett Classroom Library Manager: https://www.follettsoftware.com/classroom-library-manager
- Ex Libris Alma Developer Network: https://developers.exlibrisgroup.com/alma/
- Ex Libris Open Workflows: https://developers.exlibrisgroup.com/alma/openworkflows/
- OCLC APIs (developer network): https://www.oclc.org/developer/api/oclc-apis.en.html
- OCLC WorldShare Management Services: https://www.oclc.org/en/worldshare-management-services.html
- BiblioCommons: https://www.bibliocommons.com/
- Evergreen download/release page: https://evergreen-ils.org/egdownloads/
- Koha manual: https://koha-community.org/manual/23.11/en/html/
- FOLIO project docs: https://docs.folio.org/
- Aspen ecosystem signal (librarytechnology listing): https://librarytechnology.org/product/aspen-discovery

## Notes

- Evergreen public download page currently surfaces 3.16.2 while recent project news has referenced later 3.16.x activity. Confirm target patch level directly against release notes before production upgrade scheduling.
- "World leader" should be treated as a continuous benchmark program with external evidence, not a one-time internal declaration.
