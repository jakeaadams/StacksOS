# StacksOS Evergreen Boundary Audit (2026-02-25)

## Scope

Question answered:

- What changed on the Evergreen server vs what lives only in StacksOS?
- What upgrade risk does each change create?
- How to keep StacksOS as an overlay (Polaris/Surpass-style UX + mapping), not an Evergreen fork?

Systems audited:

- Evergreen VM: `192.168.1.232`
- StacksOS VM: `192.168.1.233`
- StacksOS repo: `/home/jake/projects/stacksos`

---

## Executive Summary

1. No direct Evergreen source-code patch was found for StacksOS branding/logic.
2. StacksOS custom persistence is concentrated in `library.*` schema (29 tables), owned by `stacksos_app`.
3. The largest Evergreen core-data footprint today is workstation registration growth in `actor.workstation` (`272` total, `264` `STACKSOS-%`).
4. A small amount of direct core-table SQL exists in StacksOS:
   - `actor.usr.photo_url` (patron photos)
   - `actor.hours_of_operation` / `actor.org_unit_closed` (calendar management)
5. TLS trust drift was already corrected; service health is green.
6. For upgrade safety, keep Evergreen code/config stock and treat StacksOS as an API/DB-overlay product with strict boundary rules.

---

## Concrete Evergreen-Side Change Inventory

## A) Evergreen application/config layer

Observed:

- Evergreen runtime version reports: `Open-ILS 3.16.3`
- OpenSRF runtime version: `3.003002` (3.3.2)
- PostgreSQL: `18.2`
- Apache: `2.4.58`

Config and infra changes found:

- Apache TLS cert files rotated (`/etc/apache2/ssl/evergreen.crt` and key) on `2026-02-21`.
- `evergreen-ssl.conf` differs from earlier backup by adding HSTS header.
- `/openils/conf/opensrf.xml` and `opensrf_core.xml` contain historical backup chain files, but no StacksOS-specific code insertion was found.

Not found:

- No StacksOS-named code files under Evergreen source/runtime trees.
- No `.rej`/`.orig` patch artifacts indicating manual patch merges.
- No `StacksOS` strings in Evergreen source tree (`/opt/Evergreen-ILS-3.16.2/Open-ILS`).

Notes:

- `StacksOS` appears in generated OrgTree JS caches under `/openils/var/web/.../OrgTree.js` because org names include "StacksOS", not because Evergreen UI code was forked.

## B) Evergreen database layer

Custom schema/object footprint:

- Non-core schema used by StacksOS: `library`
- `library` tables: `29`
- `library` functions: `0`
- `library` table owner: `stacksos_app`

Current `library.*` live row highlights:

- `staff_sessions`: `476`
- `record_presence`: `48`
- `ai_drafts`: `31`
- `schema_migrations`: `4`
- `patron_photos`: `2`
- `calendar_versions`: `1`
- `saas_role_bindings`: `1`

Role boundary:

- DB login role: `stacksos_app` (non-superuser, no create db/role)
- Schema ACL: `library` grants `USAGE, CREATE` to `stacksos_app`
- Table grants: full DML privileges across `library.*`

Core Evergreen data touched:

- `actor.workstation`:
  - total rows: `272`
  - `STACKSOS-%` rows: `264`
  - recent names follow `STACKSOS-<ORG>-<device-fragment>` patterns
- `actor.usr.photo_url`:
  - non-empty rows: `2`
  - values correspond to patron photo feature use
- `actor.hours_of_operation` / `actor.org_unit_closed`:
  - writable by StacksOS calendar route (audited in code path; historical writes tracked in `library.calendar_versions`)

Not currently present:

- `config.usr_setting_type` rows for `stacksos.*` notification keys were `0` at audit time.
- `actor.usr_setting` total row count was `0` at audit time.

## C) StacksOS service/runtime layer

Observed:

- `evergreen-db-tunnel.service` active: `127.0.0.1:5433 -> evergreen:5432`
- StacksOS production env trusts Evergreen via CA file:
  - `NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/evergreen-192.168.1.232.crt`

Issue found and corrected during this audit pass:

- `stacksos.service` was flapping due `EADDRINUSE` on port `3000` caused by an abandoned manual `next start` process in a user session.
- Stale process removed; service restarted and verified healthy.

---

## Code-Level Boundary Findings

Direct SQL writes to Evergreen core schemas from StacksOS:

- `src/app/api/evergreen/calendars/route.ts`
  - `insert/update` `actor.hours_of_operation`
  - `delete/insert` `actor.org_unit_closed`
- `src/lib/db/evergreen.ts`
  - `update actor.usr set photo_url=...`
  - `update actor.usr set photo_url=NULL ...`

Workstation behavior:

- Login flow attempts:
  1. login with stored workstation
  2. reuse existing workstation by org/family prefix
  3. register workstation only if reuse fails
- This is overlay behavior (StacksOS-side) but still creates Evergreen `actor.workstation` rows when needed.

---

## Fix Applied In This Pass

Goal: reduce Evergreen core-table writes by default.

Applied:

- Patron photo mirroring to `actor.usr.photo_url` is now opt-in via env flag.
  - New env: `STACKSOS_SYNC_PATRON_PHOTO_TO_EVERGREEN`
  - Default behavior: StacksOS writes only `library.patron_photos`
  - Optional interoperability mode: set flag to enable Evergreen core mirror writes

