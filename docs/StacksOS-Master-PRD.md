# StacksOS Master PRD (v1.0)

Date: 2026-01-25
Owner: StacksOS
Status: Active
Scope: Staff ILS (P0) + SaaS control plane (P1) + AI-first differentiators (P2)
Execution backlog: docs/StacksOS-Execution-Backlog.md

Implementation tracking:
- Source of truth for status: docs/StacksOS-Execution-Backlog.md
- Run ./audit/run_all.sh on the stacksos VM to refresh audit/REPORT.md + audit/FEATURE_MATRIX.md + audit/REPO_INVENTORY.md

Branding:
- Product name (UI): StacksOS
- Hostname / DNS label: stacksos (lowercase)

---

## Table of contents

- 0) Executive summary
- 1) North star: beat incumbents on throughput + trust (not "prettier Evergreen")
- 2) Evidence tiers + PRD notation
- 3) Glossary
- 4) Product surfaces
- 5) Architecture: facade/strangler on Evergreen (system of record)
- 6) Tenancy + multi-library / consortia model
- 7) Design system + UX behavior spec (non-negotiable)
- 8) Must-win workflows (with measurable acceptance criteria)
- 9) Canonical API + event model (StacksOS-owned)
- 10) Standards + integrations
- 11) Migration system spec (including barcode compatibility)
- 12) Security + privacy + compliance
- 13) Reliability, observability, and operations
- 14) Testing strategy (contract tests + E2E + perf)
- 15) Execution backlog (P0/P1/P2) + definition of done
- 16) Implementation, training, and support
- 17) AI differentiators (P2) + safety model
- Appendix A) Competitive sources (doc-first)

---

## 0) Executive summary

StacksOS is a modern, AI-first staff client and SaaS platform for libraries.

Key decision:
- Evergreen remains the system of record (patrons/items/circulation/policies).
- StacksOS is the system of engagement: world-class staff UX, canonical API, auditability, observability, migration tooling, and an eventual SaaS control plane.

Why this is the winning path:
- Rewriting a full ILS core from scratch is high risk and multi-year.
- "Theming Evergreen" keeps Evergreen's fragmented interaction model.
- The facade/strangler approach lets us ship a world-class staff tool quickly while gradually replacing pieces behind stable contracts.

---

## 1) North star: beat incumbents on throughput + trust

We win by making staff workflows:
- Scan-first and keyboard-first
- Data-dense (power-tool, not brochure)
- Consistent across modules
- Fast (performance budgets treated as requirements)
- Safe (audit trails, policy explainability, reversible actions)
- Operable (monitoring, upgrades, backups, incident response)

This is the practical definition of "better than Polaris / Sierra / Symphony / Alma / Surpass / Follett / Alexandria / Koha / Evergreen".

---

## 2) Evidence tiers + PRD notation

### Evidence tiers
- D (Doc-verified): manuals, help centers, implementation guides.
- M (Marketing-verified): product pages, announcements.
- S (Standards-verified): W3C, NISO, LoC, etc.
- I (Inference): likely true but not verified by primary docs yet.

### Requirement IDs
Every requirement should eventually be assigned a stable ID for tracking:
- UX-* (UX rules)
- PERF-* (performance budgets)
- API-* (canonical API contract)
- SEC-* (security/privacy)
- MIG-* (migration)
- OPS-* (operations)
- MOD-* (module capability)
- AI-* (AI capability)

---

## 3) Glossary

- Tenant: a paying customer (a library or consortium).
- Consortium: multiple libraries sharing a catalog and/or resource sharing rules.
- Org unit: Evergreen's organizational hierarchy node (system/consortium/branch/etc.).
- Branch: a physical library location.
- Workstation: a registered staff device context used by Evergreen to apply circulation location, printer, slip templates, and policy behaviors.
- System of record: Evergreen (authoritative state transitions).
- System of engagement: StacksOS (UX, canonical API, automation, analytics).
- BFF (backend-for-frontend): StacksOS Next.js API routes that front Evergreen.
- Canonical API: the stable StacksOS-owned model and API surface used by UI, AI, and integrations.

---

## 4) Product surfaces

### 4.1 Staff app (P0)
- Primary surface for circulation desk and back-office workflows.
- Browser-based.
- Runs as StacksOS web app + BFF.

### 4.2 Admin console (P1)
- Tenant provisioning, SSO, configuration versioning, observability, billing.
- Not Evergreen admin screens; this is StacksOS SaaS control plane.

### 4.3 Patron experience / OPAC (P1)
- Patron discovery, holds, account management, notifications.
- Can start as separate Next.js app or route group.

