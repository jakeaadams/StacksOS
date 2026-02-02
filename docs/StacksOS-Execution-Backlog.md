# StacksOS Execution Backlog (P0/P1/P2)

Date: 2026-02-02

This is the execution backlog derived from `StacksOS-Master-PRD.md` (mirrored in `docs/StacksOS-Master-PRD.md`).
Implementation sequencing (high-level): `StacksOS-Implementation-Plan.md` (mirrored in `docs/StacksOS-Implementation-Plan.md`).

Legend:
- AC = acceptance criteria
- DoD = definition of done

Global DoD (applies to every item):
- No dead UI (no buttons/links that do nothing).
- No fake saves: if the UI says it changed state, Evergreen state is changed (or queued with offline semantics).
- Accessibility: keyboard-only path exists for the workflow.
- Audit: sensitive actions emit an audit event.

---

## How To Use This Backlog (for Codex agents)

Rules:
- Single source of truth: this file is canonical. If other checklists exist, they must be merged here.
- Work only in `/home/jake/projects/stacksos` on the `stacksos` VM.
- Do not create placeholder UI. If it is not end-to-end real, hide it behind `featureFlags`.
- Every "partial" item must have an explicit checklist of what remains.
- Keep `./audit/run_all.sh` green.

---

## Milestones (Ship Gates)

### Milestone 1: "Circ Desk Demo"
Goal: a librarian can work a full circulation desk shift using StacksOS for checkout/checkin/holds/bills.

Includes:
- P0-1, P0-2 (in strict mode), P0-3a..P0-3d, P0-3i, P0-9a

Ship when:
- All Milestone 1 items are **DONE** and `./audit/run_all.sh` passes.

### Milestone 2: "Full Staff Client"
Goal: all core staff modules (patrons + cataloging + acq + serials + reports) are end-to-end functional.

Includes:
- P0-4, P0-5, P0-6, P0-7, P0-8, P0-10

Ship when:
- Every sidebar route is either fully implemented OR hidden.
- Every module has real demo data in the sandbox (no empty screens without explanation).

### Milestone 3: "Pilot Ready"
Goal: a real library could run StacksOS for a week (operational trust).

Includes:
- P0-9b..P0-9g

Ship when:
- E2E tests exist for top workflows.
- Perf budgets are measured and enforced.
- Runbook exists and a non-dev can restart prod.

---

## Status Snapshot (as of 2026-02-02)

Implemented foundations:
- Staff shell + shared UI system: **DONE**
- Auth + workstation auto-register per device+branch: **DONE**
- RBAC strict mode supported: **DONE** (see `.env.local`) 
- Structured logging + audit log: **DONE** (`src/lib/logger.ts`, `.logs/audit.log`)
- Automated audits exist: **DONE** (`./audit/run_all.sh`, UI/API/workflow/perf/inventory)

Current blockers (must fix before calling this pilot-ready):
- Evergreen sandbox configuration/data is **INCOMPLETE**: multiple modules show empty lists or “not configured yet” signals (Acq/Serials/Booking/Authority).
- SaaS readiness is **INCOMPLETE**: tenant isolation/provisioning, object storage for uploads, secrets management, monitoring/alerting, DR drills.
- Admin/role clarity is **INCOMPLETE**: StacksOS displays Evergreen-derived group/profile; ensure the sandbox has realistic staff groups and permissions so Admin features appear as expected.
- Audit realism: `./audit/run_all.sh` is **PASSING**, and workflow QA is **read-only by default** (to avoid polluting the Evergreen sandbox with synthetic circulation). Set `STACKSOS_AUDIT_MUTATE=1` only when you explicitly want mutation coverage.

High-impact UX gaps (why the staff UI feels weak vs Polaris/Symphony):
- Missing record cockpit UX: selecting a bib/patron should open a detail drawer/panel with availability/holdings/actions (added to P0-4a + P0-5a).
- Admin settings discoverability needs an Admin Hub + Permissions Inspector (added to P1-5c).

