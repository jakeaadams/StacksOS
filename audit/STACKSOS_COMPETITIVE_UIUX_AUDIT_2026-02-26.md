# StacksOS Competitive UI/UX Audit (2026-02-26)

## Scope

This pass audited StacksOS UI/UX quality and product flexibility against modern ILS/discovery competitors using:

1. Fresh internal code/repo evidence (UI drift metrics, feature routes, tests).
2. Fresh official external product sources (Polaris/Vega, Surpass, Follett, Aspen, Alma/OCLC/BiblioCommons).

## Internal Evidence Snapshot

- `npm run lint -- --quiet`: pass
- `npm run type-check`: pass
- `npm run test:run`: pass (`131/131`)
- UI drift (`npm run audit:ui-drift`) now:
  - total score `168` (down from `224`)
  - raw `<button>` `35` (down from `60`)
  - text `<input>` `6` (down from `9`)
  - raw `<select>` `11` (down from `13`)
  - missing `Button` primitive files `2` (down from `8`)
  - missing `Input` primitive files `0` (down from `1`)

## Competitive Benchmark Sources (official)

- Polaris / Vega Discover:
  - <https://www.iii.com/products/polaris/>
  - <https://www.iii.com/products/vega-discover/>
  - <https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Public_Access_Admin/PDOPatAcc/Set_up_online_patron_self-registration.htm>
- Surpass:
  - <https://surpasssoftware.com/products/>
  - <https://surpass.cloud/2026/cloud-upgrade>
- Follett:
  - <https://www.follettsoftware.com/library-management>
  - <https://www.follettsoftware.com/library-management/classroom-library-manager>
  - <https://www.follettsoftware.com/ai>
- Aspen Discovery:
  - <https://aspendiscovery.org/>
  - <https://github.com/bywatersolutions/aspen-discovery>
- Extensibility reference benchmark:
  - <https://developers.exlibrisgroup.com/alma/apis/>
  - <https://developers.exlibrisgroup.com/alma/webhooks/>
  - <https://www.oclc.org/developer/api/oclc-apis/worldcat-discovery-api.en.html>
  - <https://www.bibliocommons.com/>

## Parity Assessment (fresh)

### Where StacksOS is strong now

- Modern full-stack product layer over Evergreen (staff + OPAC) with broad API/workflow coverage.
- First-party events lifecycle exists (register/cancel/waitlist/reminders/history) in OPAC account flows.
- K-12 class-circulation module exists with teacher/class/student workflows.
- SaaS admin foundations exist (tenant onboarding, platform roles, webhook/developer platform routes).
- AI copilot and ops-playbook routes exist with fallback/retry controls and telemetry hooks.

### Where top competitors still have clear UX advantage signals

- Native mobile app polish/ecosystem breadth (not just responsive web) remains a key competitor differentiator.
- Discovery merchandising/personalization depth still needs continued tuning to match best-in-class discovery products.
- Hardware/peripheral orchestration depth (self-check ecosystems, telemetry integration) remains limited.
- Quantified external UX proof (task success, time-on-task, NPS, conversion) is not yet published for StacksOS.

## Critical Truth

It is not technically defensible to claim "no competitor has better UI/UX" without independent comparative usability studies and production adoption data.

What is defensible today:

- StacksOS has materially improved UI cohesion and workflow surface quality.
- StacksOS is on a credible world-class trajectory with measurable quality gates and shrinking UX drift.

## Next World-Class Closure Targets

1. Drive UI drift score from `168` -> `<120` (remove remaining raw controls + inline styles in top files).
2. Add comparative UX telemetry dashboards:
   - task completion rate by workflow
   - median task duration by workflow
   - error-retry rate by workflow
3. Run structured side-by-side UX test scripts versus Polaris/Surpass/Follett task sets.
4. Expand OPAC personalization and explainability (recommendations + "why this result" + intent-aware ranking controls).
5. Continue AI reliability hardening to reduce fallback events under provider latency.