### 4.4 APIs (P0+)
- `/api/evergreen/*`: adapter APIs (current implementation).
- Future: `/api/core/*` canonical APIs + eventing, with adapters behind.

---

## 5) Architecture: facade/strangler on Evergreen

### 5.1 Principles
- Evergreen is authoritative for state transitions.
- StacksOS never mutates Evergreen data via direct DB access.
- StacksOS owns:
  - UX
  - canonical models
  - permission enforcement (defense in depth)
  - audit logs
  - observability
  - migration tooling
  - optional caching/search index

### 5.2 Today (current codebase)
- Next.js app router
- API routes under `src/app/api/evergreen/*` call Evergreen OpenSRF gateway
- Shared API client under `src/lib/api/*`
- Shared UI components under `src/components/shared/*`

### 5.3 Target end-state
- StacksOS canonical API (contract-first)
- Evergreen adapter behind canonical API
- Later: additional adapters (FOLIO, Koha) or StacksOS-native services (strangler replacement)

### 5.4 Contract testing strategy (required)
- Treat Evergreen behavior as a reference implementation.
- Build contract tests that assert:
  - given policy + state
  - when action
  - then result matches Evergreen
- Run these tests continuously against:
  - adapter (Evergreen)
  - future replacement services

---

## 6) Tenancy + multi-library / consortia model

### 6.1 What "multi-library" means
We must support:
- One tenant with multiple branches.
- One tenant as a consortium (multiple member libraries) with:
  - shared bib catalog
  - local holdings
  - transit routing
  - patron permissions + policy variation by org

### 6.2 Recommended SaaS deployment model (P0/P1)
- Per-tenant Evergreen backend (single-tenant-per-library/consortium) for data isolation.
- StacksOS SaaS control plane manages:
  - tenant provisioning
  - versioning
  - backups
  - monitoring
  - feature flags
  - auth policies

This delivers a SaaS experience without requiring a full multi-tenant Evergreen rewrite.

### 6.3 Workstation strategy: auto-register per device + branch (P0)
Evergreen uses workstations to bind staff actions to a physical service context (circ desk location, printers, etc.).

Evergreen references (doc-verified):
- https://docs.evergreen-ils.org/docs/latest/admin/web_client-login.html (Registering a Workstation)
- https://docs.evergreen-ils.org/docs/latest/admin/workstation_admin.html (Workstation Administration)
- https://docs.evergreen-ils.org/docs/latest/circulation/offline_circ_webclient.html (Offline Circulation requirements + IndexedDB/service workers)

Industry references (doc-verified):
- Polaris LEAP workstations: https://documentation.iii.com/polaris/7.6/leap/Default.htm#staff_client_admin/Workstations.htm
- Symphony WorkFlows station wizard: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/WFWhere/station_wizard.htm

StacksOS approach:
- Auto-register a workstation on first login per device.
- Persist workstation identity in a durable cookie/local storage.
- Allow staff to switch active "service location" (branch) explicitly.

Acceptance criteria:
- MOD-AUTH-001: First login prompts for branch selection (if not known).
- MOD-AUTH-002: If workstation missing, StacksOS registers it automatically (if permitted) and retries login.
- UX-AUTH-001: Workstation is invisible unless troubleshooting; UI communicates "Working at <Branch>".

---

## 7) Design system + UX behavior spec (non-negotiable)

### 7.1 Visual direction
StacksOS staff UI should feel like a premium operations console:
- high-contrast utilitarian
- data-dense
- deliberate typography
- consistent spacing and information hierarchy

### 7.2 Layout grammar
- Every workflow screen uses the same structure:
  - header (title + breadcrumb + actions)
  - primary work area
  - secondary panel/drawer for details
- Prefer split-pane + drawers over page navigation.

### 7.3 Keyboard-first
- Global command palette: `Ctrl/Cmd+K`
- F-keys map to circulation desk flows:
  - F1 Checkout
  - F2 Checkin
  - F3 Patron search
  - F5 Catalog search
- All tables support keyboard navigation.

### 7.4 Scan-first
- Barcode input is always focus-managed.
- Scanner wedge supported everywhere (rapid key input).
- Scan flows are optimistic: show immediate feedback, reconcile after.

### 7.5 Error explainability
- No cryptic codes.
- When Evergreen blocks an action, show:
  - what policy caused the block
  - what override is allowed
  - who can override
  - audit entry for override

### 7.6 Accessibility baseline
- WCAG 2.2 AA target.
- Keyboard-only workflows pass.
- Screen reader support for core flows.

---

## 8) Must-win workflows (with measurable acceptance criteria)

This section is "definition of done" for pilot readiness.

### 8.1 Circulation: Checkout (P0)

User story:
- As a circulation staff member, I scan a patron card and then scan a stack of items quickly.