In progress:
- Circulation hardening: **PARTIAL** (claims QA coverage, offline trust, throughput proof)
- Patrons: **PARTIAL** (edit/blocks/notes, barcode strategy) 
- Cataloging: **PARTIAL** (MARC diff/validation, Z39.50 import, MARC import, item circ history)
- Acq/Serials/Reports: **PARTIAL** (real actions + exports; no dead UI)
- Quality gates: **PARTIAL** (Playwright E2E + contract tests + reduce `any`)

---
## P0: Pilot-ready staff client (Evergreen-backed)

### P0-0: Staff shell + UX foundation

Status: DONE

Done checklist:
- [x] Shared layout primitives (`PageContainer`, `PageHeader`, `PageContent`)
- [x] Shared loading/error/empty states
- [x] Shared `DataTable` patterns
- [x] Sidebar + top-nav shell
- [x] Environment banner (prod vs training/sandbox) in header
- [x] Always-visible header search (autosuggest)
- [x] Workform tracker (recent + pinned workforms)
- [x] Command palette (`Cmd/Ctrl+K`)
- [x] Keyboard shortcuts registry (F-keys)

---

### P0-1: Auth + workstation + session UX

Status: DONE

Done checklist:
- [x] Login at `/login`
- [x] Evergreen auth token stored as httpOnly cookie
- [x] Workstation auto-register per device + branch (if permitted)
- [x] Session check endpoint
- [x] Logout

AC:
- First login on a new device takes <= 1 minute and is self-explanatory.

---

### P0-2: RBAC + audit logging (defense in depth)

Status: DONE

Notes: RBAC is enforced in strict mode (see .env.local and docs/StacksOS-Runbook.md).

Checklist:
- [x] RBAC helper exists (`src/lib/permissions.ts`)
- [x] Audit logging exists (`src/lib/audit.ts`)
- [x] Define/verify the StacksOS permission taxonomy (docs/StacksOS-Permissions.md)
- [x] Ensure every mutation endpoint calls `requirePermissions([...])`
- [x] Set `STACKSOS_RBAC_MODE=strict` in production runbook
- [x] Add "permission denied" UX that is staff-friendly (no cryptic errors)

AC:
- Every write/mutation endpoint requires an explicit permission.
- Audit logs include actor, org, workstation, requestId, outcome.

---

### P0-3: Circulation desk (win-or-die)

Status: PARTIAL

#### P0-3a: Checkout

Checklist:
- [x] Patron lookup (barcode/name)
- [x] Item checkout (Evergreen-backed)
- [x] Override handling (permissioned + audited)
- [x] Policy explainability UI (what policy blocked; what override allowed; who can override)
- [x] Receipt printing (minimum: printable HTML; later: email/SMS)
- [x] Use circ payload (record/volume) for item metadata (avoid extra search round-trips)
- [x] Bulk/rapid scan queue (scan while requests are in-flight; FIFO)
- [ ] Benchmark 50 items/min sustained on LAN (enforced under P0-9d)

AC:
- Scan-first throughput: 50 items/min sustained on LAN.
- Exceptions are explainable, overrideable (if allowed), and audited.

#### P0-3b: Checkin

Checklist:
- [x] Scan + checkin (Evergreen-backed)
- [x] Routing decisions are clear (hold shelf vs transit vs reshelve)
- [x] Slip printing (routing/hold slips) at minimum: printable HTML
- [x] Bookdrop / bulk checkin mode (one-keystroke mode for rapid returns)

AC:
- Scan -> routing decision <= 250ms perceived.

#### P0-3c: Holds management

Checklist:
- [x] Patron holds list
- [x] Title holds list
- [x] Pull list
- [x] Shelf list
- [x] Freeze/thaw/cancel/change pickup (as supported)
- [x] Holds shelf workflow polish (capture -> print slip -> shelf list -> clear shelf)

AC:
- All hold actions are audited.
- Title holds can be reached directly from catalog search results.

#### P0-3d: Bills & payments

Checklist:
- [x] View bills
- [x] Post payments
- [x] Refund workflows (must exist for pilots; permissioned + audited)
- [x] Receipts (printable)

AC:
- Payments/refunds update Evergreen state and are audited.

#### P0-3e: Lost / missing / damaged

