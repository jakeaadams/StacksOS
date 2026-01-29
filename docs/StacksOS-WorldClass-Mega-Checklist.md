DEPRECATED: merged into docs/StacksOS-Execution-Backlog.md (single source of truth).

# StacksOS World-Class Mega Checklist (v1)

Date: 2026-01-25
Scope: Evergreen (system-of-record) + StacksOS Staff + OPAC + SaaS + AI
Source docs:
- PRD: `docs/StacksOS-Master-PRD.md`
- Backlog: `docs/StacksOS-Execution-Backlog.md`
- Runbook: `docs/StacksOS-Runbook.md`
- Parity: `docs/StacksOS-Parity-Matrix.md`
- Audits: `audit/` (run `./audit/run_all.sh`)

Purpose:
- This is a single, checkbox-level, end-to-end to-do list that turns the PRD + backlog into an execution plan.
- It also includes the missing "world-class polish" items that make StacksOS feel like a modern, high-throughput Polaris/Symphony-class staff client.

Non-negotiables (Global DoD for every item):
- No dead UI (no buttons/links that do nothing).
- No fake saves (if UI claims state changed, Evergreen state changed OR it is queued with offline semantics).
- Accessibility: keyboard-only path exists.
- Audit: sensitive actions emit an audit event.

---

## 0) Current Audit Snapshot (Facts)

From latest audit run on `stacksos` VM:
- Evergreen reachable from StacksOS: OK
- Adapter surface: all audited endpoints returned HTTP 200
- Workflow QA: checkout/renew/checkin/holds/MARC update: OK
- Perf (LAN): checkout p95 ~173ms, checkin p95 ~224ms, catalog search p95 ~64ms

Blocking issue:
- `./audit/run_all.sh` currently FAILS because `console.*` exists in OPAC + a few shared hooks/components.

Immediate rule:
- If OPAC is not ready, keep OPAC behind feature flags and/or remove `console.*` and use logger.

---

## 1) Stop-The-Bleed: Make Audits Green 24/7

### 1.1 Audit runner must pass
- [ ] Fix `./audit/run_all.sh` failing due to `console.*` in OPAC + hooks.
- [ ] Enforce "no console.*" consistently via the audit runner.
- [ ] Ensure audits do not depend on tools missing on the VM (install `ripgrep (rg)` and `jq` or avoid using them).

AC:
- `./audit/run_all.sh` prints PASS.

### 1.2 Repo inventory issues (navigation coverage)
From `audit/REPO_INVENTORY.md`:
- Sidebar has some routes whose pages do not exist. These must be created OR hidden behind feature flags.

- [ ] `/staff/catalog/buckets` route: create or hide behind `featureFlags.recordBuckets`.
- [ ] `/staff/catalog/batch` route: create or hide behind `featureFlags.marcBatchEdit`.
- [ ] `/staff/reports/templates` route: create or hide behind `featureFlags.reportTemplates`.
- [ ] `/staff/reports/my-reports` route: create or hide behind `featureFlags.myReports`.
- [ ] `/staff/reports/scheduled` route: create or hide behind `featureFlags.scheduledReports`.
- [ ] `/staff/admin/server` route: create or hide behind `featureFlags.serverAdmin`.
- [ ] `/staff/admin/workstations` route: create or hide behind `featureFlags.adminWorkstations`.
- [ ] `/staff/admin/users` route: create or hide behind `featureFlags.userManagement`.

AC:
- Sidebar has zero links to missing pages.

---

## 2) Evergreen (System-of-Record) Readiness

### 2.1 Evergreen ops hygiene
- [ ] Investigate/fix `apparmor.service` failed on Evergreen VM OR intentionally disable with explanation.
- [ ] Confirm Evergreen OpenSRF gateway health checks:
  - `/osrf-gateway-v1` reachable
  - core services responding: auth, actor, circ, search

AC:
- Evergreen VM has no failed services that impact ILS.

### 2.2 TLS correctness (no insecure bypass)
Current:
- StacksOS uses `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env.local` (dev-only).

- [ ] Issue proper TLS for Evergreen (internal CA OK) and trust it from StacksOS.
- [ ] Remove `NODE_TLS_REJECT_UNAUTHORIZED=0` for pilot/prod.

AC:
- StacksOS calls Evergreen with TLS verification enabled.

### 2.3 Backups + restore drills
- [ ] Evergreen DB backup automation + retention.
- [ ] Restore drill documented + tested.

AC:
- RPO/RTO targets exist and restore drill is repeatable.

### 2.4 Evergreen sandbox configuration seeding (P0-10)
Most modules look "empty" because Evergreen is not configured.