UI spec:
- Dual barcode inputs (patron + item).
- Patron context panel (status/blocks/alerts/fines/holds).
- Checkout list table (virtualized at scale) with due date, status, and quick actions.

Keyboard spec:
- F1 opens Checkout screen and focuses patron barcode.
- Enter on patron barcode triggers lookup and focuses item barcode.
- Item barcode auto-submits on scan.

Audit events:
- circ.checkout.attempt
- circ.checkout.success
- circ.checkout.blocked
- circ.checkout.override

Performance budgets:
- PERF-CIRC-001: scan -> UI confirmation <= 400ms perceived.
- PERF-CIRC-002: adapter call p95 <= 150ms on LAN (Evergreen local network).

Acceptance criteria:
- MOD-CIRC-001: Patron blocks surfaced with actionable messaging.
- MOD-CIRC-002: Item blocks surfaced with actionable messaging.
- MOD-CIRC-003: Overrides are permissioned and audited.
- MOD-CIRC-004: Batch mode supports 50 items/min sustained on typical hardware.

### 8.2 Circulation: Checkin (P0)

User story:
- As staff, I scan returns, and the system tells me whether to reshelve, transit, or capture for holds.

Acceptance criteria:
- MOD-CIRC-010: Routing decision displayed instantly.
- MOD-CIRC-011: Hold capture workflow is obvious and printable.
- MOD-CIRC-012: In-transit chain-of-custody events are visible.

Performance budgets:
- PERF-CIRC-010: scan -> routing decision <= 250ms perceived.

### 8.3 Circulation: Holds management (P0)

Scope:
- patron holds
- title holds
- holds shelf
- pull list
- expiration

Acceptance criteria:
- MOD-HOLD-001: staff can view/search holds by patron barcode.
- MOD-HOLD-002: staff can view holds by title/bib id.
- MOD-HOLD-003: staff can cancel/freeze/change pickup with audit.
- PERF-HOLD-001: pull list 50k holds filter <= 2s (async generation allowed).

### 8.4 Patrons: Search + record view (P0)

Acceptance criteria:
- MOD-PAT-001: search by name, barcode, email, phone.
- MOD-PAT-002: patron record view shows key account status + history.
- MOD-PAT-003: view must be safe for keyboard-only.

### 8.5 Patrons: Registration (P0)

Acceptance criteria:
- MOD-PAT-010: create patron in Evergreen via adapter (no fake save).
- MOD-PAT-011: barcode strategy supports tenant profiles (see MIG section).
- MOD-PAT-012: required fields validated with human-friendly messages.
- MOD-PAT-013: audit log entry for creation.

### 8.6 Cataloging: Search + MARC editor (P0)

Acceptance criteria:
- MOD-CAT-001: catalog search returns bibs with holdings preview.
- MOD-CAT-002: MARC editor loads and saves real MARCXML.
- MOD-CAT-003: editor validates required fields and shows diffs.

### 8.7 Cataloging: Z39.50 search + import (P0)

Acceptance criteria:
- MOD-CAT-010: staff can search configured Z39.50 targets.
- MOD-CAT-011: staff can import record into Evergreen.
- MOD-CAT-012: failures explain target/config issues.

### 8.8 Acquisitions: Orders/Receiving/Invoices (P0)

Acceptance criteria:
- MOD-ACQ-001: view purchase orders.
- MOD-ACQ-002: receive items (partial shipments supported).
- MOD-ACQ-003: invoice association visible.

### 8.9 Serials: Subscriptions + routing + claims (P0)

Acceptance criteria:
- MOD-SER-001: list subscriptions.
- MOD-SER-002: routing lists view.
- MOD-SER-003: claim workflow stub must be hidden unless implemented.

### 8.10 Reporting (P0)

Acceptance criteria:
- MOD-RPT-001: role dashboards load with real data.
- MOD-RPT-002: CSV exports are async for large datasets.

---

## 9) Canonical API + event model (StacksOS-owned)

### 9.1 Why we need a canonical API
- UI, AI, analytics, and integrations cannot depend on Evergreen's internal shapes.
- Canonical API is the contract that remains stable while adapters change.

### 9.2 Canonical objects (initial)
- Patron
- ItemCopy
- BibRecord
- Hold
- CirculationTransaction
- Bill / Payment
- OrgUnit (Branch)
- Workstation
- User (staff identity)

### 9.3 Eventing (initial)
- patron.created
- patron.updated
- circ.checkout
- circ.checkin
- hold.placed
- hold.captured
- payment.posted

Events must include:
- tenant_id
- actor_user_id
- workstation_id
- request_id / correlation_id
- source (evergreen-adapter, stacksos-core)