Checklist:
- [x] UI present
- [x] Verify every state change is a real Evergreen mutation (permissioned + audited + idempotent-safe)
- [x] Ensure billing integration is correct and explainable

AC:
- All status changes are audited.

#### P0-3f: Claims

Checklist:
- [x] UI present
- [x] API: claims returned + claims never checked out are Evergreen-backed, permissioned + audited + idempotent-safe
- [x] UI: use GET `/api/evergreen/claims?patron_id=...` response shape (`claims.returned`, `counts.*`)
- [x] UI: fix POST payload for `claims_never_checked_out` (send `copyBarcode` + `patronId` + `circId`)
- [x] UI: fix POST action for resolve (must be `resolve_claim`) + send `copyBarcode`
- [x] UI: remove assumption `claimsData.claims` is an array; map from `claims.returned`
- [x] Add claims mutation coverage to audit/workflow QA

AC:
- All claim actions are audited.

#### P0-3g: In-house use

Checklist:
- [x] UI present
- [x] Session-based scanning uses real Evergreen / reporting semantics
- [x] Export/report is real (no dead export button)

AC:
- No dead export actions.

#### P0-3h: Offline circulation

Checklist:
- [x] Offline scaffolding present
- [x] Durable local queue (store-and-forward)
- [x] Pre-download block lists/policies
- [x] Upload transactions
- [x] Conflict resolution UI

AC:
- Offline transactions are durable and replayable.
- Upload is idempotent.

#### P0-3i: Error recovery + session resilience

Checklist:
- [x] Expired session mid-workflow -> redirect to `/login` with return URL
- [x] Evergreen unreachable -> clear degraded-mode banner + offline prompt
- [x] Timeouts -> safe retry UX with idempotency (server idempotency + client timeout retry)
- [x] 401 handling for pages that use raw fetch (migrate critical pages to `useApi`/`useMutation` or a shared client wrapper)

AC:
- Staff is never stuck in an unexplained broken state.

---

### P0-4: Patrons

Status: PARTIAL

#### P0-4a: Patron search + record

Checklist:
- [x] Search by name/barcode/email/phone
- [x] View key stats and blocks
- [x] Deep links (history, checkouts, holds, bills) are correct
- [x] Patron record cockpit: selecting a patron opens a detail panel (no navigation) with checkouts/holds/bills/alerts + quick actions.

#### P0-4b: Patron registration

Checklist:
- [x] Create patron (Evergreen-backed)
- [x] Barcode strategy is tenant-configurable (keep imported barcodes; do not force re-barcode)
- [x] Field validation errors are human-readable

#### P0-4c: Patron edit / blocks / notes

Checklist:
- [x] Edit core fields (permissioned)
- [x] Blocks/penalties UX
- [x] Notes/alerts UX

---

### P0-5: Cataloging & metadata

Status: PARTIAL

#### P0-5a: Catalog search

Checklist:
- [x] Search works (Evergreen-backed)
- [x] Filters/search types are correctly translated (title/author/isbn/etc.)
- [x] Deep links into MARC editor, holdings, item status
- [x] Material record cockpit: selecting a bib opens a detail drawer/panel with cover + availability + holdings preview + quick actions (place hold, MARC, holdings, item status).
- [x] Cover art pipeline: consistent aspect ratio + skeleton + fallback + caching; configurable provider order.

#### P0-5b: MARC editor

Checklist:
- [x] Load MARCXML
- [x] Save MARCXML
- [x] Diff view (before/after)
- [x] Validation of required fields with explainable errors

#### P0-5c: Z39.50 search + import

Checklist:
- [x] Evergreen Z39.50 targets configuration surfaced as "setup required" UX
- [x] Real search + import creates Evergreen bib

#### P0-5d: MARC import

Checklist:
- [x] Import MARC with preview
- [x] De-dupe / overlay rules (at least basic)

#### P0-5e: Authority search

Checklist:
- [x] View-only search (acceptable in P0)

#### P0-5f: Holdings / item status

Checklist:
- [x] Holdings view exists
- [x] Item status view includes circ history endpoint + UI

---

### P0-6: Acquisitions

Status: PARTIAL

Goal: real actions, not just lists.

