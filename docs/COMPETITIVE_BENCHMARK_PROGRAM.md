# StacksOS Competitive Benchmark Program

This program defines how StacksOS maintains evidence-backed parity and differentiation against major ILS competitors.

## Objective

Provide recurring, source-backed proof of StacksOS product quality across:

- Discovery UX
- Staff workflow productivity
- AI reliability and usefulness
- Library-type flexibility (public, school, church, academic)
- Integration and extensibility depth

## Cadence

- Weekly: internal benchmark harness (`npm run audit:task-benchmark`) on VM/runtime.
- Monthly: competitor refresh using official vendor/project sources.
- Quarterly: external moderated user study (task time/success, SUS, CSAT).

## Evidence Inputs

- Runtime quality gates: lint, type-check, unit tests, E2E, OPAC audit, `run_all.sh`.
- Task benchmark artifacts: `audit/task-benchmark/`.
- UI drift artifacts: `audit/ui-drift/`.
- Competitor refresh report: `docs/WORLD_CLASS_COMPETITOR_REFRESH_2026-03-03.md` (rolling update).
- Evergreen architecture conformance checks (SoR boundary + footprint snapshots).

## Benchmark Dimensions

1. Discovery and OPAC
   - Search-to-hold completion time
   - Availability clarity at first glance
   - Scope/depth control comprehension
2. Staff workflows
   - Checkout/checkin/hold task completion time
   - Error recovery success
   - Onboarding/setup time for new tenant
3. AI operations
   - Fallback rate (hour/day)
   - p95 latency
   - User acceptance of AI drafts
4. Platform governance
   - Tenant/profile setup accuracy
   - Permissioning correctness
   - Auditability of sensitive mutations

## Source Policy

Use official sources first. Current baseline set:

- Innovative Vega Discover: https://www.iii.com/vega-discover/
- Surpass products and updates: https://www.surpasssoftware.com/products/ and https://www.surpasssoftware.com/whats-new/
- Follett Library Management: https://www.follettsoftware.com/library-management
- Ex Libris Alma developer platform: https://developers.exlibrisgroup.com/alma/
- OCLC WMS and API surface: https://www.oclc.org/en/worldshare-management-services.html and https://www.oclc.org/developer/api/oclc-apis.en.html
- Evergreen org hierarchy and OPAC behavior:
  - https://evergreen-ils.org/documentation/
  - https://docs.evergreen-ils.org/docs/latest/admin_initial_setup/1_describe_your_org.html
  - https://docs.evergreen-ils.org/docs/latest/admin_initial_setup/2_custom_org_unit_trees.html
  - https://docs.evergreen-ils.org/docs/latest/admin_public_services/public_access_catalog.html

## Output Artifacts

- Monthly competitor refresh update in `docs/WORLD_CLASS_COMPETITOR_REFRESH_YYYY-MM-DD.md`.
- Updated checklist status in `docs/WORLD_CLASS_EXECUTION_CHECKLIST_2026-02-25.md`.
- VM gate snapshot (commands + pass/fail) recorded in README/AGENTS/CLAUDE when behavior materially changes.

## Current Status (2026-03-03)

- Program established and linked to existing benchmark harnesses.
- Latest VM runtime gates are green:
  - `npm run lint -- --quiet`
  - `npm run type-check`
  - `npm run test:run` (331/331)
  - `npm run test:e2e` (81 passed, 5 skipped)
  - `BASE_URL=http://127.0.0.1:3000 bash audit/run_all.sh`
- External comparative user study remains open (requires live participants).