---

## 10) Standards + integrations

Baseline standards (P0/P1):
- Accessibility: WCAG 2.2 AA (S)
- NCIP: NISO NCIP (ANSI/NISO Z39.83) (S)
- SIP2: self-check / RFID ecosystem (D/M via vendor docs)
- Z39.50/SRU: copy cataloging
- MARC21: bibliographic exchange
- EDIFACT: acquisitions (P1)

Integrations (P1):
- Email (SMTP/provider)
- SMS provider
- Payments (card + ACH where needed)
- Receipt printing
- Label printing (ZPL/PDF)

---

## 11) Migration system spec (including barcode compatibility)

### 11.1 Guiding reality
Libraries will not re-barcode during migration.
StacksOS must be compatible with any reasonable legacy barcode scheme.

### 11.2 Barcode profile engine (MIG-BC-*)
Per tenant and optionally per branch/patron profile/item type:
- allowed charset
- min/max length
- prefix/suffix
- padding rules
- optional check digit strategy
- symbology metadata (for printing)

### 11.3 Normalization pipeline
- trim whitespace
- collapse internal whitespace
- remove accidental prefix/suffix if configured
- optional zero-padding/stripping per profile
- alias resolution (alternate IDs)

### 11.4 Import tooling
- dry-run mode
- collision detection + resolution policies
- reconciliation reports (pre/post counts + exceptions)
- staged cutover plan (initial bulk + delta import)

### 11.5 Vendor mapping templates
Provide mapping templates and preflight checks for:
- Polaris
- Sierra
- Symphony
- Koha
- Evergreen
- Follett Destiny
- Surpass
- Alexandria
- Alma
- FOLIO

### 11.6 Competitive evidence for barcode compatibility (doc-verified)
- Evergreen supports barcode completion rules (prefix/suffix/padding) to allow partial scans and consistent lookup. (D)
  - https://docs.evergreen-ils.org/docs/latest/admin/barcode_completion.html
- Polaris documents barcode format policies (prefix, length, suffix, check digit) used across items and patrons. (D)
  - https://documentation.iii.com/polaris/7.6/PolarisStaffHelp/Default.htm#SysAdminGuide/Barcodes/Barcode_Formats.htm
- Sierra supports verifying patrons by barcode and other identifiers (for example, alternate ID) as part of patron verification. (D)
  - https://help.iii.com/sierra/Content/sril/sril_patron_verify_patrons.htm
- Sierra documents barcode validation/partial entry behaviors that imply configurable barcode rules and offline constraints. (D)
  - https://help.iii.com/sierra/Content/sril/sril_offline_maintain_barcode_validation.htm
- Koha supports patron cardnumber generation and constraints via system preferences (auto-increment + length). (D)
  - https://koha-community.org/manual/latest/en/html/administrationpreferences.html
- Destiny supports patron imports that include barcode as a mapped field. (D)
  - https://destinyhelp.fsc.follett.com/content/t_import_patrons.htm
- Alexandria supports patron imports with barcode handling choices (keep, reassign, generate). (D)
  - https://support.goalexandria.com/support/solutions/articles/70000599253-importing-patrons
- Surpass supports using Alternate ID as a barcode (migration-friendly). (D)
  - https://docs.surpass.cloud/docs/barcodes
- Alma documents that users have identifiers (including barcode) and supports barcode-based circulation workflows. (D)
  - https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/050Administration/030User_Management/010Managing_Users
  - https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/030Fulfillment/040Circulation_Desk_Operations/Managing_Patron_Services_at_a_Circulation_Desk_-_New_Layout

StacksOS implication:
- Barcode compatibility must be a first-class product feature (not a one-off migration script).
- We should store raw identifiers and normalized identifiers, and allow multiple identifiers per entity when a library needs it.

---

## 12) Security + privacy + compliance

### 12.1 Authentication
P0:
- Evergreen token/session handled server-side.
P1:
- Staff SSO via OIDC/SAML + MFA.

### 12.2 Authorization
- Defense in depth:
  - Evergreen permissions
  - StacksOS RBAC enforcement at API boundary
- Break-glass workflow:
  - time-bound elevated access
  - mandatory reason
  - audited

### 12.3 Audit logging
- Append-only audit log.
- Exportable per tenant.
- Tamper-evident hashing (P1).

### 12.4 Privacy
- Reading history opt-in.
- Minors protections configurable.
- Data retention policies.

---

## 13) Reliability, observability, and operations

### 13.1 SLOs
- Checkout p95 (perceived): <= 400ms
- Catalog search p95: <= 2s
- Patron search p95: <= 1s

### 13.2 Observability
- Request IDs everywhere
- Structured logs
- Metrics and tracing
- Per-tenant dashboards