Checklist:
- [x] Vendors list
- [x] Funds list
- [x] Purchase orders list
- [x] Invoices list
- [x] Receiving actions (real): receive, partial receive, cancel/claim, mark damaged
- [x] Permissioned actions + audit events
- [x] "Setup required" UX explains what Evergreen config is missing

---

### P0-7: Serials

Status: DONE

Checklist:
- [x] Subscriptions list
- [x] Routing list
- [x] Claims workflow (view-only acceptable for P0, but no dead buttons)
- [x] "Setup required" UX

---

### P0-8: Reporting

Status: PARTIAL

Checklist:
- [x] Dashboards (basic)
- [x] CSV export (async for large datasets)
- [x] Scheduled reports (feature-flagged until real)

---

### P0-9: Quality gates (world-class reliability)

Status: PARTIAL

#### P0-9a: Automated audits (keep green)

Checklist:
- [x] UI audit script exists
- [x] API audit script exists
- [x] Workflow QA script exists
- [x] Single wrapper: `./audit/run_all.sh` (one command)
- [x] Repo inventory report (pages/routes/nav coverage)
- [x] Audit runner is green on current code (no console.* violations; OPAC must comply or be feature-flagged).
- [x] Repo inventory respects featureFlags (missing pages are only failures when the flag is enabled).
- [x] Tooling: install `rg` + `jq` on the VM OR keep audits/scripts free of those dependencies.

AC:
- One command validates: no dead UI + adapter health + core workflow smoke.

#### P0-9b: E2E tests (Playwright)

Checklist:
- [x] Add Playwright
- [x] Top workflows covered end-to-end

#### P0-9c: Contract tests (Evergreen adapter)

Checklist:
- [ ] Schema/invariants per endpoint
- [ ] Fixtures for edge cases (policy blocks, overrides)

#### P0-9d: Performance budgets

Checklist:
- [x] Perf harness reports p50/p95
- [x] Budgets enforced for checkout/checkin/holds/search (checkout/checkin budgets require `STACKSOS_AUDIT_MUTATE=1`)

#### P0-9e: Type safety hardening (reduce `any`)

Checklist:
- [ ] Reduce `any` in adapter routes/shared libs
- [ ] Add Zod validation at boundaries

#### P0-9f: Structured logging + request IDs

Checklist:
- [x] Structured logger exists (`src/lib/logger.ts`)
- [x] Audit log exists (`src/lib/audit.ts`)
- [ ] Ensure every API route propagates `requestId` into audit + logs
- [x] Enforce "no console.*" (audited in `./audit/run_all.sh`)

#### P0-9g: Production runbook (pilot readiness)

Checklist:
- [x] Dev vs prod commands documented
- [x] Process manager (systemd/pm2) documented
- [x] Backup/restore and Evergreen dependency notes

---

### P0-10: Sandbox data + Evergreen config seeding

Status: PARTIAL

Reason: multiple modules show empty-data signals because Evergreen is not configured (funds/vendors/booking/serials/authority/etc.).

Checklist:
- [ ] Evergreen: create/confirm a sandbox admin permission group (e.g., `StacksOSAdmin`) and assign `jake` to it (so UI role matches expectation).
- [ ] Seed patrons (10+ with varied profiles)
- [ ] Seed items/bibs (100+)
- [ ] Acq: create 1 vendor, 1 fund, 1 PO
- [ ] Serials: create 1 subscription + routing list
- [ ] Booking: create 1 resource type + 1 resource
- [ ] Authority: configure search target (if applicable)

AC:
- Every StacksOS module shows real data or a clear "setup required" guide.

---

## P1: Competitive parity + SaaS experience

Principles:
- P1 work must not regress P0 workflows.
- No dead UI: if a P1 surface is not end-to-end real, keep it behind `featureFlags`.
- Prefer a SaaS experience (self-serve provisioning, upgrades, backups, observability) even if the ILS engine remains single-tenant-per-library/consortium.

Status: PARTIAL (policies + admin foundations)

### P1-0: SaaS control plane (tenant provisioning, upgrades, backups)

Status: NOT STARTED