Files changed:

- `src/lib/db/evergreen.ts`
- `src/lib/env-validation.ts`
- `.env.example`
- `SECURITY.md`

Operational verification after patch:

- `stacksos.service`: active
- `evergreen-db-tunnel.service`: active
- `https://192.168.1.233/api/evergreen/ping`: `ok:true`
- `https://192.168.1.233/api/health`: `status:"ok"`

---

## Upgrade Risk Matrix

Low risk (safe overlay):

- `library.*` schema objects and data
- StacksOS code/UI/design/admin/onboarding/SaaS RBAC logic
- StacksOS systemd/proxy/tunnel/cert-sync scripts

Medium risk (core data coupling, but not source fork):

- `actor.workstation` growth and naming policy
- Optional `actor.usr.photo_url` mirroring (now opt-in)
- Calendar writes to `actor.hours_of_operation` and `actor.org_unit_closed`

Higher risk (if expanded carelessly):

- Any future direct SQL writes to more Evergreen core schemas/tables
- Any direct patching of `/openils` Perl/web source without patch discipline

---

## Boundary Policy (Recommended Standard)

1. Evergreen source/config stays vendor-stock except install-hardening and cert/Apache basics.
2. StacksOS owns product features and persistence in `library.*`.
3. Evergreen core writes are allowed only when they represent legitimate ILS state transitions and are documented.
4. Prefer OpenSRF APIs over direct SQL for Evergreen-owned entities.
5. For unavoidable direct SQL writes, enforce:
   - explicit allowlist of tables
   - contract tests
   - rollback notes
   - migration notes for Evergreen upgrade windows

---

## Open-Source ILS Comparison (Install/Architecture Angle)

Official-source findings:

- Evergreen is consortium-first and workstation-based for staff context.
- Koha is a mature monolith stack with Apache/MariaDB/Elasticsearch and can run in a single host setup.
- FOLIO is a modern modular platform; docs describe single-server setup for local testing and distributed deployment for production.

Practical deployment answer:

- You do not strictly need a separate VM for each ILS when experimenting.
- For serious evaluation and production-like comparisons, use separate VMs (or isolated containers) per ILS to avoid:
  - port/service collisions,
  - dependency conflicts,
  - mixed data stores,
  - ambiguous performance/security results.

Recommendation for this project:

- Keep Evergreen as the production backend target.
- Use separate, isolated lab environments if you benchmark Koha/FOLIO.
- Continue building StacksOS as a backend-agnostic UX layer where possible, with Evergreen adapter as first-class.

---

## What This Means For "Will Evergreen Update Break Us?"

Most StacksOS logic is upgrade-resilient because it is not patching Evergreen source.

Real break vectors:

- OpenSRF method contract changes
- Evergreen auth/workstation behavior changes
- schema changes in Evergreen core tables that StacksOS writes directly (`actor.*` paths above)
- cert/trust drift between VMs

Mitigation already in place:

- strict API audit suites
- onboarding probes
- cert sync scripts (`scripts/sync-evergreen-cert.sh`, timer installer)
- boundary hardening for patron photos (this pass)

Next hardening step (completed in follow-up pass):

- Automated "Evergreen footprint snapshot" script is now in repo:
  - `scripts/evergreen-footprint-snapshot.sh`
  - npm command: `npm run evergreen:footprint`
  - Exports:
    - schema object inventory,
    - `library.*` row counts,
    - Evergreen core touchpoint counters,
    - `library` schema/table grants,
      before/after Evergreen upgrades.

---

## External References (official)

- Evergreen install docs: https://docs.evergreen-ils.org/docs/latest/install/install.html
- Evergreen Debian/Ubuntu 24 upgrade docs: https://docs.evergreen-ils.org/docs/latest/maintenance/upgrade_debian12_ubuntu24.html
- Evergreen 3.16 release notes index: https://docs.evergreen-ils.org/docs/latest/RELEASE_NOTES_3_16/release_notes.html
- Evergreen 3.16.3 release announcement (Jan 21, 2026): https://evergreen-ils.org/evergreen-ils-3-16-3-released-with-security-fixes/
- Evergreen downloads page: https://evergreen-ils.org/egdownloads/
- Evergreen staff login/workstation behavior (docs-old): https://docs-old.evergreen-ils.org/2.8/admin/basic_circulation.html#_logging_into_the_staff_client
- Evergreen workstation settings (docs-old): https://docs-old.evergreen-ils.org/2.8/admin/workstation_settings.html
- Evergreen organizations and OU setup (docs-old): https://docs-old.evergreen-ils.org/2.8/admin/organizations.html
- Koha installation requirements: https://koha-community.org/manual/22.11/en/html/installation.html#koha-requirements
- Koha OPAC self-registration preference: https://koha-community.org/manual/22.11/en/html/opacpreferences.html#opacselfregistration
- FOLIO platform-complete repo: https://github.com/folio-org/platform-complete
- FOLIO single-server installation guidance: https://folio-org.atlassian.net/wiki/spaces/FOLIJET/pages/1379384/Getting+Started+with+Single+Server+Installation