### 13.3 Backups + restores
- Automated backups
- Quarterly restore drills
- Tenant-level export


### 13.4 Runbook: dev vs production (how to run + how to log in)

Principles:
- Dev and production must behave the same for auth, workstation, and core workflows.
- Differences are limited to: hot reload, debug logging, and cookie Secure defaults.

Dev (stacksos VM):
- Start: `cd ~/projects/stacksos && npm run dev -- -H 0.0.0.0 -p 3000`
- URL:
  - From the LAN (recommended): `https://<stacksos-ip>/login` (via Caddy)
  - From the StacksOS host: `http://127.0.0.1:3000/login`
- Login: Evergreen staff user credentials (username/password).
- Notes:
  - Next.js shows a small dev indicator ("N") in the corner in dev mode.
  - Changes apply live; restart only if the dev server is wedged.

Legacy production (LAN HTTP, no TLS) (not recommended):
- Start: `cd ~/projects/stacksos && npm run build`
- Then: `STACKSOS_COOKIE_SECURE=false npm run start -- -H 0.0.0.0 -p 3000`
- URL: `http://<stacksos-ip>:3000/login`
- Login: same Evergreen staff user.
- Notes:
  - In production mode, session cookies default to `Secure` when `STACKSOS_COOKIE_SECURE=true` (recommended).
  - On plain HTTP, browsers drop `Secure` cookies.
  - Only use this mode for short-lived LAN-only experiments. Prefer HTTPS reverse proxy.

Production (recommended: behind HTTPS reverse proxy):
- Put Nginx/Caddy in front of StacksOS and terminate TLS.
- Start: `npm run build && npm run start -- -H 127.0.0.1 -p 3000` (no cookie override).
- Set:
  - `STACKSOS_BASE_URL=https://...`
  - `STACKSOS_COOKIE_SECURE=true`
  - (Optional) `STACKSOS_CSP_REPORT_ONLY=true` while tuning CSP

Configuration:
- StacksOS points at Evergreen via `EVERGREEN_BASE_URL` in `.env.local`.
- Staff accounts live in Evergreen; StacksOS does not have its own user DB in P0.
- Workstation context is auto-registered per device+branch on first login (if permitted).

---

## 14) Testing strategy

### 14.1 Contract tests
- Golden-path and edge-case coverage for Evergreen adapter.

### 14.2 End-to-end tests
- Playwright tests for scan workflows.

### 14.3 Performance testing
- Load test checkout/checkin/search endpoints.

---

## 15) Execution backlog (P0/P1/P2) + definition of done

The detailed backlog and parity matrix live in:
- `docs/StacksOS-Execution-Backlog.md`
- `docs/StacksOS-Parity-Matrix.md`

Definition of done (global):
- No dead UI: no buttons that do nothing; incomplete features are hidden behind feature flags.
- All state transitions are real (no fake saves).
- Audit event emitted for sensitive operations.
- Accessibility checks pass for the workflow.

---



## 16) Implementation, training, and support

StacksOS wins long-term only if libraries can adopt it safely.
This section defines the non-negotiables for onboarding, migration, training, and support.

### 16.1 Implementation system (P0/P1)
Deliverables:
- Migration playbooks per vendor (Polaris/Sierra/Symphony/Koha/Evergreen/Destiny/Surpass/Alexandria/FOLIO/Alma).
- Data mapping templates (CSV/JSON) + validation rules.
- Dry-run importer + reconciliation report.
- Cutover plan templates:
  - parallel-run option
  - freeze windows
  - rollback plan

Acceptance criteria:
- IMPL-001: A library can complete a dry-run migration with a repeatable script and a reconciliation report.
- IMPL-002: Any data rejected by the importer has a reason and a suggested fix.

### 16.2 Training system (P0)
Deliverables:
- Role-based onboarding:
  - circulation staff
  - supervisors
  - catalogers
  - acquisitions staff
  - directors/admins
- In-app guided walkthroughs for top workflows (checkout/checkin/holds/bills/search).
- Printable quick-reference sheets (keyboard map, barcode scanning rules).

Acceptance criteria:
- TRAIN-001: A new circulation staff user can perform checkout/checkin/holds without external help in < 30 minutes.
- TRAIN-002: Training materials are versioned alongside the product.

### 16.3 Support + ops readiness (P1)
Deliverables:
- Support intake:
  - in-app “Report an issue” (captures request id, workstation, org id)
  - email support channel
- Incident response:
  - severity levels
  - on-call rotation (internal)
  - public status page
- Release notes:
  - visible inside the app
  - per-tenant upgrade windows