Goal: a SaaS control plane that can provision and operate per-tenant Evergreen + StacksOS stacks.

#### P1-0a: Tenant model + configuration

Checklist:
- [ ] Define tenant config schema (Zod + docs): tenantId, displayName, region, evergreenBaseUrl, branding, feature flags, integrations.
- [ ] Store tenant config securely (local-first for pilots; future: DB-backed).
- [ ] Add per-tenant secrets management strategy (do not commit secrets; prefer env + encrypted at rest).

AC:
- A new tenant can be represented as a single validated config object.
- Secrets are never logged.

#### P1-0b: Provisioning automation (local-first)

Checklist:
- [ ] Create a provisioning script that can:
  - create tenant config
  - validate Evergreen connectivity
  - generate initial admin user guidance
  - set up health checks + logs paths
- [ ] Add a "provision dry-run" mode that prints changes without applying.

AC:
- Provisioning a new tenant is repeatable and takes < 30 minutes on a fresh host.

#### P1-0c: Upgrades + rollback

Checklist:
- [ ] Document upgrade steps (StacksOS first; Evergreen separately).
- [ ] Add an upgrade script that:
  - runs `npm run build`
  - runs `./audit/run_all.sh`
  - restarts the process manager
- [ ] Rollback plan documented (previous build artifact or filesystem snapshot).

AC:
- Upgrade can be performed by a non-dev using the runbook without downtime surprises.

#### P1-0d: Backups + restore drills

Checklist:
- [ ] Automated Evergreen backups (DB + config) with retention.
- [ ] Automated StacksOS backups (env + docs + audit log) with retention.
- [ ] Restore drill instructions (quarterly for pilots).

AC:
- A restore drill can be performed end-to-end and measured (RTO/RPO targets documented).

---

### P1-1: Notifications center (email/SMS templates + preferences)

Status: NOT STARTED

Goal: modern, testable notifications that libraries can trust.

#### P1-1a: Notification event model

Checklist:
- [ ] Define canonical notification events (checkout receipt, due-soon, overdue, hold-ready, billing receipt/refund receipt).
- [ ] Decide source of truth:
  - short-term: piggyback on Evergreen notice triggers where possible
  - long-term: StacksOS event pipeline + webhooks

AC:
- Every notification is traceable to an event with an immutable ID.

#### P1-1b: Templates + preview

Checklist:
- [ ] Template editor (email + SMS) with variables + preview.
- [ ] Test-send to the currently logged-in staff member.
- [ ] Template versioning + rollback.

AC:
- A librarian can safely edit a template and preview it with real sample data.

#### P1-1c: Delivery providers

Checklist:
- [ ] Email provider integration (SMTP first; pluggable abstraction).
- [ ] SMS provider integration (pluggable; do not hardcode Twilio).
- [ ] Delivery failure handling + retries.

AC:
- Delivery failures are visible in a notification log with retry status.

---

### P1-2: OPAC / patron experience v1

Status: NOT STARTED

Goal: patron-facing discovery + account experience that feels modern and fast.

Checklist:
- [ ] Search + facets + availability-first results.
- [ ] Place holds (title-level) + pickup selection.
- [ ] Patron account: checkouts, holds, fines.
- [ ] Mobile-first UI + accessibility baseline.

AC:
- Patrons can search, place holds, and manage their account without touching legacy Evergreen UI.

---

### P1-3: Advanced acquisitions (EDI, fund splits, claims)

Status: NOT STARTED

Checklist:
- [ ] Receiving actions support partial shipments and multi-fund splits.
- [ ] Claims workflow (vendor follow-ups) is end-to-end real.
- [ ] EDI/EDIFACT integration plan (doc-first) + adapter design.

AC:
- An acquisitions librarian can complete a real end-to-end order->receive->invoice workflow in StacksOS.

---

### P1-4: Advanced serials (predictive patterns, routing slips)

Status: NOT STARTED

Checklist:
- [ ] Predictive checkin patterns surfaced.
- [ ] Routing slips printing.
- [ ] Claims workflow integrated.

AC:
- Serials workflows can run without legacy UI for common tasks.

---

### P1-5: Admin policy center (calendars, circ rules, pickup rules)

