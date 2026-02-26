# Open-Source ILS/LSP Comparison (Fresh Check: 2026-02-25)

## Purpose

Answer three practical questions:

1. Which open-source library systems should StacksOS benchmark against?
2. Should each system run on separate VMs for serious evaluation?
3. How should StacksOS stay "overlay-first" so Evergreen upgrades remain low-risk?

---

## Fresh Source Signals (as of 2026-02-25)

### Evergreen

- Evergreen project announcement stream shows **3.16.3 released on 2026-01-21** (with 3.15.9 in the same announcement).
- Evergreen downloads page still frames the **3.16 series** as recommended for new installs, reinforcing that announcement pages and downloads pages can differ in point-release visibility.
- Evergreen OPAC docs explicitly preserve `locg` and `copy_depth` in permalinks, confirming scope/depth is a first-class behavior in Evergreen search UX.

### Koha

- Koha dashboard shows active maintained release lines including **25.11.x** and **25.05.x**, and latest package entries such as **25.11.01-2 (2026-01-30)**.
- Koha remains mature for full ILS usage and has broad admin/documentation depth.

### FOLIO

- FOLIO docs continue to publish release support windows (for example Sunflower R1 2025 support through 2026-06-30), with explicit EOL guidance.
- Operational complexity remains higher than Evergreen/Koha for smaller teams.

### Commercial parity signals (for StacksOS product targeting)

- Polaris documentation confirms branch-configurable online self-registration, temporary barcodes, and verify-block review workflow.
- Surpass product pages highlight packaged self-check, family features, reading-program metadata support, and K-12/church-oriented plan segmentation.
- Follett positions Destiny Resource Manager + Classroom Library Manager + Destiny AI as a K-12 workflow suite (resource lifecycle + classroom operations + AI reporting/automation posture).

### Discovery-Layer Open Source (market context)

- Aspen Discovery and VuFind remain relevant open-source discovery alternatives used on top of ILS backends.
  - Aspen project messaging emphasizes unified cross-format discovery + ILS/eContent integrations.
  - VuFind project messaging emphasizes highly customizable, standards-oriented discovery across catalog/journal/digital collections.
- This reinforces your all-in-one product strategy goal: StacksOS should be strong enough that clients do not need an extra discovery purchase.

---

## What to Benchmark (Primary Systems)

For backend parity and architecture intelligence:

- Evergreen
- Koha
- FOLIO

For discovery UX benchmark context:

- Aspen Discovery
- VuFind

---

## VM Guidance (Direct answer)

### Quick experimentation

You can run multiple systems on one large host if isolated (containers/ports/network namespaces), but this is only for rough exploration.

### Serious parity/performance/security evaluation

Use separate VMs (or strictly isolated dedicated hosts) per system.

Why:

- avoids dependency and port collisions,
- keeps latency/perf numbers clean,
- avoids accidental cross-system data leakage,
- makes incident debugging and capacity planning credible.

---

## StacksOS Architecture Decision

Keep one StacksOS codebase and profile-driven behavior:

- `public`
- `school`
- `church`
- `academic`
- `custom`

Do not create separate product forks per library type.

Keep Evergreen as system-of-record while StacksOS owns:

- UI/UX,
- workflows,
- onboarding,
- SaaS governance,
- AI assistant behavior,
- discovery differentiation.

---

## Upgrade-Safe Boundary Rules

1. Keep Evergreen source tree as vendor-stock as possible.
2. Keep StacksOS product persistence in `library.*` where feasible.
3. Record unavoidable Evergreen core writes explicitly (what/why/rollback).
4. Run footprint snapshots before/after Evergreen upgrades:
   - `npm run evergreen:footprint -- --label before-upgrade`
   - `npm run evergreen:footprint -- --label after-upgrade`

---

## Official Sources

- Evergreen project news: <https://evergreen-ils.org/>
- Evergreen downloads: <https://evergreen-ils.org/egdownloads/>
- Evergreen OPAC usage docs: <https://docs.evergreen-ils.org/docs/latest/opac/using_the_public_access_catalog.html>
- Evergreen install docs: <https://docs.evergreen-ils.org/docs/latest/install/install.html>
- Evergreen workstation docs: <https://docs.evergreen-ils.org/docs/latest/admin_initial_setup/workstations.html>
- Koha project dashboard (release links): <https://dashboard.koha-community.org/>
- Koha documentation portal: <https://koha-community.org/documentation/>
- FOLIO support windows: <https://docs.folio.org/docs/about-folio/support/>
- FOLIO platform-complete repo: <https://github.com/folio-org/platform-complete>
- Polaris self-registration docs: <https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Public_Access_Admin/PDOPatAcc/Set_up_online_patron_self-registration.htm>
- Surpass products: <https://surpasssoftware.com/products/>
- Follett library suite: <https://follettsoftware.com/library-suite/destiny-library-manager/>
- Follett Destiny AI announcement: <https://follettsoftware.com/news/follett-software-unveils-destiny-ai-revolutionizing-library-management/>
- Aspen overview: <https://www.equinoxoli.org/products/aspen-discovery/>
- Aspen source repository: <https://github.com/Aspen-Discovery/aspen-discovery>
- VuFind source repository: <https://github.com/vufind-org/vufind>