Acceptance criteria:
- SUP-001: Every support ticket includes sufficient context to reproduce.
- SUP-002: Production incidents have documented postmortems and action items.


## 17) AI differentiators (P2) + safety model

StacksOS is AI-first, but AI must never reduce trust.
Every AI feature must be:
- auditable (store inputs/outputs + model/version + who accepted)
- reversible (no irreversible action without explicit human confirmation)
- permissioned (RBAC-gated per action + per data scope)
- privacy-safe (opt-in where required; tenant isolation; minimal retention)
- explainable (show why a suggestion was made; cite sources when applicable)

### 17.1 AI feature pillars

Staff copilots (high ROI):
- Explain policy blocks and suggest the next best action.
- Draft override notes (staff edits before saving).
- Summarize patron/account context for faster decision-making.

Cataloging copilots:
- Suggest subjects, summaries, and series normalization with provenance.
- Suggest de-dupe / merge candidates (human review required).

Discovery copilots:
- Hybrid search (keyword + semantic) with transparent ranking.
- Recommendations that are privacy-forward (opt-in reading history).

Analytics copilots:
- Narratives on top of real data ("what changed", "why might this be happening") with drill-down links.

### 17.2 Guardrails (non-negotiable)

- AI never executes a circulation/cataloging/acq mutation directly.
- AI suggestions are always presented as drafts with an explicit Confirm step.
- High-risk data access requires explicit scopes (tenant, branch, role, purpose).
- Prompt injection protection for any feature that ingests external content.

### 17.3 Ship-now AI (low-risk, high trust)

- AI-EXPLAIN-001: Policy explainability
  - Input: Evergreen event payloads + StacksOS context.
  - Output: human-readable explanation + allowed fixes/override path.
  - Must include the raw Evergreen error details in an expandable panel.

- AI-SEARCH-001: Query rewriting
  - Input: natural language query.
  - Output: structured Evergreen query (still executed by Evergreen search).

- AI-COPY-001: Notice drafting helpers
  - Assist staff writing clearer notice templates.
  - Never auto-send; always preview.

### 17.4 Medium-term AI (requires more data + evaluation)

- AI-CAT-010: Metadata enrichment (subjects/summaries) with citations.
- AI-RISK-010: Overdue/hold risk scoring with transparent factors.
- AI-QA-010: Anomaly detection (sudden holds spikes, stuck transits, billing drift).

### 17.5 High-risk / R&D (do not ship without rigorous evaluation)

- Vision-based shelf scanning.
- Fully autonomous acquisitions optimization.
- "Auto-merge" without human review.

### 17.6 Evaluation + rollout model

- Per-tenant feature flags.
- Offline eval sets for cataloging suggestions.
- A/B testing for discovery ranking (with privacy constraints).
- Audit log entries for AI-assisted actions:
  - ai.suggestion.created
  - ai.suggestion.accepted
  - ai.suggestion.rejected

## Appendix A) Competitive sources (doc-first)

This PRD is informed by primary sources where available.

- Evergreen documentation: https://docs.evergreen-ils.org/
- Koha manual: https://koha-community.org/manual/
- Innovative Sierra documentation hub: https://innovative.libguides.com/sierra
- Polaris staff help + LEAP docs: https://documentation.iii.com/
- SirsiDynix Symphony marketing: https://www.sirsidynix.com/symphony/
- SirsiDynix WorkFlows handbook (zip): https://www.sirsidynix.com/wp-content/uploads/2018/09/WorkFlows_Handbook.zip
- Ex Libris Alma documentation: https://knowledge.exlibrisgroup.com/Alma
- FOLIO docs: https://docs.folio.org/
- Follett Destiny help: https://destinyhelp.fsc.follett.com/
- Surpass Cloud docs: https://docs.surpass.cloud/
- Alexandria support: https://support.goalexandria.com/


---

## Appendix B) Competitive workflow notes (usable UX patterns)

These notes capture specific, concrete workflow/UX patterns from competitor documentation.
We use them to validate StacksOS requirements and avoid missing "table-stakes" behaviors.

### Polaris (Innovative)

- Checkout is a dedicated workform and is explicitly barcode-driven; documentation also references a function-key shortcut (F3) to open checkout. (D)
  - https://documentation.iii.com/polaris/7.1/PolarisStaffHelp/Patron_Services/PPckout/Check_out_an_item.htm
- Holds workform supports staff shortcuts (for example, hold placement from circulation workforms via Ctrl+H) and supports title-level and item-level holds. (D)
  - https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Patron_Services/PPholds/Place_single_or_consecutive_hold_requests.htm
  - https://documentation.iii.com/polaris/7.4/PolarisStaffHelp/Patron_Services/PPholds/Working_with_Hold_Requests.htm