Status: PARTIAL

Goal: make policies explainable and manageable with confidence.

#### P1-5a: Policy inspector (read-only, P1 starter)

Checklist:
- [x] A read-only "Policy Inspector" page that shows: (implemented at /staff/admin/policy-inspector)
  - active org/service location
  - key org settings (holds shelf, pickup, notices, circ defaults)
  - a searchable list of relevant OU settings (curated allowlist first)
- [x] Every setting shown includes:
  - where it comes from (org ancestor/default)
  - human description
  - link or instructions for where to change it (Evergreen admin or future StacksOS editor)

AC:
- Staff can understand "why" a workflow behaved the way it did from one screen.

#### P1-5b: Calendar manager

Checklist:
- [ ] View calendars per org.
- [ ] Edit calendars with versioning + audit.

AC:
- Calendar changes are safe (preview + rollback) and audited.

---


#### P1-5c: Admin hub + role clarity (staff-friendly)

Checklist:
- [x] `/staff/admin` is an Admin Hub with clear entry points (Policy Inspector, Workstations, Users/Roles, Server/Health).
- [x] Top-right user menu shows Evergreen permission group/profile + workstation org + a permissions snapshot (key admin perms yes/no).
- [x] Add a `Permissions Inspector` view for the current user (what you can do, why, and where it is configured).
- [x] Provide explicit links/instructions for changing settings in Evergreen until StacksOS editors exist.

AC:
- Admins can find library settings in <= 10 seconds.
- Staff understands why they see "Librarian" vs "Admin" and how to change it.

### P1-6: Security hardening (MFA, session mgmt, IP allowlists)

Status: NOT STARTED

Checklist:
- [ ] Session security: idle timeout UX, refresh, device list.
- [ ] MFA strategy for staff (StacksOS layer, compatible with Evergreen auth).
- [ ] IP allowlist per tenant.

AC:
- Security controls are configurable per tenant and do not break circulation throughput.

---

### P1-7: Implementation + training system (migration playbooks, in-app walkthroughs)

Status: NOT STARTED

Checklist:
- [ ] Migration playbooks per major incumbent (Polaris/Sierra/Symphony/Alma/Koha/Evergreen/etc.).
- [ ] In-app walkthroughs for P0 workflows.
- [ ] Admin checklist for go-live readiness.

AC:
- A new library can be onboarded with predictable steps and measurable checkpoints.

---

### P1-8: Support + ops readiness (status page, support intake, release notes)

Status: NOT STARTED

Checklist:
- [ ] Status page (per tenant) + incident banners.
- [ ] Support intake (ticket capture) + escalation policy.
- [ ] Release notes + change log.

AC:
- Operators can communicate incidents and capture support issues without email chains.

## P2: World-class differentiators (AI + collaboration)

Principles (non-negotiable):
- Auditable: store inputs/outputs + model/version + who accepted.
- Reversible: no irreversible actions without explicit human confirmation.
- Permissioned: RBAC-gated per action and per data scope.
- Privacy-safe: tenant isolation, minimal retention, opt-in where required.
- Explainable: show why a suggestion was made; cite sources when applicable.

Status: NOT STARTED (planning + decomposition)
Plan: `docs/StacksOS-Implementation-Plan.md` (AI section).

---

### P2-0: AI cataloging assistant (subjects/summaries with provenance)

Status: NOT STARTED

Goal: accelerate cataloging while preserving bibliographic integrity.

Checklist:
- [ ] Define AI suggestion schema for cataloging (stored as draft; never auto-applied).
- [ ] Suggest subjects (e.g., topical tags) with provenance/citations.
- [ ] Suggest short summary (staff-editable) with provenance.
- [ ] Suggest series normalization (staff-review).
- [ ] UI integration:
  - suggestions appear in MARC editor side panel
  - accept/reject per suggestion
  - diff view shows exactly what would change
- [ ] Safety:
  - no external lookups without tenant opt-in
  - prompt injection defenses for external MARC/metadata sources
- [ ] Audit events:
  - ai.suggestion.created / accepted / rejected