Seed data:
- [ ] 10+ patrons with varied profiles (adult/juvenile/staff), blocks, penalties.
- [ ] 100+ bibs/items with varied formats/statuses and multiple branches.

Configure modules:
- [ ] Acq: 1 vendor + 1 fund + 1 PO + 1 invoice.
- [ ] Serials: 1 subscription + 1 routing list.
- [ ] Booking: 1 resource type + 1 resource + 1 reservation.
- [ ] Authority: configure search target(s).

AC:
- Every StacksOS staff module shows real data or a clear "setup required" guide.

---

## 3) StacksOS Staff Client: Polaris/Symphony-Class Throughput UX

### 3.1 Navigation + mental model
- [ ] Global command palette covers real desk actions.
- [ ] "Recent" and "Pinned" patrons/items are first-class.
- [ ] Never lose context: drawers/side panels instead of page navigation.

AC:
- Checkout/checkin desk can run mouse-free.

### 3.2 Record "cockpit" (the missing piece)
Catalog search:
- [ ] Row click opens a right-side detail panel (not full navigation).
- [ ] Detail includes: cover, bib metadata, availability by branch, holdings/copies table.
- [ ] Quick actions: place hold, open holdings, open MARC, open item status.

Patron search:
- [ ] Row click opens a patron panel with checkouts/holds/bills/notes summary + quick actions.

AC:
- Staff can go from search -> action in <= 2 clicks.

### 3.3 Circulation desk (P0-3)
- [ ] Benchmark: 50 items/min sustained on LAN.
- [ ] Overrides: permissioned + audited + explainable.
- [ ] Receipts/slips: printable HTML, consistent formatting.
- [ ] Bulk scan queue: scan while requests in-flight; recover from errors.
- [ ] Offline mode: durable queue + idempotent upload + conflict UI.

AC:
- Staff is never stuck in an unexplained broken state.

### 3.4 Patrons (P0-4)
- [ ] Deep links always correct.
- [ ] Registration supports tenant-configurable barcode strategy.
- [ ] Patron edit/blocks/notes UX (permissioned + audited).

AC:
- Patron servicing can happen in one place.

### 3.5 Cataloging (P0-5)
- [ ] MARC diff view (before/after) + validation errors.
- [ ] Z39.50 setup-required UX + real search/import.
- [ ] MARC import preview + de-dupe/overlay rules.
- [ ] Item status includes circ history endpoint + UI.

AC:
- Catalogers can do common tasks without Evergreen legacy UI.

### 3.6 Cover art pipeline (Staff + OPAC)
- [ ] Consistent aspect ratio + skeleton loading + fallback icon.
- [ ] Cache external providers.
- [ ] Configurable provider order.

AC:
- Catalog search and record detail look modern.

---

## 4) Admin / Settings / Roles

### 4.1 Admin hub
- [ ] `/staff/admin` has clear tiles/links: Policy Inspector, Workstations, Users/Roles, Server status.

AC:
- Admins can find settings quickly.

### 4.2 Roles clarity
- [ ] Top-right user menu shows:
  - Evergreen permission group name
  - current workstation org
  - key admin perms yes/no
- [ ] Permissions inspector view for current user.

Evergreen setup:
- [ ] Create/confirm sandbox admin group (e.g., `StacksOSAdmin`) and assign `jake` if desired.

AC:
- The UI explains what you can do and why.

---

## 5) OPAC (P1-2)
- [ ] Bring OPAC into audit compliance (no console.*).
- [ ] Wire search/record/account to real adapter endpoints.
- [ ] Patron self-service: holds/checkouts/fines.

AC:
- Patrons can use OPAC without Evergreen UI.

---

## 6) SaaS + Scale (P1)
- [ ] Tenant config schema + secrets strategy.
- [ ] Provisioning script + dry-run.
- [ ] Upgrade/rollback scripts.
- [ ] Backups/restore drills.

AC:
- Onboarding is repeatable and safe.

---

## 7) Security (P1)
- [ ] MFA strategy.
- [ ] Device/session management.
- [ ] IP allowlists.
- [ ] Audit log review UI.

---

## 8) Testing + Quality (P0-9)
- [ ] Playwright E2E suite.
- [ ] Contract tests for adapter.
- [ ] Reduce `any` + add Zod at boundaries.
- [ ] Ensure requestId propagation everywhere.

---

## 9) AI (P2) - Auditable + Reversible
- [ ] AI cataloging assistant.
- [ ] AI circulation assistant.
- [ ] AI discovery.
- [ ] AI analytics.
- [ ] AI governance.