- Requests-to-Fill (RTF) workflow exists with a request manager and printable pull list style report. (D)
  - https://documentation.iii.com/polaris/7.2/PolarisStaffHelp/Patron_Services/PPholds/Fill_hold_requests_for_Requests-To-Fill.htm
- Polaris explicitly documents that both the staff member and the workstation need appropriate permissions for circulation workflows. (D)
  - https://documentation.iii.com/polaris/7.4/PolarisStaffHelp/Patron_Services_Admin/PDPPermsRef/Circulation_and_Patron_Services_Workflow_Permissions.htm
- Receipt/slip printing is explicitly configured and documented (checkout/renewal receipts, items-out receipts, checkin receipts). (D)
  - https://documentation.iii.com/polaris/7.4/PolarisStaffHelp/Patron_Services_Admin/PDPreceipts/Setting_Up_Printed_Receipts.htm

StacksOS implication:
- Workstation context is not "outdated Evergreen weirdness"; it's an industry pattern.
- Keyboard mapping should be configurable per tenant, with sensible defaults.
- Pull-list and holds trapping must be first-class workflows.

### Symphony WorkFlows (SirsiDynix)

- WorkFlows provides extensive keyboard shortcut mappings for circulation, offline, acquisitions, holds, and reports. (D)
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/WFInterface/Toolbar_Keyboard_Shortcu.htm
- Holds logic references multilibrary constraints (hold libraries group / circulation map policies). (D)
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/07-Circulation/FAQs/FAQs___Understanding_Hol.htm

StacksOS implication:
- Keyboard-first is not optional; it's required to match desktop-client throughput.
- Multilibrary hold constraints must be explainable in the UI.

### Surpass Cloud

- Surpass Cloud documents Circulation Transactions as the main staff screen and lists core tasks: checkout, checkin, renew, holds, fines, patron status, lost/found, receipts. (D)
  - https://docs.surpass.cloud/docs/circulation
- Surpass documents ESC as a shortcut for switching patrons and includes a "recent patrons" pattern. (D)
  - https://docs.surpass.cloud/docs/circulation-patron-select

StacksOS implication:
- We should copy proven throughput UX patterns like "recent patrons" and fast patron switching.
- Alternate patron IDs and phone lookups are table stakes.

### Follett Destiny

- Destiny documents barcode-driven checkout to patron and circulation workflows. (D)
  - https://destinyhelp191en.fsc.follett.com/content/t_check_out_library.htm

StacksOS implication:
- K-12 competitors assume barcode-based transactions; StacksOS must support arbitrary barcode schemes for migrations.

### Alexandria

- Alexandria documents a command-driven, keyboard-heavy circulation model with explicit modes for checkout, bookdrop (bulk checkin), holds, fines/fees, and damage/lost handling. (D)
  - https://support.goalexandria.com/circulation/circulation-commands/

StacksOS implication:
- Bulk flows (bookdrop/bulk checkin) should be one keystroke away.
- "Command palette" can be a modern replacement for legacy command-line modes.


### Evergreen

- Evergreen requires workstation registration and documents workstation administration and offline circulation constraints. (D)
  - https://docs.evergreen-ils.org/docs/latest/admin/web_client-login.html
  - https://docs.evergreen-ils.org/docs/latest/admin/workstation_admin.html
  - https://docs.evergreen-ils.org/docs/latest/circulation/offline_circ_webclient.html
- Evergreen supports Barcode Completion rules (prefix/suffix/padding) to make barcode entry more tolerant and consistent. (D)
  - https://docs.evergreen-ils.org/docs/latest/admin/barcode_completion.html

StacksOS implication:
- Workstation/service-location is a real workflow primitive. We should make it seamless (auto-register, switch location).
- Barcode normalization and completion rules should be tenant-configurable.

### Koha

- Koha exposes system preferences for patron numbering generation and constraints (auto-increment + cardnumber length). (D)
  - https://koha-community.org/manual/latest/en/html/administrationpreferences.html

StacksOS implication:
- Barcode/profile rules must be first-class configuration (not hard-coded assumptions).

### Sierra (Innovative)

- Sierra documents patron verification workflows that include verifying patrons by barcode and other identifiers. (D)
  - https://help.iii.com/sierra/Content/sril/sril_patron_verify_patrons.htm
- Sierra documents offline circulation barcode validation behavior. (D)
  - https://help.iii.com/sierra/Content/sril/sril_offline_maintain_barcode_validation.htm
- Sierra documents patron record overlay by barcode (migration-critical behavior). (D)
  - https://help.iii.com/sierra/Content/sril/sril_patron_record_overlay_barcode.htm