AC:
- A cataloger can apply suggestions in < 2 minutes per record.
- Every applied change is visible as a diff and is reversible.

---

### P2-1: AI circulation assistant (policy explanation + next steps)

Status: NOT STARTED

Goal: reduce desk friction by making policy blocks understandable and fast to resolve.

Checklist:
- [ ] AI-EXPLAIN-001: generate a plain-language explanation for Evergreen blocks.
- [ ] Provide suggested next steps (non-mutating) based on:
  - Evergreen event payload
  - StacksOS context (active org, workstation)
  - known workflow patterns
- [ ] Draft override note helper (staff edits; never auto-saves).
- [ ] UI integration:
  - shown inline in checkout/checkin error states
  - expandable panel includes raw Evergreen codes
- [ ] Evaluation harness:
  - staff can thumbs-up/down the explanation
  - capture feedback in audit log (non-PII by default)

AC:
- Staff can resolve common blocks without reading cryptic codes.
- Explanations are consistent and do not hallucinate actions.

---

### P2-2: AI discovery (semantic search + recommendations, privacy-forward)

Status: NOT STARTED

Dependencies:
- Requires P1-2 OPAC/patron app surface.

Checklist:
- [ ] Hybrid retrieval (keyword + semantic) with transparent ranking.
- [ ] "More like this" recommendations based on bib metadata (no patron history).
- [ ] Optional opt-in reading history personalization (per-tenant + per-user).
- [ ] Explainability:
  - show why an item was recommended
  - allow disabling personalization

AC:
- Recommendations never require reading history unless explicitly enabled.

---

### P2-3: AI analytics (narratives + drill-down)

Status: NOT STARTED

Goal: directors/managers get actionable insights without SQL.

Checklist:
- [ ] Narrative summaries for key dashboards (holds spike, overdue trends, payment drift).
- [ ] Drill-down links always available (no "black box" charts).
- [ ] Data export remains first-class (CSV/API).
- [ ] Privacy: aggregate by default; avoid patron-level insights unless permissioned.

AC:
- Every narrative statement links to underlying data.

---

### P2-4: Collaboration UX (presence, conflict resolution, tasking)

Status: NOT STARTED

Goal: reduce collisions and improve cross-team work on records.

Checklist:
- [ ] Presence indicator (who is viewing a record) for patrons/bibs.
- [ ] Soft-lock warnings ("Jane is editing holdings").
- [x] Conflict resolution UI for concurrent edits (diff + choose).
- [ ] Tasking/notes tied to records (assignable, auditable).

AC:
- Concurrent edits never silently overwrite.

---

### P2-9: AI safety, model ops, and governance

Status: PARTIAL

Notes:
- AI must never “look real” while being fake. No demo responses in staff workflows.
- All AI calls are server-side only; the browser never talks directly to a model provider.

Deliverable sequence (do in this order):
- [x] P2-9a: `featureFlags.ai` exists (currently behind `NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1`)
- [ ] P2-9b: Define per-tenant AI config (env + DB): enabled flag, provider, model, max tokens, temperature, safety mode
- [ ] P2-9c: Implement `src/lib/ai/` provider interface + adapters (OpenAI/Anthropic) with schema-validated outputs (Zod)
- [ ] P2-9d: Redaction policy + unit tests/fixtures (names, emails, phones, barcodes) enforced on the server boundary
- [ ] P2-9e: Ship `/api/ai/*` endpoints (draft-only) + timeouts + rate limits + abuse protections
- [ ] P2-9f: Add prompt templates + provenance (prompt versioning + prompt hash in logs)
- [ ] P2-9g: Add AI audit events (draft created/accepted/rejected) storing minimal metadata (no raw PII by default)
- [ ] P2-9h: Replace/feature-flag any hardcoded “AI answers” in `src/components/ai/*` and wire to `/api/ai/*`
- [ ] P2-9i: Add evaluation harness (golden tests) for policy explanations + cataloging suggestions (no hallucinations)
- [ ] P2-9j: Add cost/latency telemetry + per-tenant budgets/limits + incident response runbook

AC:
- AI features can be disabled instantly per tenant.
- Logs are sufficient for post-incident analysis without exposing patron data.