StacksOS implication:
- Migration tooling must support deterministic merge/overlay rules and clear collision resolution.
- Offline mode must have explicit barcode rules and validation.

### Alma (Ex Libris)

- Alma documents circulation desk tasks (fulfillment workflows) and barcode-based operations. (D)
  - https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/030Fulfillment/040Circulation_Desk_Operations/Managing_Patron_Services_at_a_Circulation_Desk_-_New_Layout
- Alma documents user identifiers (including barcode) as part of managing users. (D)
  - https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/050Administration/030User_Management/010Managing_Users

StacksOS implication:
- Staff UX must stay fast even in enterprise contexts; identifiers and record editing must be reliable and auditable.

### FOLIO

- FOLIO documents check-out and check-in workflows (scan-first) in the circulation module docs. (D)
  - https://docs.folio.org/docs/getting-started/training/circulation/checking-out-items/
  - https://docs.folio.org/docs/getting-started/training/circulation/checking-in-items/

StacksOS implication:
- Even modern open platforms still rely on scan-first circulation; throughput and focus management are the differentiator.

### Barcode + migration patterns (cross-vendor)

Doc-backed patterns across vendors:
- Libraries expect to keep existing patron/item barcodes on migration.
- Many systems support multiple identifiers (alternate ID) and/or barcode completion/validation rules.
- Import tools often allow collision behavior choices (skip, overwrite/overlay, reassign).

StacksOS implication:
- Build a barcode profile engine + alias table and treat migration as a product surface.

### Acquisitions + serials (doc patterns)

These sources are used to prevent missing "table-stakes" acquisitions/serials workflows.

Polaris (Innovative):
- Vendor record creation: https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Acquisitions/PPACQ_Create_a_vendor_record.htm
- Fund record creation: https://documentation.iii.com/polaris/7.5/PolarisStaffHelp/Acquisitions/PPACQ_Create_a_fund_record.htm
- Purchase order creation: https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Acquisitions/PPACQ_Create_a_purchase_order.htm
- Receiving: https://documentation.iii.com/polaris/7.5/PolarisStaffHelp/Acquisitions/PPACQ_Receiving.htm
- Create/pay invoice: https://documentation.iii.com/polaris/7.2/PolarisStaffHelp/Acquisitions/PPACQ_Create_and_pay_an_invoice.htm
- Serials control/receive/claim: https://documentation.iii.com/polaris/7.2/PolarisStaffHelp/Serials/Control_serials.htm
  - https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Serials/Receive_serial_issues.htm
  - https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Serials/Claim_serial_issues.htm

Sierra (Innovative):
- Acquisitions vendor/fund/PO/receiving/invoices: https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_view_vendor_recs.htm
  - https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_create_fund_record.htm
  - https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_create_po.htm
  - https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_receive_orders.htm
  - https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_view_invoices.htm
- Serials check-in + claiming: https://documentation.iii.com/sierrahelp/Content/sgser/sgser_checkin_serial_issues.htm
  - https://documentation.iii.com/sierrahelp/Content/sgser/sgser_claiming_serials.htm

Symphony WorkFlows (SirsiDynix):
- Acquisitions: vendor/fund/PO/receiving/invoice: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/vendor_create.htm
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/fund_create.htm
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/purchase_order_wizard.htm
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/receive_order.htm
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/invoice_info_display.htm
- Serials: subscription/routing/check-in/claim: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/subscription_create.htm
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/routing_list.htm
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/serial_checkin.htm
  - https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/serial_claim.htm

Alma (Ex Libris):
- Acquisitions overview + infrastructure (vendors, funds/ledgers) + invoices: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/010Introduction_to_Acquisitions
  - https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/030Acquisitions_Infrastructure/010Managing_Vendors
  - https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/030Acquisitions_Infrastructure/020Managing_Funds_and_Ledgers
  - https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/020Invoicing/010Invoicing_Workflow
- Serials patterns + claiming: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/Physical_Resource_Management/016Managing_Physical_Resources/Prediction_Patterns
  - https://knowledge.exlibrisgroup.com/Alma/Product_Materials/050Alma_FAQs/Acquisitions/Claims

FOLIO:
- Create purchase order / receiving / invoices: https://docs.folio.org/docs/getting-started/training/acquisitions/creating-a-purchase-order/
  - https://docs.folio.org/docs/getting-started/training/acquisitions/receiving-items/
  - https://docs.folio.org/docs/getting-started/training/acquisitions/creating-an-invoice/

StacksOS implication:
- Acquisitions and serials must not be "afterthought" modules; they need the same throughput, explainability, and auditability as circulation.
- When data is missing due to Evergreen setup, the UI must show a clear "setup required" message, not empty tables with no explanation.
